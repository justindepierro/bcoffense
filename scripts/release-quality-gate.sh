#!/usr/bin/env bash
# Release gate shared by CI and production deployment. Do not add bypass flags:
# a release must satisfy every check that CI marks as required.
set -euo pipefail

cd "$(dirname "$0")/.."

npm run audit:globals
node tests/fresh-schema-login-rate-limit.test.mjs
node tests/critical-d1-schema-contract.test.mjs
node tests/admin-bootstrap-contract.test.mjs
node tests/admin-bootstrap-runtime.test.mjs
npm run test:quality
