# 动漫放映室（anime-chat）

动漫讨论平台前端：番剧浏览（Bangumi API）+ 追番 + 「放映室」一起看（左播放右聊天、房主强同步）。

技术栈：Vue 3 + TypeScript + Vite + Pinia + Element Plus + Artplayer + hls.js + socket.io-client。

## 功能

- 首页 / 搜索 / 详情（Bangumi 数据源），详情页点集进入放映室（列房 → 加入/创建）
- 放映室：房主选源开播、全员同步进度（播放/暂停/seek/切集）、观众只读跟随、在线头像、聊天实时
- 播放：流媒体直链代理 + HLS 同源分片，BT 磁力边下边播（依赖后端 qBittorrent）
- 用户：登录注册、头像裁剪上传（MinIO）、追番（想看/在看/看完）、数据源订阅管理

## 鉴权

双 token：accessToken（短时效，随 `Authorization: Bearer` 下发）+ refreshToken（长时效，
只用于换新）。401 时请求层自动用 refreshToken 换新 accessToken 并重放原请求，用户无感；
并发 401 合并为一次刷新，单次重试防死循环。退出登录会调用后端 `/auth/logout` 吊销 refreshToken。

## 开发

```bash
pnpm install
pnpm dev          # localhost:8012，/api 代理到 localhost:3000
pnpm type-check   # vue-tsc --noEmit
pnpm build-only   # vite build
```

环境变量见 `.env.development`（`VITE_SERVE_URL` / `VITE_BASE_API` 等）。

后端仓库：[anime-chat-server](https://github.com/Amenoe/anime-chat-server)

公共记忆与任务看板：[docs/PROJECT_MEMORY.md](../docs/PROJECT_MEMORY.md) ·
接口契约：[docs/api-contract.md](../docs/api-contract.md) ·
前后端认知同步：[docs/COGNITION_SYNC.md](../docs/COGNITION_SYNC.md)
