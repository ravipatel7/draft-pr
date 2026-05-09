#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

BASE_BRANCH="${1:-main}"

fail() { echo -e "${RED}✗ $1${NC}"; echo "  Fix: $2"; exit 1; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }

git rev-parse --git-dir > /dev/null 2>&1 || \
  fail "Not inside a git repo" "Run this from your project root"

command -v gh > /dev/null 2>&1 || \
  fail "gh CLI not found" "Install from https://cli.github.com then run: gh auth login"

gh auth status > /dev/null 2>&1 || \
  fail "gh CLI not authenticated" "Run: gh auth login"

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
[[ "$BRANCH" == "$BASE_BRANCH" ]] && \
  fail "You are on the base branch '$BASE_BRANCH'" \
  "Create a feature branch first: git checkout -b feat/my-change"

git ls-remote --exit-code origin "$BRANCH" > /dev/null 2>&1 || \
  warn "Branch '$BRANCH' not pushed yet. Run: git push -u origin HEAD"

ok "git repo detected (branch: $BRANCH)"
ok "gh CLI authenticated"
ok "Base branch: $BASE_BRANCH"
