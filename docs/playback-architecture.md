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

### 本地开发（macOS / Docker Desktop）

```bash
cd anime-chat-server
mkdir -p data/bt-downloads
docker compose -f docker-compose.playback.yml up -d
# qB 4.6.1+ 首次启动是随机临时密码，不是 adminadmin：
docker logs anime-chat-qbittorrent 2>&1 | grep "temporary password"
# 例如：...temporary password is provided for this session: pDSE7kPXF
```

登录 http://localhost:8085（用户名 `admin`，密码用上面日志里的临时值），改成与
`.env` 里 `QB_PASSWORD` 一致的口令；也可以登录后直接调 API（避免手点）：

```bash
# 用临时密码换 Cookie，再写入新密码（qB 5.x 的 Preferences 支持 web_ui_password）
curl -c /tmp/qb.cookie -X POST http://127.0.0.1:8085/api/v2/auth/login \
  -d 'username=admin&password=<临时密码>'
curl -b /tmp/qb.cookie -X POST http://127.0.0.1:8085/api/v2/app/setPreferences \
  --data-urlencode 'json={"web_ui_password":"<QB_PASSWORD>"}'
```

然后把 `.env.development` 配成（`QB_DOWNLOAD_PATH` 必须是**宿主机绝对路径**）：

```env
QB_ENABLED=true
QB_URL=http://127.0.0.1:8085
QB_USERNAME=admin
QB_PASSWORD=<你设置的口令>
QB_DOWNLOAD_PATH=$(pwd)/data/bt-downloads   # 与 compose 的 ./data/bt-downloads:/downloads 宿主机侧一致
```

改完重启后端（`pnpm start:dev`），`GET /api/playback/health/qb` 应返回
`{ "ok": true, "version": "v5.3.0" }`；`QB_ENABLED=false` 时该接口返回
`{ "ok": false, "message": "QB_ENABLED=false（BT 播放不可用）" }`。

> 坑：`QB_DOWNLOAD_PATH` 与 compose 挂载不一致时，qB 能下、Nest 却 `existsSync` 不到文件，
> 会话会一直停在 `downloading`；删除 `qb-config` 卷重建容器也会让密码退回临时密码。

### 云服务器示例

```bash
cd anime-chat-server
mkdir -p data/bt-downloads
docker compose -f docker-compose.playback.yml up -d
# WebUI 密码见 docker logs 里的临时密码；登录后改成 .env 的 QB_PASSWORD
# .env:
# QB_ENABLED=true
# QB_URL=http://127.0.0.1:8085
# QB_PASSWORD=你的新密码
# QB_DOWNLOAD_PATH=./data/bt-downloads
```

开放端口：`8085`（建议仅内网/SSH 隧道）、`6881` TCP/UDP（BT）。

## 数据流（同机主路径：直接播 qB 落盘）

```
前端播放器（Artplayer）
  → POST /api/playback/sessions { uri: magnet }        ← 立刻返回（status=fetching），不等 metadata
  → 后台 prepareTorrent：qB 加种（409 幂等）→ 只保留选中的视频文件 → 打开顺序下载 → 算 local_path
  → 前端轮询会话，拿到 fileName 后才挂播放器（此时才知道要不要转封装）
  → GET /api/playback/sessions/:id/stream?token=JWT
       · mp4/webm/ts：按「已下载字节」裁剪 Range，下载中即可播
       · mkv/HEVC：HLS 静态 playlist + 分片按需转码（/hls.m3u8 + /hls/:i.ts）
  → 缓冲不足 → 503 → 播放器 2s 后自动重试（AnimePlayer autoRetry）
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

## 边下边播：关键实现

1. **会话创建不阻塞**：`create()` 先落库（`fetching`）立刻返回，metadata/选文件/顺序下载都在
   `prepareTorrent` 后台做。以前同步等 30s 拿文件列表，超时就 400 —— 表现就是「还没下载就判定不能播」。
2. **metadata 迟到可自愈**：轮询到 `fetching` 且没有 `file_name` 时，`refreshOne` 会再查一次 qB 文件列表，
   拿到就自动补选文件并转 `downloading`。磁力 metadata 常常要 1-2 分钟，不能算失败。
3. **只下需要的文件 + 顺序下载**：`setOnlyFile` 把其它文件优先级置 0，`seq_dl` 让分片从前往后落地。
4. **出流只读已下载区间**：`availableBytes = min(文件大小, qB downloaded)`（qB 预分配时磁盘大小一开始
   就是整集大小），Range 的 `end` 会被裁剪到已下载位置；请求超出已下载范围先等待，超时返回 503。
5. **`local_path` 必须是文件**：多文件种子的 `content_path` 是**目录**，以前直接当播放路径，
   `statSync` 读到 160 字节 → 永远「缓冲不足」→「下载完也播不了」。现在只接受普通文件。
6. **mkv / HEVC 走 HLS 分片**：单条 frag-mp4 流没有索引，浏览器拿不到总时长、也不能 seek，
   所以改成「静态 VOD playlist + 分片按需转码」，见下一节。

相关环境变量（都有默认值，不配也能跑）：

```env
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
PLAYBACK_TRANSCODE=true          # false = 完全关闭 mkv/HEVC 转封装
PLAYBACK_VIDEO_ENCODER=auto      # auto | h264_videotoolbox | h264_nvenc | libx264
PLAYBACK_TRANSCODE_MAX_BITRATE=6M
```

### mkv / HEVC：HLS 分片按需转码

为什么不是一条 fMP4 流：fragmented mp4 没有 moov 索引，`<video>` 的 `duration` 只能是
「已经收到的部分」（实测停在 20 秒），进度条拖不动。

现在：

- `GET /api/playback/sessions/:id/hls.m3u8?token=` **一次性返回全部 `#EXTINF` + `#EXT-X-ENDLIST`**，
  播放器据此算出真实总时长（实测 24:00），进度条可以拖
- `GET .../hls/:index.ts?token=` 首次请求时用 ffmpeg 精确 seek 转码 6 秒（`-ss` 在 `-i` 前），
  之后直接读磁盘缓存；同一分片并发请求共享同一个转码任务
- ⚠️ **分片必须保留原始时间戳**（`-copyts`）。每段都从 0 开始会让 hls.js 认为第二段时间戳
  回退，表现出来就是「播到第一个分片末尾卡住」—— 检测不到任何报错，只有缓冲区停在 6.0
- 并发上限 2 个 ffmpeg；缓存目录 `PLAYBACK_HLS_CACHE_DIR`（默认系统 tmp），
  保留 `PLAYBACK_HLS_CACHE_TTL_HOURS`（默认 6 小时），每 30 分钟扫一次
- 边下边播：请求到「尚未下载」的分片返回 503，hls.js 按 `fragLoadPolicy` 退避重试

配置：

```env
PLAYBACK_HLS_SEGMENT=6                 # 分片时长（秒）
PLAYBACK_HLS_CACHE_DIR=                # 默认 <tmp>/anime-chat-hls
PLAYBACK_HLS_CACHE_TTL_HOURS=6
```

## 字幕（只支持内嵌）

**外挂字幕文件（种子里的 `.ass` / `.srt`）目前不下载**：选文件时只挑视频扩展名
（`pickBestVideoFile`），`setOnlyFile` 把其它文件优先级置 0。所以「下载了视频但看不到外挂字幕」
是预期行为，不是坏了。

内嵌字幕（mkv 里的 ASS/SRT 轨）已经支持：

- `GET /api/playback/sessions/:id/subtitles` 列出可转的轨（PGS/DVD 这类**图形字幕**不可转，直接过滤）
- `GET .../subtitle/:track.vtt?token=` 用 ffmpeg `-map 0:<index> -c:s webvtt` 转成 WebVTT 并缓存
  （`<track>` 无法带 Authorization 头，所以走 query token）
- ASS 只保留对白：字体、颜色、位置、特效全部丢失 —— 浏览器原生字幕只认 VTT，
  要还原样式得引入 libass，代价太大
- 双语字幕（ASS 里原文/译文各一条 Dialogue）转出来是**同一时刻的多个 cue**，浏览器会叠在一起；
  服务端会合并成「一条 cue 多行文本」，前端再按行显示
- 前端 `AnimePlayer` 的 `subtitles` prop + 字幕下拉：**同一时刻只挂一个 `<track>`** ——
  一开始每条都挂再切 `mode`，浏览器会把多条字幕轨都置成 `showing`（整屏叠字）
- **字号可调**：原生 `<track>` 只能用 `video::cue` 改样式，而 `::cue` 读不到 CSS 变量，
  所以 `AnimePlayer` 动态维护一条 `style` 规则（`.anime-player__video::cue { font-size: X% }`），
  提供 小 80% / 标准 100% / 大 130% / 超大 160%，选择存 `localStorage`，点播室与放映室共用。
  （字号调大后字幕仍贴底，鼠标悬停唤出控制栏时可能被盖住 —— 移开即恢复）

### ASS 特效字幕（未实现，方案留档）

上图的描边/字体/定位是 ASS 的能力，VTT 表达不了，`ffmpeg -c:s webvtt` 那一步已经把样式丢了。
真要还原，两条路：

| | JASSUB（浏览器 libass WASM） | 服务端烧录（ffmpeg `ass` 滤镜） |
| --- | --- | --- |
| 需要新增 | 后端「原始 .ass」+「字体附件」两个接口；前端 ~1–2 MB wasm | 分片转码时叠加滤镜（要处理 `-ss` 后的时间轴） |
| 还原度 | 高 | 高 |
| 字幕开关/切轨 | 支持 | **不支持**（烧进画面，多轨要分别转码缓存） |
| 成本 | 客户端体积；低端机 1080p 特效可能掉帧 | 服务端 CPU 上升 |
| 字体 | 从 mkv 附件提取（如 `HYXuanSong 35S/55S/65S`、`FOT-TsukuAOldMin`），否则 fallback 变形 | 同左，需 `fontsdir` |

当前只做「内嵌轨 → VTT + 字号」，不做特效。

## 点播室（`/vod`）

放映室是「按番剧公开列房」；番剧详情页的播放已经移除。想临时拉几个人一起看，用**点播室**：

- **私人房间**：`POST /api/rooms/vod` 建房（`anime_id = 0`，不会出现在「详情页 → 该番的放映室」列表里），
  拿到随机 `season_id` 生成邀请链接 `/vod/<seasonId>`；入口页 `/vod` 支持创建或粘贴链接/房间号加入
- **播放同步与放映室一致**：房主选源后只广播 `session_id`，成员用**自己的 token** 拉流
  （不广播带房主 token 的地址，避免把 accessToken 泄给观众）；`playback:control` 仅房主可用，
  成员播放器 `controlled` 只读，进度按 `playback:state` 对齐
- **房主离开 = 解散**：`ChatGateway.handleLeaveGroup` 对 `anime_id === 0` 的房间直接
  `destroyRoom` 并广播 `room:destroyed`，成员前端提示后回 `/vod`（放映室仍是转让给最早加入者）
- **没有弹幕**；聊天走房间自己的 `groupMessage`，随房间销毁
- 播放器支持：粘贴 magnet/直链、按关键词搜源（用「个人中心 → 数据源」里启用的站点）、
  下载进度、`转封装`标识、缓冲自动重试

## 限制（Phase 1）

- mkv/HEVC 依赖服务端 ffmpeg；HEVC 会**转码**，CPU/GPU 有开销，机器太弱时建议优先选 mp4 源
- 分片按需转码：拖到没缓存过的位置要等 1-3 秒（转码 + hls.js 缓冲）
- 分片缓存是临时文件，一部番约 0.5-1 GB，默认 6 小时后自动清理
- 顺序下载只保证「大致从前往后」，未做 piece 级调度；跳到未下载区域会返回 503 等重试
- 未内置磁力搜索；用户自行粘贴 magnet 或在点播室按关键词搜
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
