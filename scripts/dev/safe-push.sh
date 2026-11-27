#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source "$script_dir/git-guard.sh"
[[ $# == 0 ]] || fail 'Usage: safe-push.sh'
# Explicit refspec; no merge, rebase, force, tags, or other branches.
git -c fetch.prune=false fetch --no-tags origin \
  refs/heads/automation-ci-cd:refs/remotes/origin/automation-ci-cd || {
    # First publication is allowed only when the remote branch truly does not exist.
    remote_refs=$(git ls-remote --heads origin refs/heads/automation-ci-cd) || fail 'Cannot inspect remote'
    [[ -z "$remote_refs" ]] || fail 'Fetch failed for existing remote branch'
  }
remote_refs=$(git ls-remote --heads origin refs/heads/automation-ci-cd) || fail 'Cannot inspect remote'
if [[ -n "$remote_refs" ]]; then
  upstream=${remote_refs%%[[:space:]]*}
  git cat-file -e "$upstream^{commit}" || fail 'Remote changed after fetch; retry'
  git merge-base --is-ancestor "$upstream" HEAD || fail 'Remote is ahead or diverged; resolve manually'
fi
git -c push.followTags=false -c remote.origin.mirror=false push origin \
  refs/heads/automation-ci-cd:refs/heads/automation-ci-cd
