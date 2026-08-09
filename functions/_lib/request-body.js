// Small bounded request-body helpers for privileged Pages Function routes.
//
// Request.json() and Request.formData() buffer an entire body before a route
// can validate it. These helpers read the stream with a hard byte ceiling
// first, then parse the finite copy. Routes own their user-facing error text.

export class RequestBodyError extends Error {
  constructor(message, status = 400, code = "invalid_request_body") {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
    this.code = code;
  }
}

export function isPlainRequestObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireMaxBytes(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive safe integer.");
  }
  return maxBytes;
}

function advertisedLengthExceeds(request, maxBytes) {
  const raw = String(request?.headers?.get("content-length") || "").trim();
  if (!/^\d+$/.test(raw)) return false;
  const parsed = Number(raw);
  return !Number.isSafeInteger(parsed) || parsed > maxBytes;
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch (_) {
    // The route is already rejecting this request. Cancellation is a best
    // effort to avoid reading any remaining bytes from a hostile stream.
  }
}

/** Read a request body into a finite Uint8Array, rejecting oversize streams. */
export async function readBoundedBodyBytes(request, { maxBytes }) {
  const limit = requireMaxBytes(maxBytes);
  if (advertisedLengthExceeds(request, limit)) {
    throw new RequestBodyError("Request body is too large.", 413, "body_too_large");
  }

  const body = request?.body;
  if (!body) return new Uint8Array(0);

  let reader;
  try {
    reader = body.getReader();
  } catch (_) {
    throw new RequestBodyError("Could not read request body.", 400, "body_unavailable");
  }

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new RequestBodyError("Could not read request body.", 400, "body_unavailable");
      }
      size += value.byteLength;
      if (size > limit) {
        await cancelReader(reader);
        throw new RequestBodyError("Request body is too large.", 413, "body_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Could not read request body.", 400, "body_unavailable");
  } finally {
    try { reader.releaseLock(); } catch (_) { /* already cancelled or released */ }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_) {
    throw new RequestBodyError("Request body must be valid UTF-8.", 400, "invalid_encoding");
  }
}

/** Read one finite JSON object without using unbounded request.json(). */
export async function readBoundedJsonObject(request, { maxBytes, allowEmpty = false }) {
  const bytes = await readBoundedBodyBytes(request, { maxBytes });
  if (!bytes.byteLength) {
    if (allowEmpty) return {};
    throw new RequestBodyError("A JSON request body is required.", 400, "missing_body");
  }

  let value;
  try {
    value = JSON.parse(decodeUtf8(bytes));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Invalid JSON.", 400, "invalid_json");
  }
  if (!isPlainRequestObject(value)) {
    throw new RequestBodyError("Request JSON must be an object.", 400, "invalid_object");
  }
  return value;
}

/** Read a finite text-only HTML form without using unbounded request.formData(). */
export async function readBoundedFormObject(request, { maxBytes, allowEmpty = false }) {
  const bytes = await readBoundedBodyBytes(request, { maxBytes });
  if (!bytes.byteLength && !allowEmpty) {
    throw new RequestBodyError("A form request body is required.", 400, "missing_body");
  }

  const contentType = String(request?.headers?.get("content-type") || "").trim();
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(contentType)) {
    throw new RequestBodyError("A supported form request body is required.", 400, "unsupported_form");
  }

  let form;
  try {
    // Parse a new Request backed only by the bounded byte copy, never the
    // original incoming stream. Multipart remains supported for compatibility,
    // but privileged text-only routes reject File values below.
    form = await new Request("https://bcoffense.invalid/request-body", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    }).formData();
  } catch (_) {
    throw new RequestBodyError("Invalid form request body.", 400, "invalid_form");
  }

  const value = Object.create(null);
  for (const [key, field] of form.entries()) {
    if (typeof field !== "string") {
      throw new RequestBodyError("Form fields must be text.", 400, "invalid_form_field");
    }
    // Object.fromEntries(formData) historically kept the final duplicate key.
    value[key] = field;
  }
  return value;
}

/** Preserve current JSON-or-form route behavior while bounding either format. */
export async function readBoundedJsonOrFormObject(request, options) {
  const contentType = String(request?.headers?.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return readBoundedJsonObject(request, options);
  }
  return readBoundedFormObject(request, options);
}
