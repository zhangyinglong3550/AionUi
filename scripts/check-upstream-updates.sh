#!/usr/bin/env bash
# 检查 iOfficeAI/AionUi 官方是否有新 commit / release，便于触发 merge。
set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-iOfficeAI/AionUi}"
FORK_DIR="${FORK_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG="${AIONUI_UPSTREAM_LOG:-$HOME/file/grok/aionui-upstream-check.log}"
mkdir -p "$(dirname "$LOG")"

cd "$FORK_DIR"

# Ensure origin points at upstream or use remote name
REMOTE="${UPSTREAM_REMOTE:-origin}"
if git remote get-url fork >/dev/null 2>&1; then
  # Prefer named upstream if present
  if git remote get-url upstream >/dev/null 2>&1; then
    REMOTE=upstream
  elif [[ "$(git remote get-url origin 2>/dev/null)" == *"iOfficeAI/AionUi"* ]]; then
    REMOTE=origin
  fi
fi

echo "==== $(date '+%Y-%m-%d %H:%M:%S') ====" | tee -a "$LOG"
echo "repo=$FORK_DIR remote=$REMOTE upstream_github=$UPSTREAM_REPO" | tee -a "$LOG"

git fetch "$REMOTE" --tags 2>&1 | tail -5 | tee -a "$LOG" || true
git fetch "$REMOTE" main 2>&1 | tail -3 | tee -a "$LOG" || git fetch "$REMOTE" master 2>&1 | tail -3 | tee -a "$LOG" || true

LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOCAL_SHA="$(git rev-parse HEAD)"
echo "local_branch=$LOCAL_BRANCH sha=$LOCAL_SHA" | tee -a "$LOG"

MAIN_REF=""
if git rev-parse --verify "$REMOTE/main" >/dev/null 2>&1; then
  MAIN_REF="$REMOTE/main"
elif git rev-parse --verify "$REMOTE/master" >/dev/null 2>&1; then
  MAIN_REF="$REMOTE/master"
fi

if [[ -n "$MAIN_REF" ]]; then
  AHEAD="$(git rev-list --count HEAD.."$MAIN_REF" 2>/dev/null || echo 0)"
  BEHIND="$(git rev-list --count "$MAIN_REF"..HEAD 2>/dev/null || echo 0)"
  echo "vs $MAIN_REF: commits_to_merge=$AHEAD our_unique=$BEHIND" | tee -a "$LOG"
  if [[ "${AHEAD:-0}" -gt 0 ]]; then
    echo "STATUS=UPSTREAM_AHEAD 官方有新提交，建议 merge" | tee -a "$LOG"
    git log --oneline "HEAD..$MAIN_REF" | head -15 | tee -a "$LOG"
  else
    echo "STATUS=UP_TO_DATE 相对 $MAIN_REF 无待合并提交" | tee -a "$LOG"
  fi
else
  echo "STATUS=NO_MAIN_REF 找不到 $REMOTE/main" | tee -a "$LOG"
fi

# Latest GitHub release
if command -v gh >/dev/null 2>&1; then
  echo "--- latest releases ---" | tee -a "$LOG"
  gh release list -R "$UPSTREAM_REPO" --limit 3 2>&1 | tee -a "$LOG" || true
  LATEST="$(gh release view -R "$UPSTREAM_REPO" --json tagName,publishedAt,name -q '.tagName + " | " + .publishedAt + " | " + .name' 2>/dev/null || true)"
  echo "latest_release=$LATEST" | tee -a "$LOG"
  STATE_FILE="$HOME/file/grok/aionui-upstream-last-release.txt"
  PREV=""
  [[ -f "$STATE_FILE" ]] && PREV="$(cat "$STATE_FILE")"
  if [[ -n "$LATEST" && "$LATEST" != "$PREV" ]]; then
    echo "STATUS=NEW_RELEASE 发现新官方 Release（相对上次记录）" | tee -a "$LOG"
    echo "$LATEST" > "$STATE_FILE"
  fi
fi

echo "log=$LOG" | tee -a "$LOG"
echo "done."
