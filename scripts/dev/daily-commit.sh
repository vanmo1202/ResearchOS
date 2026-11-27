#!/usr/bin/env bash
set -euo pipefail
# No remote operation is performed here. The separate safe-push.sh is manual.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source "$script_dir/git-guard.sh"
dry_run=false
case ${1:-} in
  '') [[ $# == 0 ]] || fail 'Unexpected arguments' ;;
  --dry-run) [[ $# == 1 ]] || fail 'Unexpected arguments'; dry_run=true ;;
  *) fail 'Usage: daily-commit.sh [--dry-run]' ;;
esac
git diff --cached --quiet || fail 'Existing staged changes; finish or unstage them manually'
today=$(date +%F)
message="chore(daily): ResearchOS update $today"
# A local durable marker survives later history edits; history survives marker removal.
state_dir="$git_dir/researchos-daily"
if [[ -e "$state_dir/$today" ]] || git log --format=%s HEAD | grep -Fx "$message" >/dev/null; then
  printf 'ALREADY COMMITTED %s\n' "$today"
  exit 0
fi
# The policy produces NUL-delimited literal paths, never shell patterns.
paths_file=$(mktemp "$git_dir/researchos-paths.XXXXXX")
index_file=$(mktemp "$git_dir/researchos-index.XXXXXX")
cleanup() { rm -f -- "$paths_file" "$index_file" "$index_file.lock"; }
trap cleanup EXIT
python3 "$script_dir/commit-policy.py" paths >"$paths_file"
[[ -s "$paths_file" ]] || { printf 'NO CHANGES\n'; exit 0; }
head_before=$(git rev-parse HEAD)
# Isolated index: rejected secrets, whitespace and dry-runs never alter developer staging.
GIT_INDEX_FILE="$index_file" git read-tree HEAD
GIT_INDEX_FILE="$index_file" git --literal-pathspecs add --pathspec-from-file="$paths_file" --pathspec-file-nul
GIT_INDEX_FILE="$index_file" python3 "$script_dir/commit-policy.py" scan
GIT_INDEX_FILE="$index_file" git diff --cached --check
if GIT_INDEX_FILE="$index_file" git diff --cached --quiet; then
  printf 'NO CHANGES\n'; exit 0
fi
if "$dry_run"; then
  printf 'DRY RUN: eligible changes validated; no staging or commit\n'; exit 0
fi
# Refuse a concurrently changed HEAD/index rather than including somebody else's work.
[[ $(git rev-parse HEAD) == "$head_before" ]] || fail 'HEAD changed during validation'
git diff --cached --quiet || fail 'Index changed during validation'
git --literal-pathspecs add --pathspec-from-file="$paths_file" --pathspec-file-nul
python3 "$script_dir/commit-policy.py" scan
git diff --cached --check
# Ensure files did not change between the two snapshots. On failure leave staging for review.
[[ $(git write-tree) == $(GIT_INDEX_FILE="$index_file" git write-tree) ]] || fail 'Files changed during validation; review staging'
git commit -m "$message"
mkdir -p "$state_dir"
printf '%s\n' "$(git rev-parse HEAD)" >"$state_dir/$today"
printf 'DAILY COMMIT CREATED %s (local only)\n' "$today"
