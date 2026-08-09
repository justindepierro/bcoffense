#!/usr/bin/env bash
# Produce a reviewable source archive from a clean Git commit, never from the
# working tree. This deliberately excludes untracked local artifacts such as
# D1 backups, Wrangler state, environment files, and test output.
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  printf 'Usage: %s [--output /absolute/or/relative/path.tar.gz] [<git-revision>]\n' "$0" >&2
  exit 1
}

revision="HEAD"
output=""
while (($#)); do
  case "$1" in
    --output)
      (($# >= 2)) || usage
      output="$2"
      shift 2
      ;;
    -h|--help) usage ;;
    *)
      [[ "$revision" == "HEAD" ]] || usage
      revision="$1"
      shift
      ;;
  esac
done

git rev-parse --verify "${revision}^{commit}" >/dev/null
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Refusing to package a dirty working tree. Commit, stash, or discard local changes first.\n' >&2
  exit 1
fi

commit="$(git rev-parse "${revision}^{commit}")"
short_commit="${commit:0:12}"
prefix="bcoffense-source-${short_commit}/"
if [[ -z "$output" ]]; then
  output="${TMPDIR:-/tmp}/${prefix%/}.tar.gz"
fi
output="$(python3 -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' "$output")"
mkdir -p "$(dirname "$output")"

tmp_archive="$(mktemp "${TMPDIR:-/tmp}/bcoffense-source.XXXXXX.tar")"
trap 'rm -f "$tmp_archive"' EXIT
git archive --format=tar --prefix="$prefix" "$commit" > "$tmp_archive"

forbidden='(^|/)(\.git($|/)|\.wrangler($|/)|\.dev\.vars$|\.env[^/]*$|.*\.backup$|.*\.(sqlite|sqlite3|db)$|node_modules($|/)|test-results($|/)|playwright-report($|/)|screenshots($|/)|\.stress-[^/]+($|/)|\.mobile-debug($|/))'
archive_paths="$(tar -tf "$tmp_archive")"
forbidden_paths="$(printf '%s\n' "$archive_paths" | grep -E "$forbidden" | grep -Ev '(^|/)\.env(\.test)?\.example$' || true)"
if [[ -n "$forbidden_paths" ]]; then
  printf 'Refusing to create an archive containing a forbidden operational artifact:\n' >&2
  printf '%s\n' "$forbidden_paths" >&2
  exit 1
fi

expected_paths="$(git ls-tree -r --name-only "$commit" | sed "s#^#${prefix}#")"
actual_paths="$(printf '%s\n' "$archive_paths" | sed '/\/$/d' | LC_ALL=C sort)"
if ! diff -u <(printf '%s\n' "$expected_paths" | LC_ALL=C sort) <(printf '%s\n' "$actual_paths") >/dev/null; then
  printf 'Archive verification failed: its files do not exactly match Git commit %s.\n' "$commit" >&2
  exit 1
fi

gzip -9 -c "$tmp_archive" > "$output"
gzip -t "$output"
printf 'Created verified source archive: %s\nCommit: %s\n' "$output" "$commit"
