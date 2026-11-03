#!/usr/bin/env bash
# 在**服务器上**执行的发布脚本，由 scripts/deploy/deploy.sh 通过 SSH 调用：
#   bash --noprofile --norc -s -- <产物包> <commit> <APP_DIR>
#
# 步骤：校验产物 → 备份现有 dist → 依赖变更时安装 → 原子切换 dist → 重启 → 健康检查。
# 健康检查不通过会自动回滚到发布前的 dist 与 lock 文件。
set -euo pipefail

PKG=${1:?用法: remote-deploy.sh <tar包> <commit> [APP_DIR]}
COMMIT=${2:-unknown}
APP_DIR=${3:-/www/wwwroot/anime-chat}

DEPLOY_ROOT=/www/wwwroot/.anime-chat-deploy
RELEASES="$DEPLOY_ROOT/releases"
KEEP_RELEASES=5
SERVICE=anime-chat-server
HEALTH_URL=http://127.0.0.1:3000/api/playback/health/qb
HEALTH_TIMEOUT=45

STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE="$RELEASES/$STAMP-$COMMIT"
STAGE="$DEPLOY_ROOT/staging-$STAMP"

log() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cleanup() {
  rm -rf "$STAGE"
  rm -f "$PKG"
}
trap cleanup EXIT

# ---------- 0. 校验 ----------
[ -f "$PKG" ] || die "找不到产物包 $PKG"
[ -d "$APP_DIR" ] || die "项目目录不存在：$APP_DIR"

mkdir -p "$DEPLOY_ROOT" "$RELEASES" "$RELEASE" "$STAGE"
tar tzf "$PKG" >/dev/null 2>&1 || die "产物包损坏，无法解压"
tar xzf "$PKG" -C "$STAGE"
[ -f "$STAGE/client/dist/index.html" ] || die "产物缺少 client/dist/index.html"
[ -f "$STAGE/server/dist/main.js" ] || die "产物缺少 server/dist/main.js"

PNPM=$(command -v pnpm || true)
if [ -z "$PNPM" ] && [ -x /usr/local/bin/pnpm ]; then PNPM=/usr/local/bin/pnpm; fi

OLD_LOCK=""
if [ -f "$APP_DIR/server/pnpm-lock.yaml" ]; then
  OLD_LOCK=$(sha256sum "$APP_DIR/server/pnpm-lock.yaml" | cut -d' ' -f1)
fi
NEW_LOCK=$(sha256sum "$STAGE/server/pnpm-lock.yaml" | cut -d' ' -f1)
NEED_INSTALL=false
[ "$OLD_LOCK" != "$NEW_LOCK" ] && NEED_INSTALL=true

log "发布 commit ${COMMIT}（备份目录：${RELEASE}）"

# ---------- 1. 备份 ----------
if [ -d "$APP_DIR/client/dist" ]; then
  cp -a "$APP_DIR/client/dist" "$RELEASE/client-dist"
fi
if [ -d "$APP_DIR/server/dist" ]; then
  cp -a "$APP_DIR/server/dist" "$RELEASE/server-dist"
fi
cp -a "$APP_DIR/server/pnpm-lock.yaml" "$RELEASE/server-pnpm-lock.yaml" 2>/dev/null || true
cp -a "$APP_DIR/server/package.json" "$RELEASE/server-package.json" 2>/dev/null || true

restore_lock() {
  [ -f "$RELEASE/server-pnpm-lock.yaml" ] &&
    cp "$RELEASE/server-pnpm-lock.yaml" "$APP_DIR/server/pnpm-lock.yaml" || true
  [ -f "$RELEASE/server-package.json" ] &&
    cp "$RELEASE/server-package.json" "$APP_DIR/server/package.json" || true
}

# ---------- 2. 依赖 ----------
if [ "$NEED_INSTALL" = true ]; then
  log "依赖文件有变化，同步 lock/package 并安装依赖"
  cp "$STAGE/server/package.json" "$APP_DIR/server/package.json"
  cp "$STAGE/server/pnpm-lock.yaml" "$APP_DIR/server/pnpm-lock.yaml"
  if [ -z "$PNPM" ]; then
    restore_lock
    die "服务器上找不到 pnpm，无法安装依赖（线上未变更）"
  fi
  if ! (cd "$APP_DIR/server" && "$PNPM" install --frozen-lockfile); then
    restore_lock
    die "依赖安装失败，已恢复 lock 文件（线上未变更）"
  fi
  ok "依赖安装完成"
else
  # lock 没变也要同步 package.json，保证与本次构建一致
  cp "$STAGE/server/package.json" "$APP_DIR/server/package.json"
  log "依赖未变化，跳过安装"
fi

# ---------- 3. 原子切换 dist ----------
swap_dist() {
  local src=$1 dst=$2
  rm -rf "$dst.new" "$dst.old"
  cp -a "$src" "$dst.new"
  # 产物可能带着构建机/打包机的属主，统一归 root，权限放行读+执行
  chown -R root:root "$dst.new"
  chmod -R a+rX "$dst.new"
  # 清掉 macOS 打包可能残留的 AppleDouble 文件
  find "$dst.new" -name '._*' -delete
  if [ -d "$dst" ]; then mv "$dst" "$dst.old"; fi
  mv "$dst.new" "$dst"
  rm -rf "$dst.old"
}

log "切换前端产物"
if ! swap_dist "$STAGE/client/dist" "$APP_DIR/client/dist"; then
  warn "前端产物切换失败"
  exit 1
fi
log "切换后端产物"
if ! swap_dist "$STAGE/server/dist" "$APP_DIR/server/dist"; then
  die "后端产物切换失败"
fi

# ---------- 4. 重启与健康检查 ----------
wait_healthy() {
  local start=$SECONDS code
  while ((SECONDS - start < HEALTH_TIMEOUT)); do
    if systemctl is-active --quiet "$SERVICE"; then
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" 2>/dev/null || true)
      if [ "$code" = "401" ] || [ "$code" = "200" ]; then return 0; fi
    fi
    sleep 2
  done
  return 1
}

rollback() {
  warn "回滚到发布前版本"
  if [ -d "$RELEASE/client-dist" ]; then
    rm -rf "$APP_DIR/client/dist"
    cp -a "$RELEASE/client-dist" "$APP_DIR/client/dist"
  fi
  if [ -d "$RELEASE/server-dist" ]; then
    rm -rf "$APP_DIR/server/dist"
    cp -a "$RELEASE/server-dist" "$APP_DIR/server/dist"
  fi
  restore_lock
  if [ "$NEED_INSTALL" = true ] && [ -n "$PNPM" ]; then
    (cd "$APP_DIR/server" && "$PNPM" install --frozen-lockfile) ||
      warn "回滚时依赖安装失败，请人工处理"
  fi
  systemctl restart "$SERVICE" || true
  if wait_healthy; then
    ok "已回滚，服务恢复"
  else
    warn "回滚后仍不健康，请立即人工介入：journalctl -u $SERVICE -n 200 --no-pager"
  fi
}

log "重启 $SERVICE"
if ! systemctl restart "$SERVICE"; then
  rollback
  die "服务重启失败"
fi

if wait_healthy; then
  ok "$SERVICE 已启动并通过健康检查"
else
  rollback
  die "健康检查未通过（$HEALTH_TIMEOUT 秒），已回滚"
fi

# ---------- 5. 收尾 ----------
cat >"$DEPLOY_ROOT/last-deploy.json" <<EOF
{"commit":"$COMMIT","time":"$(date -Is)","release":"$RELEASE","service":"$SERVICE"}
EOF
echo "$(date -Is) commit=$COMMIT release=$RELEASE" >>"$DEPLOY_ROOT/history.log"

# 只保留最近 KEEP_RELEASES 份备份
COUNT=$(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | wc -l)
if [ "$COUNT" -gt "$KEEP_RELEASES" ]; then
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort |
    head -n $((COUNT - KEEP_RELEASES)) | xargs -r rm -rf
fi

ok "部署完成：$COMMIT"
