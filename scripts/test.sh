#!/usr/bin/env bash
# Local equivalent of CI (.github/workflows/ci-pr.yml): lint + tests + build.
#
# Lint is run ONLY against files changed vs origin/develop (plus any working-tree
# diffs), because the repo carries a large pre-existing lint baseline that isn't
# our concern on a per-PR basis. Tests and build run in full — they're fast and
# either pass or don't.
#
# Each step runs to completion regardless of earlier failures, so one pass
# surfaces every problem. The summary at the end is the source of truth; scroll
# up to read the actual output.
#
# Usage:
#   scripts/test.sh           # diff-aware lint (default)
#   scripts/test.sh --all     # full lint over the whole repo (matches CI)

set -u

cd "$(dirname "$0")/.."

LINT_MODE="diff"
for arg in "$@"; do
  case "$arg" in
    --all) LINT_MODE="all" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

bold()  { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
divider() { printf '\n\033[2m%s\033[0m\n' "─────────────────────────────────────────"; }
tick()  { printf '\033[32m✓\033[0m'; }
cross() { printf '\033[31m✗\033[0m'; }
skip()  { printf '\033[33m⊘\033[0m'; }

lint_rc=0
test_rc=0
build_rc=0
lint_status="ran"

# ── Lint ─────────────────────────────────────────────────────────────────────
bold "Lint"
if [ "$LINT_MODE" = "all" ]; then
  echo "  Mode: full repo (matches CI)"
  npm run lint || lint_rc=$?
else
  echo "  Mode: changed files only (vs origin/develop + working tree)"
  BASE=$(git merge-base HEAD origin/develop 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo "")
  COMMITTED=""
  if [ -n "$BASE" ]; then
    COMMITTED=$(git diff --name-only --diff-filter=AM "$BASE"...HEAD -- '*.js' '*.jsx' '*.ts' '*.tsx' 2>/dev/null || true)
  fi
  UNSTAGED=$(git diff --name-only --diff-filter=AM -- '*.js' '*.jsx' '*.ts' '*.tsx' 2>/dev/null || true)
  STAGED=$(git diff --cached --name-only --diff-filter=AM -- '*.js' '*.jsx' '*.ts' '*.tsx' 2>/dev/null || true)
  CHANGED=$(printf '%s\n%s\n%s\n' "$COMMITTED" "$UNSTAGED" "$STAGED" | sort -u | grep -v '^$' || true)
  if [ -z "$CHANGED" ]; then
    echo "  No JS/TS file changes detected — nothing to lint."
    lint_status="skipped"
  else
    echo "  Files:"
    echo "$CHANGED" | sed 's/^/    /'
    echo
    # shellcheck disable=SC2086
    npx eslint $CHANGED || lint_rc=$?
  fi
fi

# ── Tests ────────────────────────────────────────────────────────────────────
bold "Tests"
npm test || test_rc=$?

# ── Build ────────────────────────────────────────────────────────────────────
bold "Build"
npm run build || build_rc=$?

# ── Summary ──────────────────────────────────────────────────────────────────
divider
printf '\033[1mSummary\033[0m\n\n'

report() {
  local name="$1" rc="$2" extra="${3:-}"
  if [ "$rc" -eq 0 ]; then
    printf "  "; tick; printf "  %-8s" "$name"
  else
    printf "  "; cross; printf "  %-8s (exit %d)" "$name" "$rc"
  fi
  [ -n "$extra" ] && printf "  %s" "$extra"
  printf "\n"
}

if [ "$lint_status" = "skipped" ]; then
  printf "  "; skip; printf "  %-8s  no changed files\n" "Lint"
elif [ "$LINT_MODE" = "all" ]; then
  report "Lint" "$lint_rc" "full repo"
else
  report "Lint" "$lint_rc" "changed files only"
fi
report "Tests" "$test_rc"
report "Build" "$build_rc"
echo

exit $((lint_rc + test_rc + build_rc))
