#!/usr/bin/env bash
# Shared guard. Source this file; never execute it as an automation entry point.
set -euo pipefail
export TZ=Asia/Ho_Chi_Minh
export GIT_TERMINAL_PROMPT=0
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
expected_repo=/home/vanmo/projects/ResearchOS
expected_remote=https://github.com/vanmo1202/ResearchOS.git
[[ $(pwd -P) == "$expected_repo" ]] || fail 'Wrong working directory'
[[ $(git rev-parse --show-toplevel) == "$expected_repo" ]] || fail 'Wrong repository'
[[ $(git symbolic-ref --quiet --short HEAD) == automation-ci-cd ]] || fail 'Wrong branch or detached HEAD'
# Reject alternate Git directories/indexes/configuration injected by the caller.
for variable in GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG_COUNT; do
  [[ ! -v $variable ]] || fail 'Git environment override is not allowed'
done
mapfile -t fetch_urls < <(git remote get-url --all origin)
mapfile -t push_urls < <(git remote get-url --push --all origin)
[[ ${#fetch_urls[@]} == 1 && ${#push_urls[@]} == 1 ]] || fail 'Expected a single origin URL'
[[ ${fetch_urls[0]} == "$expected_remote" && ${push_urls[0]} == "$expected_remote" ]] || fail 'Wrong origin URL'
git_dir=$(git rev-parse --absolute-git-dir)
exec 9>"$git_dir/researchos-automation.lock"
flock -n 9 || fail 'LOCKED: another automation process is running'
for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG rebase-merge rebase-apply sequencer index.lock; do
  [[ ! -e "$git_dir/$marker" ]] || fail 'Git operation or index lock in progress'
done
[[ -z $(git ls-files -u) ]] || fail 'Unresolved conflicts'
