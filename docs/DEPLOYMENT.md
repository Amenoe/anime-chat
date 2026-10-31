# 生产部署手册（单机 · Ubuntu）

> **读者**：在服务器上执行部署的 AI / 运维。请**按顺序**执行，每一步都有「预期结果」和「失败处理」；
> 某一步不符合预期就停下排查，不要跳步。
>
> 本文对应版本：**v1.0.0 及以后**（单仓结构：`client/` + `server/` + `docs/`）。
> 部署前先向用户收集下面这张表，缺项不要猜。

## 0. 开始前：需要用户提供的值

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `DOMAIN` | `anime.example.com` | 已解析到本机的域名（需要 HTTPS） |
| `APP_DIR` | `/srv/anime-chat` | 代码目录 |
| `RUN_USER` | `anime` | 运行进程的系统用户 |
| `DB_PASS` | 随机强密码 | MySQL 应用账号密码 |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 随机 64 hex | 可用 `openssl rand -hex 32` 生成 |
| `MINIO_USER` / `MINIO_PASS` | `anime` / 随机强密码 | 对象存储 |
| `QB_PASS` | 随机强密码 | qBittorrent WebUI 密码 |
| `AI_CHAT_API_KEY` | `sk-...` | DeepSeek Key（不用 AI 时留空） |
| `AI_INTERNAL_TOKEN` | 随机 48 hex | 前后端 AI 网关与服务间鉴权 |

在 shell 里先设好（后续命令都引用它们）：

```bash
export DOMAIN='anime.example.com'
export APP_DIR='/srv/anime-chat'
export RUN_USER='anime'
```

## 0.5 目标服务器与资源约束（先读）

本文以一台**阿里云 2 核 / 2 GiB / 40 GiB 系统盘 / 宝塔 Linux 面板**的机器为参考环境。
这个规格能跑，但有三处硬约束，部署方式必须相应调整：

| 资源 | 现状 | 影响与对策 |
| --- | --- | --- |
| CPU | 2 核 | 前端构建、ffmpeg 转码都吃紧；**优先 mp4/H.264 源**，HEVC 转码会很慢（见 §6.2 转码参数） |
| 内存 | 2 GiB | **必须加 4 GiB swap**（§3）；MySQL 限制 `innodb_buffer_pool_size`（§4.2）；不建议同机再跑 anime-ai |
| 磁盘 | 40 GiB 系统盘 | 系统+面板+MySQL ≈ 10 GiB，依赖 ≈ 1.5 GiB，**BT 下载与 HLS 缓存是主要风险**；建议挂数据盘或把 `data/` 移到大盘（§8、§17） |
| 带宽 | 200 Mbps | 下载很快，瓶颈在磁盘与转码，不在网络 |
| 面板 | 宝塔 Linux 面板 | 很可能已装 Nginx/MySQL：**先探测再决定装不装**（§2.1），否则会端口冲突 |
| 网络 | 公网 IP + 私网 IP | 阿里云安全组需放行 80/443（§19）；所有后端组件只绑 `127.0.0.1` |

> 如果这台机器只是先跑通、后续换高配，可以按本文部署；如果长期在 2C2G 上跑，
> 建议把 `server/data/bt-downloads` 放到数据盘，并把 `PLAYBACK_HLS_CACHE_TTL_HOURS` 调到 2–3。

## 1. 部署拓扑

```
                  ┌──────────────────────────────┐
  443 / 80  ────► │  Nginx                        │
                  │  ├─ /            → client/dist│  SPA
                  │  ├─ /api/        → 127.0.0.1:3000
                  │  └─ /socket.io/  → 127.0.0.1:3000（WebSocket）
                  └──────────────────────────────┘
                                     │
                  ┌──────────────────┴───────────────┐
                  │ Node（NestJS）127.0.0.1:3000      │
                  │  ├─ MySQL 127.0.0.1:3306          │
                  │  ├─ MinIO 127.0.0.1:9000          │
                  │  ├─ qBittorrent（Docker）127.0.0.1:8085 │
                  │  ├─ ffmpeg（系统包）                │
                  │  └─ anime-ai（可选）127.0.0.1:8013 │
                  └───────────────────────────────────┘
```

**只对外开放 80 / 443**（BT 需要时再加 6881）；其余组件一律监听 `127.0.0.1`。

磁盘：BT 下载 + HLS 分片缓存会占空间，建议 ≥ 50 GB，预留 20%。

## 2. 系统依赖

### 2.1 先探测：宝塔是否已经装了 Nginx / MySQL

```bash
ss -lntp | grep -E ':(80|443|3306|8888)\b' || true
nginx -v 2>&1 || true
mysql --version 2>&1 || true
ls /www/server/nginx/conf/vhost 2>/dev/null | head
```

- **80/443 已被 nginx 占用** → 复用宝塔的 Nginx，**不要**再 `apt install nginx`（§12 给宝塔站点配置）
- **3306 已被 mysqld 占用** → 复用宝塔的 MySQL，**不要**再 `apt install mysql-server`（§4 走「宝塔已装」分支）
- 都没有 → 按下面的命令安装

### 2.2 安装缺失的依赖

```bash
apt-get update
apt-get install -y curl git ffmpeg unzip jq ca-certificates

# 仅当 §2.1 探测到没有 Nginx / MySQL 时才装
# apt-get install -y nginx mysql-server

# Node.js 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm i -g pnpm@latest
node -v        # 预期 v22.x
pnpm -v        # 预期 10.x / 11.x

# Docker（qBittorrent / MinIO 用）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
```

**预期**：`node -v` / `pnpm -v` / `ffmpeg -version` / `docker version` 都有输出。
**失败处理**：NodeSource 报 GPG 错误时，改用 Node 官方二进制包解压到 `/usr/local` 并软链；
`ffmpeg` 装不上时换镜像源。

## 3. 运行用户、目录与 swap

```bash
useradd -r -m -d /home/$RUN_USER -s /bin/bash $RUN_USER || true
mkdir -p /var/log/anime-chat /srv/minio
chown -R $RUN_USER:$RUN_USER /var/log/anime-chat
```

**2 GiB 内存必须加 swap**（前端构建、ffmpeg 分片转码都会短时吃满内存）：

```bash
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h    # 预期 Swap 有 4.0Gi
```

并把内核的 swap 倾向调低一点，避免频繁换出影响播放：

```bash
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

## 4. 数据库初始化

### 4.1 启动与加固

```bash
# 宝塔已装 MySQL（§2.1 探测到 3306）：跳过这一行
systemctl enable --now mysql

mysql_secure_installation   # 可选：设 root 密码、删匿名用户
```

### 4.2 2 GiB 内存下的 MySQL 调参（重要）

默认 `innodb_buffer_pool_size` 会吃掉大半内存，导致 Node/ffmpeg 被 OOM Kill：

```bash
# 自装 MySQL 的路径；宝塔在「软件商店 → MySQL → 配置修改」里改同样的项
cat > /etc/mysql/mysql.conf.d/zz-anime.cnf <<'EOF'
[mysqld]
innodb_buffer_pool_size = 128M
max_connections = 50
performance_schema = OFF
EOF
systemctl restart mysql
```

建库、建应用账号（**只允许 127.0.0.1**）：

```bash
mysql -uroot -p <<SQL
CREATE DATABASE IF NOT EXISTS anime_chat DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'anime'@'127.0.0.1' IDENTIFIED BY '<DB_PASS>';
GRANT ALL PRIVILEGES ON anime_chat.* TO 'anime'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

拿到代码后再导入表结构（见 §6），这里先校验账号：

```bash
mysql -h127.0.0.1 -uanime -p'<DB_PASS>' -e "SELECT 1;"   # 预期输出 1
```

## 5. 拉代码

```bash
mkdir -p /srv && cd /srv
git clone https://github.com/Amenoe/anime-chat.git
cd $APP_DIR
git switch --detach v1.0.0     # 用发布 tag；要跟最新开发就留在 main
chown -R $RUN_USER:$RUN_USER $APP_DIR
```

**预期**：`ls` 看到 `client/ server/ docs/ package.json README.md`。

## 6. 后端生产配置（**这一步有两个必改项**）

### 6.1 关闭 TypeORM `synchronize`（必须）

仓库里 `server/src/app.module.ts` 目前是 `synchronize: true`（开发用）。生产**必须**关掉，
否则启动时会按实体自动改表；生产建表依赖 `docs/schema.sql`。

```bash
cd $APP_DIR
sed -i "s/synchronize: true/synchronize: process.env.NODE_ENV !== 'production'/" server/src/app.module.ts
grep -n "synchronize" server/src/app.module.ts
# 预期：      synchronize: process.env.NODE_ENV !== 'production',
```

> 提醒用户：本地仓库也应改这一行并提交，避免下次部署重复打补丁。

### 6.2 `server/.env.production`

```bash
cd $APP_DIR/server
cat > .env.production <<'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=anime
DB_PASSWORD=<DB_PASS>
DB_DATABASE=anime_chat

JWT_SECRET=<JWT_SECRET>
JWT_REFRESH_SECRET=<JWT_REFRESH_SECRET>
JWT_ACCESS_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=30d

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<MINIO_USER>
MINIO_SECRET_KEY=<MINIO_PASS>
MINIO_BUCKET=anime-chat
MINIO_AVATAR_PREFIX=avatars

QB_ENABLED=true
QB_URL=http://127.0.0.1:8085
QB_USERNAME=admin
QB_PASSWORD=<QB_PASS>
QB_DOWNLOAD_PATH=/srv/anime-chat/server/data/bt-downloads

PLAYBACK_PLAYABLE_PROGRESS=0.15
PLAYBACK_PLAYABLE_MIN_BYTES=31457280
PLAYBACK_POLL_INTERVAL_MS=3000
PLAYBACK_SEARCH_BUDGET_MS=25000
PLAYBACK_SEARCH_SOURCE_TIMEOUT_MS=8000
PLAYBACK_SEARCH_MAX_WEB=6

# 可选：ffmpeg 不在 PATH 时指定
# FFMPEG_PATH=/usr/bin/ffmpeg
# FFPROBE_PATH=/usr/bin/ffprobe
# PLAYBACK_TRANSCODE=true
# 2 核机器没有硬件编码器，会用 libx264；码率调低一点减轻压力
# PLAYBACK_VIDEO_ENCODER=libx264
# PLAYBACK_TRANSCODE_MAX_BITRATE=3M
# PLAYBACK_HLS_SEGMENT=6
# PLAYBACK_HLS_CACHE_DIR=/var/cache/anime-chat-hls
# PLAYBACK_HLS_CACHE_TTL_HOURS=3

AI_SERVICE_URL=http://127.0.0.1:8013
AI_INTERNAL_TOKEN=<AI_INTERNAL_TOKEN>
AI_DAILY_QUOTA=50
AI_HISTORY_WINDOW=20
AI_MAX_MESSAGE_LENGTH=2000
AI_UPSTREAM_TIMEOUT_MS=30000
AI_STREAM_TIMEOUT_MS=180000

DANDANPLAY_APP_ID=<DANDANPLAY_APP_ID>
DANDANPLAY_APP_SECRET=<DANDANPLAY_APP_SECRET>
DANDANPLAY_CALLBACK=
EOF
chown $RUN_USER:$RUN_USER .env.production
chmod 600 .env.production
```

**关键点**

- `HOST=127.0.0.1`：后端只监听本机，由 Nginx 反代（不要直接暴露 3000）
- `QB_DOWNLOAD_PATH` 必须是**宿主机绝对路径**，且与 compose 卷 `./data/bt-downloads` 对齐
  （compose 在 `server/` 下运行 → 宿主路径就是 `/srv/anime-chat/server/data/bt-downloads`）
- 上传头像走 MinIO，`MINIO_*` 必须与 §7 创建的一致

### 6.3 `client/.env.production`

```bash
cd $APP_DIR/client
cat > .env.production <<'EOF'
VITE_APP_TITLE='动漫放映室'
VITE_APP_ENV='production'
VITE_BASE_URL='/'
VITE_SERVE_URL='https://<DOMAIN>'
VITE_BASE_API='/api'
VITE_TIME_OUT=10000
EOF
```

**关键点**：`VITE_SERVE_URL` 是 **socket.io 连接地址**（放映室/点播室的房间与聊天），
必须是浏览器能访问的站点地址（带协议）。**留空会回落到 `http://localhost:3000`，线上必连不上。**

## 7. MinIO（头像存储）

```bash
mkdir -p /srv/minio && chown -R 1000:1000 /srv/minio
docker run -d --name minio --restart unless-stopped \
  -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
  -v /srv/minio:/data \
  -e MINIO_ROOT_USER=<MINIO_USER> \
  -e MINIO_ROOT_PASSWORD=<MINIO_PASS> \
  quay.io/minio/minio server /data --console-address ":9001"

# 创建 bucket（anime-chat）
docker run --rm --network host \
  -e MC_HOST_local="http://<MINIO_USER>:<MINIO_PASS>@127.0.0.1:9000" \
  minio/mc mb --ignore-existing local/anime-chat
```

**预期**：`docker ps` 里 minio 为 Up；`mc mb` 输出 `Bucket created successfully` 或已存在。
**失败处理**：控制台 `http://127.0.0.1:9001` 手动创建 bucket `anime-chat`。

## 8. qBittorrent（BT 播放）

```bash
cd $APP_DIR/server
mkdir -p data/bt-downloads
chown -R $(id -u $RUN_USER):$(id -g $RUN_USER) data
```

修改 `docker-compose.playback.yml`（**三处**）：

```yaml
services:
  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    container_name: anime-chat-qbittorrent
    environment:
      - PUID=1000            # 改成 id -u $RUN_USER
      - PGID=1000            # 改成 id -g $RUN_USER
      - TZ=Asia/Shanghai
      - WEBUI_PORT=8085
    volumes:
      - qb-config:/config
      - ./data/bt-downloads:/downloads
    ports:
      - '127.0.0.1:8085:8085'   # 只绑本机
      - '6881:6881'             # BT 入站
      - '6881:6881/udp'
    restart: unless-stopped
```

```bash
docker compose -f docker-compose.playback.yml up -d
sleep 15
docker logs anime-chat-qbittorrent 2>&1 | grep "temporary password"
```

拿到临时密码后**登录 WebUI 改成 `QB_PASS`**（也可以走 API，见 `docs/playback-architecture.md`），
然后校验：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8085/
# 预期 200（未登录会 200 或 302，能连上即可）
```

**失败处理**：容器起不来先 `docker logs`；PUID/PGID 与目录属主不一致会导致下载失败（`data/bt-downloads` 必须可写）。

## 9. 导入表结构 & 校验

```bash
cd $APP_DIR
mysql -h127.0.0.1 -uanime -p'<DB_PASS>' anime_chat < docs/schema.sql
mysql -h127.0.0.1 -uanime -p'<DB_PASS>' -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='anime_chat';"
# 预期：14
```

**失败处理**：SQL 报错说明 `schema.sql` 与当前版本不一致，停下把报错发回；不要手工改表结构硬上。

## 10. 构建与启动后端

```bash
cd $APP_DIR
pnpm --dir server install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=1024 pnpm --dir server build
ls server/dist/main.js      # 预期存在
```

> 2 GiB 机器上 `nest build`（tsc）通常 500–800 MB，配合 swap 没问题；
> 若出现 `JavaScript heap out of memory`，说明 swap 没生效（`free -h` 检查）或内存被 MySQL 吃了（§4.2）。

`/etc/systemd/system/anime-chat-server.service`：

```ini
[Unit]
Description=anime-chat server (NestJS)
After=network.target mysql.service docker.service

[Service]
Type=simple
User=anime
WorkingDirectory=/srv/anime-chat/server
Environment=NODE_ENV=production
Environment=TZ=Asia/Shanghai
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/anime-chat/server.log
StandardError=append:/var/log/anime-chat/server.err.log
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now anime-chat-server
sleep 5
systemctl status anime-chat-server --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/playback/health/qb
# 预期 401（未带 token，说明路由已生效）
```

**失败处理**：`journalctl -u anime-chat-server -n 100 --no-pager` 看报错；
最常见是 `.env.production` 缺失/路径不对（进程 cwd 必须是 `server/`）、数据库连不上、MinIO 不可达。

## 11. 构建前端

**方案 A：服务器上构建（简单，2C2G 需要 swap）**

```bash
cd $APP_DIR
pnpm --dir client install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=1536 pnpm --dir client build
ls client/dist/index.html    # 预期存在
chown -R $RUN_USER:$RUN_USER client/dist
```

**方案 B：本地构建后上传（2C2G 更稳，推荐）**

`vite build` + `vue-tsc` 峰值会到 1–1.5 GB，2 GiB 机器上容易和 MySQL/qB 抢内存。
在本地或 CI 构建，把产物同步上去：

```bash
# 本地执行（仓库根目录）
pnpm --dir client build
rsync -av --delete client/dist/ <user>@<server>:/srv/anime-chat/client/dist/
```

服务器侧只需保留 Nginx 指向 `client/dist`，不需要在服务器跑前端构建。

**失败处理**：`vue-tsc` 报类型错误说明依赖没装全；`JavaScript heap out of memory` 先确认 swap（§3），
仍失败就走方案 B。

## 12. Nginx + HTTPS

`/etc/nginx/sites-available/anime-chat.conf`：

```nginx
server {
    listen 80;
    server_name anime.example.com;

    root /srv/anime-chat/client/dist;
    index index.html;
    client_max_body_size 20m;

    # SPA（history 模式）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 业务接口：SSE / 视频流都不能缓冲
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
    }

    # Socket.IO（放映室 / 点播室的房间与聊天）
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

**宝塔面板已装 Nginx 时（`/www/server/nginx`）**：不要在 `/etc/nginx` 另起一份，
在面板「网站 → 添加站点」创建站点（根目录填 `/srv/anime-chat/client/dist`），
再点该站点的「配置文件」，把上面的 `location /api/` 与 `location /socket.io/` 两段贴进去
（宝塔生成的 `server` 块已含 `listen/server_name/root`）。保存后面板会 `reload`。

**自装 Nginx 时**：

```bash
ln -sf /etc/nginx/sites-available/anime-chat.conf /etc/nginx/sites-enabled/anime-chat.conf
nginx -t && systemctl reload nginx

apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d $DOMAIN --redirect --agree-tos -m admin@$DOMAIN -n
```

**预期**：`curl -I https://$DOMAIN/` 返回 `200`。

**失败处理**：80 端口被占先 `ss -lntp`；证书失败检查 DNS 是否已解析、80 是否放行。

## 13. 初始化账号

浏览器打开 `https://$DOMAIN/` 注册第一个账号，然后：

```bash
mysql -h127.0.0.1 -uanime -p'<DB_PASS>' anime_chat \
  -e "UPDATE user SET role='root' WHERE username='<你的用户名>';"
```

重新登录，侧边栏应出现「管理看板」。

## 14. anime-ai（可选，但 AI 助手需要）

```bash
cd /srv
git clone https://github.com/Amenoe/anime-ai.git
cd anime-ai
cp .env.example .env
# 编辑 .env：
#   AI_CHAT_API_KEY=<DeepSeek Key>
#   AI_INTERNAL_TOKEN=<与 server/.env.production 完全一致>
mvn -DskipTests package
```

`/etc/systemd/system/anime-ai.service`：

```ini
[Unit]
Description=anime-ai (Spring Boot)
After=network.target

[Service]
Type=simple
User=anime
WorkingDirectory=/srv/anime-ai
Environment=TZ=Asia/Shanghai
ExecStart=/usr/bin/java -jar /srv/anime-ai/target/anime-ai-0.0.1-SNAPSHOT.jar
Restart=always
RestartSec=3
StandardOutput=append:/var/log/anime-chat/ai.log
StandardError=append:/var/log/anime-chat/ai.err.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now anime-ai
sleep 10
curl -s -X POST http://127.0.0.1:8013/internal/ai/ping \
  -H "X-Internal-Token: <AI_INTERNAL_TOKEN>"
# 预期 200
```

不部署 AI 时，前端 `/ai` 页面会报错，其余功能不受影响。

## 15. 全流程验收

| # | 检查 | 命令 / 操作 | 预期 |
| --- | --- | --- | --- |
| 1 | 前端 | `curl -I https://$DOMAIN/` | 200，返回 HTML |
| 2 | 接口路由 | `curl -o /dev/null -w '%{http_code}' https://$DOMAIN/api/playback/health/qb` | 401 |
| 3 | 后端健康 | `systemctl is-active anime-chat-server` | active |
| 4 | 登录 | 页面注册/登录 | 进入首页，侧边栏完整 |
| 5 | qB | 登录后 `GET /api/playback/health/qb` | `{"ok":true,"version":"v5.x"}` |
| 6 | 直播流 | 详情页 → 剧集 → 放映室 → 选源开播 | 画面出现，进度可拖 |
| 7 | 点播室 | 点播室 → 创建 → 粘贴磁力 | 播放器出现，可播放/拖进度 |
| 8 | 字幕 | 播放 mkv | 字幕下拉可选，字号可调 |
| 9 | 聊天/同步 | 两个浏览器进同一房间 | 在线人数变化、消息互通、进度同步 |
| 10 | AI | 打开 `/ai` 发一句 | 流式返回（未部署 AI 时跳过） |
| 11 | 管理 | root 账号打开「管理看板」 | 图表与数据加载 |
| 12 | 头像 | 个人中心上传头像 | 成功并回显 |

## 16. 升级与回滚

```bash
cd $APP_DIR

# 1) 备份（见 §17）
# 2) 拉新版本
git fetch --tags && git checkout v1.0.1     # 或 main
# 3) 依赖与构建
pnpm --dir client install --frozen-lockfile && pnpm --dir server install --frozen-lockfile
pnpm --dir server build
pnpm --dir client build
# 4) 表结构有变更时：对比 docs/schema.sql 与库，手工执行新增/ALTER（生产不跑 synchronize）
# 5) 重启
systemctl restart anime-chat-server
rm -rf /tmp/anime-chat-hls/*      # 清掉旧版本转码缓存（可选）
```

**回滚**：`git checkout <上一个 tag>` → 重新 build → `systemctl restart`；
数据库若已执行过 ALTER，需要从备份恢复（因此升级前必须备份）。

## 17. 备份

```bash
# MySQL（每日定时）
mysqldump -h127.0.0.1 -uanime -p'<DB_PASS>' --single-transaction --routines anime_chat \
  | gzip > /var/backups/anime_chat_$(date +%F).sql.gz

# 配置
tar czf /var/backups/anime-env_$(date +%F).tar.gz \
  /srv/anime-chat/server/.env.production /srv/anime-chat/client/.env.production /srv/anime-ai/.env

# MinIO 数据（头像）
tar czf /var/backups/minio_$(date +%F).tar.gz /srv/minio

# BT 下载（按需，通常很大，可不备份）
```

HLS 分片缓存在 `/tmp/anime-chat-hls`（或 `PLAYBACK_HLS_CACHE_DIR`），**不需要备份**，重启清空也无妨。

## 18. 排错速查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 页面 404 / 白屏 | Nginx `root` 不是 `client/dist`，或 `try_files` 缺失 | 检查 §12 |
| `/api` 502 | 后端没起 / `HOST`、`PORT` 不对 | `journalctl -u anime-chat-server -n 100` |
| 登录 500 | 表没导入 / DB 账号权限 / 密码错 | §9 校验表数量、§6.2 检查 DB_* |
| 聊天连不上、在线人数不动 | `VITE_SERVE_URL` 没配域名；Nginx `/socket.io/` 没配 upgrade | §6.3、§12 |
| 磁力一直"获取种子信息" | qB 不可达 / 密码错 / DHT 慢 | `curl http://127.0.0.1:8085`、§8 改密、等 1–2 分钟 |
| 磁力能下但播不了 | `QB_DOWNLOAD_PATH` 与 compose 卷不一致；目录权限 | §6.2、§8 |
| mkv 黑屏 / 一直缓冲 | ffmpeg 未装 / `PLAYBACK_TRANSCODE=false` / 磁盘满 | `ffmpeg -version`、`db.playback` 日志、`df -h` |
| 进度条只有几十秒 | 用的是旧版 fMP4 流（v1.0.0 已改 HLS） | 确认版本与 `remuxRequired` 逻辑 |
| 字幕不显示 | 片源无内嵌字幕（外挂字幕不下载）；PGS 图形字幕不可转 | 换内嵌 ASS/SRT 的源 |
| AI 401 | 两边 `AI_INTERNAL_TOKEN` 不一致 | §6.2 与 §14 |
| 头像上传失败 | MinIO 未起 / bucket 不存在 / 密钥错 | §7 |
| 时间差 8 小时 | 时区 | systemd 里 `TZ=Asia/Shanghai`、qB 容器 `TZ` |
| 磁盘满 | BT + HLS 缓存（40 GiB 系统盘很容易满） | 清 `/tmp/anime-chat-hls`、限制下载、调小 `PLAYBACK_HLS_CACHE_TTL_HOURS`、把 `data/` 移到大盘 |
| 后端被 OOM Kill | 内存 2 GiB 被 MySQL/构建/转码吃满 | 加 swap（§3）、MySQL 调 buffer pool（§4.2）、构建走方案 B（§11） |
| mkv 转码极慢 / 卡顿 | 2 核跑 libx264 1080p 十有八九跟不上 | 优先 mp4/H.264 源；`PLAYBACK_TRANSCODE_MAX_BITRATE=3M`；不要多人同时看不同 mkv |
| 80/443 被占、nginx 起不来 | 宝塔已装 Nginx，又 apt 装了一份 | 按 §2.1 复用宝塔，不要双装 |
| 3306 被占、mysql 起不来 | 宝塔已装 MySQL | 同上，复用宝塔的 MySQL |

## 19. 安全清单

- [ ] **阿里云安全组**入方向只放行 22（限你的 IP）、80、443；BT 需要时再放 6881 tcp/udp
- [ ] 宝塔面板 8888 端口限制来源 IP（不要对公网全开）
- [ ] 只开放 80/443（`ufw allow 22,80,443/tcp`；BT 需要时再开 6881 tcp/udp）
- [ ] MySQL / MinIO / qBittorrent 均只监听 `127.0.0.1`
- [ ] HTTPS 强制跳转（certbot `--redirect`）
- [ ] `.env.production` 权限 `600`，属主为运行用户
- [ ] JWT / MinIO / DB / qB / AI Token 全部随机强密码
- [ ] root 账号只保留必要数量（管理后台可删号/封禁）
- [ ] 定期备份并演练一次恢复
- [ ] `.env*` 永不提交到 git（`.gitignore` 已覆盖）
