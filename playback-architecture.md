# 播放架构（BT / 磁力 → 站内播）

## qBittorrent 要不要装在云服务器上？

**要有一个 qBittorrent 进程，Nest 能 HTTP 访问到即可。**

| 方式 | 说明 | 推荐 |
|------|------|------|
| **Docker Compose（推荐）** | `docker-compose.playback.yml`，与 Nest 同机 | ✅ 云服务器首选 |
| 系统包 / 官方安装包 | `apt`/`二进制` 装 WebUI 版 | 可以，但不如容器好迁移 |
| 桌面 GUI 版 | 需开 WebUI，不适合无头服务器 | ❌ |
| 另一台机器 | `QB_URL=http://内网IP:8085`，下载目录需 Nest 也能读（NFS/共享盘）或只走 MinIO | 高级 |

**不需要**在服务器上装 qBittorrent **桌面客户端**；装 **WebUI + Web API** 的无头实例即可。

### 云服务器示例

```bash
cd anime-chat-server
mkdir -p data/bt-downloads
docker compose -f docker-compose.playback.yml up -d
# 浏览器打开 http://服务器:8085 改密
# .env:
# QB_URL=http://127.0.0.1:8085
# QB_PASSWORD=你的新密码
# QB_DOWNLOAD_PATH=./data/bt-downloads
```

开放端口：`8085`（建议仅内网/SSH 隧道）、`6881` TCP/UDP（BT）。

## 数据流（同机主路径：直接播 qB 落盘）

```
前端 Artplayer
  → POST /api/playback/sessions { uri: magnet }
  → Nest → qBittorrent Web API 加种
  → qB 写入容器 /downloads
       ↕ bind：./data/bt-downloads:/downloads
  → 宿主机 QB_DOWNLOAD_PATH（DB 记 local_path）
  → playable/ready：Nest createReadStream(local_path) + Range
  → GET /api/playback/sessions/:id/stream?token=JWT
```

**默认不再拷到 MinIO**（`PLAYBACK_UPLOAD_TO_MINIO=false`），避免双份磁盘与多余传输。

同机 `.env`：

```env
QB_URL=http://127.0.0.1:8085
QB_DOWNLOAD_PATH=/var/www/anime-chat-server/data/bt-downloads
PLAYBACK_UPLOAD_TO_MINIO=false
```

compose：

```yaml
volumes:
  - ./data/bt-downloads:/downloads
```

### 可选：MinIO 副本

仅当需要「删本地仍能播 / 多 Nest 共享成片」时：

```env
PLAYBACK_UPLOAD_TO_MINIO=true
MINIO_PLAYBACK_PREFIX=playback
```

此时下完会 `fPutObject` 一份；出流仍**本地优先**。

## 限制（Phase 1）

- 浏览器对 **mkv** 支持差，尽量用 mp4 源或后续 FFmpeg 转 HLS
- 真·边下边播 seek 未下载区域未做 piece 优先级
- 未内置磁力搜索；用户自行粘贴 magnet
- 视频文件在 qB 目录；MinIO 仍只用于头像等（除非打开上传开关）

## （备选）Nest 与 qB 不同机

已不作为主方案。若必须分开：共享盘 / 仅 MinIO 出流 / SSHFS 调试。

### 历史：NAS 示意

| 做法 | 说明 |
|------|------|
| SSHFS | `sshfs user@服务器:/path/to/downloads ./data/bt-downloads`，延迟大，仅调试 |
| 只测 API | `GET /api/playback/health/qb` 验证登录；播放等 Nest 部署到同机再测 |
| 下完走 MinIO | 完整下载后上传 MinIO，Nest 只代理 MinIO（不依赖共享盘） |

### 方案 C：Nest 与 qB 同机（最简单）

把 Nest 也部署到装 qB 的那台 ECS：

```env
QB_URL=http://127.0.0.1:8085
QB_DOWNLOAD_PATH=/path/on/host/to/downloads   # 与容器 bind 一致
```

### 校验共享盘

在 **Nest 机器**上：

```bash
# 应能看到 qB 下载产生的文件
ls -la $QB_DOWNLOAD_PATH
```

在 qB WebUI 下完一个测试任务后，Nest 侧同一路径出现对应文件，即挂载成功。
