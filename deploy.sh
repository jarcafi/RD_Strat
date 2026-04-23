#!/usr/bin/env zsh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

EXPECTED_REPO_NAME="RD_Strat"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "${RED}❌ Not inside a git repository.${NC}" >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "${YELLOW}Usage: deploy \"commit message\"${NC}" >&2
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MSG="$*"

if [ "$REPO_NAME" != "$EXPECTED_REPO_NAME" ]; then
  echo "${RED}❌ Safety stop: expected repo '${EXPECTED_REPO_NAME}', got '${REPO_NAME}'.${NC}" >&2
  exit 1
fi

if [ "$SCRIPT_DIR" != "$REPO_ROOT" ]; then
  echo "${RED}❌ Safety stop: script must run from ${EXPECTED_REPO_NAME} root.${NC}" >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "${RED}❌ No git remote named 'origin' configured.${NC}" >&2
  echo "   Set it first: ${YELLOW}git remote add origin <url>${NC}"
  exit 1
fi

if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "${RED}❌ Single-branch workflow only. Switch to 'main' first.${NC}" >&2
  echo "   Run: ${YELLOW}git checkout main${NC}"
  exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "${YELLOW}ℹ️  No changes to commit.${NC}"
  exit 0
fi

echo "${BLUE}📦 Staging all changes...${NC}"
git add -A

echo "${BLUE}💾 Committing: ${NC}${COMMIT_MSG}"
git commit -m "$COMMIT_MSG"

echo "${BLUE}🚀 Pushing to origin/main...${NC}"
git push origin main

echo ""
echo "${GREEN}✔ Backup push completed for ${REPO_NAME}.${NC}"
