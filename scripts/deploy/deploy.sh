#!/usr/bin/env bash
# 发布已构建好的前后端产物到生产服务器。
#
# 本脚本只做「传输 + 触发」，所有切换/回滚逻辑在 remote-deploy.sh 里执行。
# 构建在 CI（GitHub Actions）完成，本地手动发布时需先自行构建：
#   pnpm --dir client type-check && pnpm --dir client build-only
#   pnpm --dir server build
#
# 可用环境变量：
#   DEPLOY_HOST     服务器地址，默认 8.130.120.172
#   DEPLOY_USER     登录用户，默认 root
#   DEPLOY_PORT     SSH 端口，默认 22
#   DEPLOY_SSH_KEY  私钥路径，默认 ~/.ssh/deploy_key
#   APP_DIR         服务器上的项目目录，默认 /www/wwwroot/anime-chat
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)

DEPLOY_HOST=${DEPLOY_HOST:-8.130.120.172}
DEPLOY_USER=${DEPLOY_USER:-root}
DEPLOY_PORT=${DEPLOY_PORT:-22}
DEPLOY_SSH_KEY=${DEPLOY_SSH_KEY:-$HOME/.ssh/deploy_key}
APP_DIR=${APP_DIR:-/www/wwwroot/anime-chat}

log() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$ROOT_DIR/client/dist/index.html" ] || die "缺少 client/dist/index.html，请先构建前端"
[ -f "$ROOT_DIR/server/dist/main.js" ] || die "缺少 server/dist/main.js，请先构建后端"
[ -f "$DEPLOY_SSH_KEY" ] || die "找不到私钥 $DEPLOY_SSH_KEY"

COMMIT=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
STAMP=$(date +%Y%m%d%H%M%S)
REMOTE_PKG="/tmp/anime-chat-dist-${COMMIT}-${STAMP}.tgz"
LOCAL_PKG=$(mktemp /tmp/anime-chat-dist.XXXXXX).tgz

cleanup() { rm -f "$LOCAL_PKG"; }
trap cleanup EXIT

# ssh 用 -p 指定端口，scp 用大写 -P，因此两套参数分开拼
COMMON_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
  -o ControlPath=none
  -i "$DEPLOY_SSH_KEY"
  -o IdentitiesOnly=yes
)
SSH_OPTS=(-p "$DEPLOY_PORT" "${COMMON_OPTS[@]}")
SCP_OPTS=(-P "$DEPLOY_PORT" "${COMMON_OPTS[@]}")

log "打包产物（commit ${COMMIT}）"
# COPYFILE_DISABLE：macOS 的 tar 不要把 xattr / AppleDouble（._*）塞进包里；
# --no-xattrs 只有 macOS 自带的 bsdtar 支持，Linux（CI）上的 GNU tar 不认这个参数
TAR_XATTR=""
if tar --version 2>/dev/null | grep -qi 'bsdtar'; then TAR_XATTR="--no-xattrs"; fi
COPYFILE_DISABLE=1 tar $TAR_XATTR -czf "$LOCAL_PKG" -C "$ROOT_DIR" \
  client/dist client/package.json client/pnpm-lock.yaml \
  server/dist server/package.json server/pnpm-lock.yaml

log "上传到 ${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_PKG}"
scp "${SCP_OPTS[@]}" -q "$LOCAL_PKG" "${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_PKG}"

log "在服务器执行发布"
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "bash --noprofile --norc -s -- '$REMOTE_PKG' '$COMMIT' '$APP_DIR'" \
  < "$SCRIPT_DIR/remote-deploy.sh"

log "发布完成"
