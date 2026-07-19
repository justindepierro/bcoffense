-- Phase 0.5: quarantine any active diagram pointer that predates the
-- checksum-verified, tenant-scoped canonical data plane.
--
-- Migration 0012 intentionally leaves legacy media_manifests as recovery
-- evidence. This defensive follow-up handles an early preview deployment that
-- may already have copied legacy rows into team_media_manifests. It deletes
-- only the D1 pointer, never the R2 bytes, so the admin recovery flow can
-- checksum-verify and promote the exact object later.

DELETE FROM team_media_manifests
WHERE kind = 'diagram'
  AND (
    trim(checksum) = ''
    OR length(trim(checksum)) <> 64
    OR lower(trim(content_type)) NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR r2_key NOT LIKE 'media/teams/%/plays/%/diagram/%'
  );
