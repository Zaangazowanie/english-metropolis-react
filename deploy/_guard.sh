# Sourced by every deploy/*.sh. A deploy must describe a commit, never a pile of edits.
guard_clean_prod() {
  local repo=$1
  local branch; branch=$(git -C "$repo" branch --show-current)
  if [ "$branch" != "prod" ]; then echo "!! $repo is on '$branch', deploys run from prod only"; exit 1; fi
  if [ -n "$(git -C "$repo" status --porcelain)" ]; then
    echo "!! $repo has uncommitted changes. Commit them first (git add -A && git commit), then deploy:"
    git -C "$repo" status --short | head -20; exit 1
  fi
  echo "  tree clean on prod @ $(git -C "$repo" log --oneline -1 | cut -c1-60)"
}
push_prod() { git -C "$1" push -q origin prod && echo "  pushed prod to origin"; }
