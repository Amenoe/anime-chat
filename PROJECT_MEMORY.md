# 动漫放映室 · 项目记忆与任务同步

> 本文件是双仓库（前端 `anime-chat` / 后端 `anime-chat-server`）的公共记忆与任务同步文档。
> 修改代码、推进任务或发现新问题后，请同步更新「任务看板」与「修复记录」。
> 已废弃 superpowers 框架（2026-08-16），相关文档已清理；此文档取代旧的 specs/plans 作为唯一项目记忆。

### 文档地图

| 文档 | 内容 |
| --- | --- |
| `PROJECT_MEMORY.md`（本文） | 项目概览、进度、任务看板、修复记录、Git Ship 流程 |
| `COGNITION_SYNC.md` | **前后端认知同步**：跨仓契约、命名对齐、改动联动清单、验证与提交约定 |
| `api-contract.md` | 接口契约：统一响应信封、双 token 鉴权、用户/追番接口 |
| `playback-architecture.md` | 播放架构：BT/磁力 → 站内播、qBittorrent 部署 |
| `schema.sql` | 全量表结构（生产建库依据，改实体后必须同步） |

> 各仓代码导览：`anime-chat/CLAUDE.md`（前端）、`anime-chat-server/CLAUDE.md`（后端）。

---

## 1. 项目概览

| 项 | 说明 |
| --- | --- |
| 前端 | `anime-chat` — Vue 3 + TS + Vite + Pinia + Element Plus + Artplayer + hls.js + socket.io-client |
| 后端 | `anime-chat-server` — NestJS 9 + TypeORM 0.2 + Socket.IO + MySQL + MinIO + qBittorrent |
| 定位 | 动漫讨论平台 +「放映室」一起看：左播放右聊天、房主强同步、按随机 `season_id` 多厅 |
| 语言 | 注释、commit、UI 均为中文 |
| 仓库 | github.com/Amenoe/anime-chat · github.com/Amenoe/anime-chat-server（各自独立 git，分开提交）；本 `docs/` 为第三个独立 git 仓（仅文档，暂无远端） |

### 命令速查

| 动作 | 前端（anime-chat） | 后端（anime-chat-server） |
| --- | --- | --- |
| 启动 | `pnpm dev`（localhost:8012） | `pnpm start:dev`（localhost:3000） |
| 类型检查 | `pnpm type-check` | `pnpm exec tsc --noEmit -p tsconfig.build.json` |
| 构建 | `pnpm build-only`（跳过类型检查）/ `pnpm build` | `pnpm run build` |
| 提交 | emoji 前缀 Angular 风格（commitlint + husky） | 同左 |

Commit 前缀：`🌟feat` `🐛fix` `📝docs` `💎style` `🌠refactor` `🚀perf` `🚨test` `📦build` `👷ci` `🔂revert`。

### 环境变量（重要）

- 前端 `.env.*`：`VITE_SERVE_URL`（后端地址）、`VITE_BASE_URL`、`VITE_BASE_API`（/api）、`VITE_TIME_OUT`
- 后端 `.env.development` / `.env.production`：`DB_*`、`JWT_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ACCESS_EXPIRES_IN`（默认 2h）/ `JWT_REFRESH_EXPIRES_IN`（默认 30d）、`MINIO_*`（头像对象存储）、`QB_*`（BT 边下边播）、`OUTBOUND_PROXY`（可选出站代理）
- BT 播放依赖 qBittorrent WebUI（`QB_ENABLED=false` 时流媒体不受影响）；`docker-compose.playback.yml` 提供容器

### 前端架构要点

- 自动导入：`unplugin-auto-import`（Vue/Router API 免 import）+ `unplugin-vue-components`（Element Plus 组件免 import），声明在 `src/plugin/*.d.ts`，勿手动补齐 import
- API 层：`src/common/request/index.ts`（项目后端，带 JWT、解包 `data`）；`bangumi.ts`（Bangumi 公开 API，需 User-Agent）
- 鉴权：`axios-utils.ts` 统一处理 401 → `refreshAction()` 静默刷新 → 重放原请求（并发合并、单次重试）；登出走 `logoutAction()` 吊销 refreshToken
- Pinia stores：`login` / `home` / `room`（放映室）/ `userAnime` / `route`（旧 `chat` store 已下线）；`stores/index.ts` 提供 `$reset` 插件
- 路由：HTML5 history、懒加载、无全局守卫，鉴权在组件内完成
- 设计语言：暗色 + 主题色 `--primary-color`（#68c6bd），卡片 `var(--aside-bg-color)` + hover 辉光

### 后端架构要点

- 全局响应 `{ code, message, data }`（TransformInterceptor）；错误由 HttpExceptionFilter 统一，**并带真实 HTTP 状态码**（前端静默刷新依赖这一点）
- 鉴权：passport-jwt + **双 token**（accessToken 短时效不落库 / refreshToken 长时效落库可吊销，刷新即轮换）；流接口额外支持 `?token=`（video/hls 无法带 Header）
- 模块：auth / user / user-anime / group（旧聊天）/ room（放映室）/ chat（Socket Gateway）/ playback（播放）/ media-source（数据源）/ storage（MinIO 头像）/ anime（本地兜底）
- 数据库：MySQL `anime_chat`；dev 用 TypeORM `synchronize: true`，**生产关掉并用 `docs/schema.sql` 建表**
- 头像存 MinIO Private 桶，DB 记代理路径 `/api/images/avatars/...`，前端经 `resolveAvatarUrl` 访问

---

## 2. 当前进度（截至 2026-09-15）

### 已完成

- 登录/注册/JWT、头像裁剪上传（MinIO）、个人中心追番（想看/在看/看完）与数据源订阅管理
- 首页/搜索/详情页全部走 Bangumi API；详情页点集 → 列房/创建确认 → `/room/:seasonId`
- 播放模块：流媒体 Range 代理、m3u8 相对 URI 改写 + 同源代理 enc.key/ts、BT 磁力边下边播
- 放映室核心（后端 7-28、前端 7-31 最后提交）：
  - group 表扩展（`season_id` UNIQUE 房间 key、`episode_*` 内容绑定、`playback_*` 状态）
  - HTTP `GET/POST /api/rooms`、`GET /api/rooms/by-key/:seasonId`
  - Socket `joinRoom` / `playback:control`（play/pause/seek/switch_episode/set_source/heartbeat）强同步
  - 房主离开转让、空房销毁、进出房系统提示、在线成员头像
  - 前端 `Room.vue` 左播右聊、聊天/播放列表 Tab、观众只读跟随、房主自动/手动选源、移动端适配
- **双 token 会话与前端静默刷新（2026-09-15，两仓已合入 main 并推送）**
  - 后端：`refresh_token` 表（只存 sha256）、刷新即轮换、复用检测整户吊销、登出/改密/删号吊销
  - 前端：401 自动刷新并重放原请求、并发合并、退出登录真正吊销 refreshToken
- 前后端 `type-check` + `build` 全绿（2026-09-15 复核）；鉴权链路真实接口验收 24/24

### 放映室核心设计决策（取代旧 specs，勿再改回）

| 项 | 决策 |
| --- | --- |
| 房间业务 key | `season_id`（随机 16 位 hex，全局 UNIQUE）——不是 session_id，不是番剧分季 |
| 内容绑定 | `anime_id` + `episode_id` + `episode_sort`；切集只改 `playback_episode_*`，永不改 `season_id` |
| 多厅 | 同一 `anime_id` 可多间房（不同 `season_id`） |
| 进度同步 | 强同步：host 控制，观众强制跟随；心跳 8s，DB 写节流 2s |
| 房主离开 | 有人 → 按最早加入转让；无人 → 硬删 message/map/group |
| 纯聊天 | 不保留（旧 `/chat` 页面/store 已移除；后端 `addGroup` 保留兼容并标 deprecated） |
| 同房拉流 | session 带 `group_id`；`openStream` 鉴权 = 属主 OR 房主 OR `GroupUserMap` 成员 |

---

## 3. 任务看板（按优先级）

> 状态：⬜ 待办 / 🔄 进行中 / ✅ 完成

| # | 优先级 | 任务 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | P0 | 修复观众拉流：`joinRoom` 写入 `GroupUserMap`，离开清理 | ✅ 2026-08-16 | 修复前观众拉 host 流 404 |
| 2 | P0 | 修复用户接口越权：`PATCH/DELETE /user/:id`、`PATCH /user/status/:id` 校验本人 | ✅ 2026-08-16 | 修复前可改任意人密码/删号 |
| 3 | P1 | 联调验收 | ✅ 2026-08-16 | 后端协议级 29/29 + UI 渲染验收通过（headless Chrome：首页/详情/房间页布局、房主身份、自动选源触发、聊天侧栏）；双账号真实播放器同步建议人工复核 |
| 4 | P1 | 下线旧纯聊天：`/chat` 路由与页面/store 移除 | ✅ 2026-08-17 | ChatMessage 类型迁至 stores/types.ts；后端 addGroup 保留兼容并标 deprecated |
| 5 | P1 | 文档同步：`docs/schema.sql` 补全新表；README 更新；CLAUDE.md 模块清单补放映室/播放/媒体源 | ✅ 2026-08-16 | schema 已含 group/playback/media_source 等全部表 |
| 6 | P2 | 前端 chunk 拆分 | ✅ 2026-08-17 | Element Plus 按需引入 + artplayer/hls.js 独立分包；index 1.2MB → 525KB（gzip 408→176KB） |
| 7 | P2 | `/timeline` 改为 AI 相关页面 | 🔄 2026-09-20 | 分支 `feat/ai-assistant`。路由占位已完成：侧边栏「时间表」→「AI 助手」(`/ai`)，`/timeline` 重定向兼容；技术栈方案见 `ai-chat-tech-stack.md`。AI 后端（`AiModule`）未开始 |
| 8 | P2 | heartbeat 广播节流 | ✅ 2026-08-17 | 1s 内不重复广播 playback:state；非心跳控制即时广播 |
| 9 | P2 | 首页「最近播放」 | ✅ 2026-08-17 | localStorage 记录；首页顶部横滑卡片，无记录隐藏；埋点：详情页点集/选源、放映室开播换源切集 |
| 9 | P1 | 放映室离开二次确认 + 侧边栏改 a 标签 | ✅ 2026-08-17 | 头像/侧边栏导航弹确认；a 标签支持中键/Cmd 新开 |
| 10 | P1 | 选源抽屉数据同步 + 当前源高亮/滚动定位 | ✅ 2026-08-17 | 会话内 + sessionStorage 持久缓存；播放标题兜底匹配当前源；打开抽屉直接展示并滚动定位 |
| 11 | P1 | joinRoom 回包字段对齐（`playback_episode_*` → `episode_*`） | ✅ 2026-08-18 | 修复「第几话建房不自动播第几话」；另加 `[src-debug]` 日志定位残余重搜 |
| 12 | P2 | PlayerPane 拆分重构 | ✅ 2026-08-18 | 1209 行 → 375 行；拆出 useSourceSearch / SourceDrawer / source-quality；已提交推送 |
| 13 | P1 | JWT 双 token + 前端静默刷新 | ✅ 2026-09-15 | accessToken 2h / refreshToken 30d 落库轮换吊销；前端 401 单次重试 + 并发合并；真实接口验收 24/24 |
| 14 | P1 | 文档同步与前后端认知同步 | ✅ 2026-09-15 | 新增 `COGNITION_SYNC.md` + 后端 `CLAUDE.md`；`api-contract.md` 重写；`schema.sql` 补 `refresh_token`；`docs/` 纳入版本管理 |
| 15 | P2 | AI 对话 MVP（对话 + `search_anime` 工具 + SSE + 配额） | ⬜ | 见 `ai-chat-tech-stack.md` §10；依赖看板 #7 的路由占位（已完成） |
| 16 | P2 | RAG / 知识库 / Workflow 能力建设 | ⬜ | 见 `ai-rag-practice-roadmap.md`。**已定：Java + LangChain4j 1.20.0**（Boot 4.0.5，评估走 Python ragas 旁路脚本）；M1/M2 设计已定稿（§3.5、§3.6），未开工 |

---

## 4. 修复记录

### 2026-09-15 · 双 token 会话收口 + 文档/认知同步

- **背景**：JWT 双 token 在 `feat/jwt-dual-token` / `feat/jwt-silent-refresh` 分支上写完但**从未提交**
  （两分支均与 main 平齐、0 commit），且存在几处未收口的缺口。
- **修复的缺口**：
  - 前端退出登录只调 `updateUserStatus` + 清本地，**从不调用 `POST /auth/logout`**
    → 登出后 refreshToken 仍可换新 accessToken 30 天。现改为 `logoutAction()`：先吊销再清本地
    （后端不可用也保证本地登出成功）。
  - `logoutLocal()` 只清 `token`/`userInfo`，漏清 `accessToken`/`refreshToken` ref
    → 内存里残留已登出的 refreshToken。已补齐。
  - `LogoutDto` 在 `refresh.dto.ts` 与 `logout.dto.ts` **重复定义**且注释矛盾。已归位到独立文件。
  - 刷新逻辑在两处重复（`axios-utils.ts` 直接裸 axios vs store 的 `refreshAction`），
    裸 axios 那条只写 localStorage、不同步 store ref。现统一走 `refreshAction()`。
  - 删除账号不清理该用户 refreshToken，留下孤儿会话记录。`UserService.delete` 现同步吊销。
  - 同一秒内重复签发的 accessToken 完全相同（payload 只有 user_id/username/typ，`iat` 同秒）
    → 刷新拿到的 token 与旧的一样。accessToken 现带 `jti` = refreshToken 记录 id，
    既保证唯一，也能回溯到具体会话。
  - `.env.development` / `.env.production` 未声明 `JWT_ACCESS_EXPIRES_IN` /
    `JWT_REFRESH_EXPIRES_IN` / `JWT_REFRESH_SECRET`，全靠代码默认值。已在 env 与 README 显式写明。
- **文档**：`schema.sql` 补 `refresh_token`（此前缺失，生产建库会直接导致登录失败）；
  重写 `api-contract.md`（原 `api-auth-collection.md` 仍写「JWT 3d」、无 refresh/logout 契约，
  并含已废弃的分工表）；两仓 README 更新；新增 `COGNITION_SYNC.md` 与后端 `CLAUDE.md`。
- **验证**：两仓 tsc / build / prettier / eslint 全绿；**真实启动后端跑双 token 端到端 24/24**
  （登录 → accessToken 鉴权 → refreshToken 不能访问业务接口 → 刷新轮换 → 旧 token 复用被拒并整户吊销
  → 登出吊销 → 缺参 400 → 改密吊销全部会话 → 新密码可登录 → 删号清理），测试账号与孤儿记录已清理。
  验收脚本已入库为 `anime-chat-server/scripts/auth-e2e.mjs`（可重复执行，避免再放 `/tmp` 丢失）。
  另实测 `docs/schema.sql` 可在空库完整执行并建出全部 10 张表（临时库已删除）。
- **提交**：功能提交 前端 `ca64b7a` + merge `5adc9de`；后端 `6cfeabe` + merge `ae2824d`。
  文档提交 前端 `01234e8`、后端 `6e8fb91`、`docs` 仓 `133eb5a`。均已推送 origin main，分支已删。
- **遗留**：前端 `.env.production`（`VITE_BASE_URL` `/pro/` → `/`）仍未提交，待用户确认。

### 2026-08-17 · 收尾清理与优化（feat/cleanup-and-perf，已合入 main 并推送）

- 下线旧纯聊天：删除 `/chat` 路由、`Chat.vue`、`chat store`；`ChatMessage` 类型迁移至 `stores/types.ts`。
- 前端打包：`main.ts` 移除全量 `app.use(ElementPlus)`，改 unplugin 按需导入（`importStyle: 'css'` + `locale: 'zh-cn'`）；`artplayer`/`hls.js` 独立 `player` chunk；`index` 1.2MB → 525KB（gzip 408KB → 176KB）。
- 后端：`playback:control` 心跳广播 1s 节流（写库仍 2s 节流）；`addGroup` 标记 deprecated。
- 验证：前后端 tsc/build/prettier 全绿；headless Chrome 复测首页与房间页（自动选源解析出真实 m3u8，播放器加载 23:57 时长）；双账号协议验收 29/29。
- 提交：前端 3 commits + merge（docs/refactor/perf），后端 3 commits + merge；已推送 origin main，分支已清理。

### 2026-08-17 · 首页「最近播放」（feat/recent-play，已合入 main 并推送）

- 新增 `src/utils/play-history.ts`（localStorage 记录，同番剧去重保留最新集，上限 20）。
- 首页顶部新增 `RecentPlay.vue` 横滑卡片区（封面/集数/相对时间，点击进详情）；无记录时整块隐藏，不影响新用户。
- 埋点：详情页点集进放映室（Detail.vue）、详情页选源播放（PlaybackPanel.beginSession）、放映室开播/换源/切集（PlayerPane watch）。
- 验证：type-check/build/prettier 全绿；headless Chrome 双场景通过（新用户无记录隐藏；注入两条历史后首页正确显示卡片与相对时间）；房间页真实开播也成功写入历史（链路验证）。

### 2026-08-17 · 放映室离开守卫与侧边栏 a 标签

- **改动**：
  - 新增 `anime-chat/src/composables/useLeaveRoomGuard.ts`：路由为 `/room/:seasonId` 且已进房时，导航前弹 `appConfirm` 二次确认（右上角头像 → 个人中心、侧边栏任意导航均生效），取消则留在放映室。
  - `AppAsideBar.vue` 导航元素由 `li` 点击改为真实 `<a>`（`router.resolve().href`）：默认左键走 SPA + 离开确认；中键 / Ctrl / Cmd / Shift 点击不拦截，由浏览器新开标签页。
  - `AppHeader.vue` 已登录头像跳转个人中心前同样走守卫。
- **验证**：前端 `type-check` + `build-only` 通过。

### 2026-08-17 · 选源抽屉数据同步、当前源高亮与滚动定位（二次修复）

- **问题**：首次修复后，自动选源播放场景下打开「选源开播」仍可能重新搜索；刷新/重进房（房间已有播放源）时无缓存且无法定位当前源，只有手动点选过才滚动。
- **改动**（`anime-chat/src/components/Room/PlayerPane.vue`）：
  - **sessionStorage 持久缓存**：搜索完成写入 `room-source-cache:v1:{bangumiId}:{sort}`（24h 有效），刷新/重进房打开抽屉直接恢复数据，不重新搜索。
  - **播放状态兜底匹配**：新增 `currentSourceUri`（selectCandidate 记录原始 uri）+ `syncCurrentSourceFromPlayback`：打开抽屉或搜索完成时，若本会话未记录当前源但播放状态有 title，在搜索结果中按标题匹配候选并标记「已选定」。
  - 缓存复用：内存缓存存在即用（仅「被切集打断且从未完成」的僵尸缓存重新搜索）。
  - `currentSourceKey` 清理统一为 `clearCurrentSource()`（失败/超时/报错/切集）；`watch(hasActiveSource)` 改为监听 `stream_url` 置空，避免误清。
  - 滚动定位：打开抽屉后 200ms 轮询等当前源元素出现即 `scrollIntoView`（30s 兜底），不依赖搜索全部完成。
- **验证**（headless Chrome + 本地 mock server，真实 UI 链路，两轮双场景）：
  - 场景 A（自动选源后打开抽屉）：search-one 2→2（**无重复请求**），抽屉立即显示站点行，A1 高亮「已选定」（自动尝试中即已标记）。
  - 场景 B（重进房、房间已有源）：search-one 2→2（**sessionStorage 缓存命中**），A1 经播放标题兜底匹配高亮「已选定」；预置底部源 B1 时抽屉 `scrollTop=108`，B1 滚动到视口内（top 381 < 469）。
  - 前端 `type-check` + `build-only` 通过。
- **测试环境备注**：CDP `Fetch.enable` 与页面级 fetch/XHR 拦截都会干扰进房或详情加载，验证依赖 Chrome 真实访问 Bangumi；mock 数据在 `/tmp/mock-server.mjs`。

### 2026-08-18 · joinRoom 回包字段对齐 + 调试日志

- **问题**：建房选择第 N 话后进房，自动选源仍搜第 1 话（「第几话建房自动播放」失效）；特定番（如无职转生 第三季）第 4 话打开抽屉仍可能重新搜索。
- **根因**：后端 `room.service.toPlaybackState`（joinRoom 回包）返回 `playback_episode_sort` / `playback_episode_id` / `playback_session_id` 等字段，而 `playback:state` 广播与前端 `PlaybackState` 接口使用 `episode_sort` / `episode_id` / `session_id`——前端读不到建房集数，`currentEpisodeSort` 恒为 null，自动选源 fallback 到第 1 话；集数相关缓存 key 也随之错位。
- **修复**（`anime-chat-server/src/room/room.service.ts`）：`PlaybackStateView` / `toPlaybackState` 与广播对齐（`episode_id` / `episode_sort` / `session_id` / `stream_url` / `position` / `paused` / `title` / `server_time` 等）；仅 joinRoom 回包使用，HTTP by-key 返回 group 实体不受影响。
- **调试日志**：前端 `[src-debug]` 前缀日志（room store joinRoom 回包字段、beginAutoSelect/openSearchDrawer/startSearch 的 sort/key/缓存命中、selectCandidate epSort、syncCurrentSourceFromPlayback 匹配），用于定位残余「重新搜索」。
- **验证**：前后端 `type-check` + `build` 通过；待用户真实环境复现并反馈 `[src-debug]` 输出。

### 2026-08-18 · 持久缓存命中后自动播放回归修复

- **问题**：用户复现「第 4 话建房 → 集数选择正确、缓存命中不再重搜，但自动选源不播放」。
- **根因**：上一轮加 sessionStorage 持久缓存时，恢复数据分支只填充了 `searchRows`，漏了与内存缓存命中分支一致的 `enqueueCandidates`（把候选喂给自动选源队列）→ `autoMode` 挂着但从不尝试播放。
- **修复**（`anime-chat/src/components/Room/PlayerPane.vue`）：持久缓存命中分支在 `autoMode` 时同样遍历候选入队并触发 `drainAutoQueue`。
- **验证**（headless Chrome + mock，真实 UI 链路）：首次进房搜索保存持久缓存并自动播放成功；**二次进房无 catalog/search-one 请求（持久缓存命中），仍发起 `POST /sessions/stream` + `set_source` → `GET stream` → `play`，自动播放成功**；前端 `type-check` + `build-only` 通过。
- **教训**：两处缓存命中分支（内存 / 持久）行为必须一致，后续改动需同时覆盖展示与自动播放两条路径。

### 2026-08-18 · PlayerPane 拆分重构 + 提交推送

- **拆分**：
  - `src/composables/useSourceSearch.ts`（610 行）：搜索/缓存/持久缓存、自动选源、当前源标记、选源
  - `src/components/Room/SourceDrawer.vue`（320 行）：抽屉 UI + 候选高亮 + 滚动定位（样式随迁）
  - `src/utils/source-quality.ts`：清晰度解析共用
  - `PlayerPane.vue` 1209 → 375 行：播放器 + 状态栏 + 组合逻辑（心跳、观众同步、播放历史）
- **验证**：前后端 `type-check` + `build` 通过；ESLint/Prettier 通过（lint-staged）。
- **提交**：后端 `1165c1d`（字段对齐）、前端 `e6071e1`（重构）+ `7bb76d0`（离开守卫 + a 标签）；均已 push origin main。
- **遗留**：前端工作区 ` .env.production` 未提交（提交流水线排除 .env）；根目录 `docs/` 不归 git 管理。
- **环境备注**：本次验证启动服务时误杀过正在运行的 3000/8012 进程，已恢复并交由用户手动重启；后续验证需先用独立端口或确认无冲突。

### 2026-08-16 · multer 启动依赖（已修复）

- **问题**：`node dist/main.js`（生产/独立启动）报 `Cannot find module 'multer'`——multer 仅为 `@nestjs/platform-express` 传递依赖，pnpm 严格布局下顶层不可见。
- **修复**：`multer@1.4.4-lts.1` 已声明进 `package.json` dependencies 并完成安装；`node dist/main.js` 启动正常。

### 2026-08-16 · P1-3 联调验收

- 双用户模拟脚本：注册/登录 → 建房（`season_id` 16 位 hex、房主正确）→ `joinRoom` 角色与在线人数 → **viewer 可读 host 播放会话且拉流非 404（P0-1 修复生效）** → `set_source`/`play`/`pause` 广播同步 → 非房主 control 403 → 聊天广播 → 房主离开转让 → 空房销毁（by-key 404）→ 越权全部 403（P0-2 修复生效）→ 本人可改。
- 结果：29 通过 / 0 失败；测试账号已清理。
- UI 渲染验收（headless Chrome + CDP）：首页（Bangumi 热门/每日放送）、详情页（/dev/detail/10380 命运石之门，评分/集数/制作信息）、房间页（/dev/room/:seasonId：播放器挂载、房主身份、当前集名、自动选源触发「正在尝试 · 叽哔3线」、聊天侧栏在线 1 + 复制链接）。截图存 /tmp/ui-*.png。
- 说明：本会话缺少特权浏览器桥接（node_repl），无法驱动用户 Chrome 扩展；headless Chrome 完成渲染层验收。真实双账号播放器同步建议人工复核一次。

### 2026-08-16 · P0-1 观众拉流

- **问题**：`joinRoom` / `createAndJoin` 从不写 `GroupUserMap`，而 `playback.service.findOwned` 成员鉴权依赖它 → 观众用自己 token 拉 host 流命中 404「播放会话不存在」（HLS 分片代理同样受影响）。
- **修复**：后端 `chat.gateway.ts` 进房成功后 upsert `GroupUserMap(group_id, user_id)`；`handleLeaveGroup` 在用户无残留 socket 时删除其 map 记录；`room.service.destroyRoom` 原有 map 清理保留。
- **验证**：后端 tsc + nest build 通过。

### 2026-08-16 · P0-2 用户接口越权

- **问题**：`PATCH /user/:id`、`DELETE /user/:id`、`PATCH /user/status/:id` 直接按 URL id 操作，任意登录用户可改他人昵称/头像/密码、删任意账号。
- **修复**：controller 校验 `req.user.user_id` 与目标 id 一致，否则 403；前端现有调用均为本人，不受影响。
- **验证**：后端 tsc + nest build 通过。

---

## 5. Git Ship 流程（本项目规范，之后一律按此执行）

参考成熟实践（git-ship、PR checklist、分支模型）并结合本项目现状定稿：

1. **分支**：修复类小改动可直接在 `main` 提交；新功能/重构从最新 `main` 切 `feat/xxx` 或 `fix/xxx` 分支。
2. **开发**：小步提交，每个 commit 只讲一个故事（可独立 review、可安全 revert）。
3. **校验（提交前必须全绿）**：
   - 后端：`pnpm exec tsc --noEmit -p tsconfig.build.json` + `pnpm run build` + prettier check
   - 前端：`pnpm type-check` + `pnpm build-only` + prettier check
   - 后端鉴权/DI/路由类改动：**真实启动** `NODE_ENV=development node dist/main.js` 确认（tsc 查不出 DI 错误）
   - UI 类改动：headless Chrome 渲染复测真实页面
   - 后端接口类改动：打真实接口跑全链路（详见 `COGNITION_SYNC.md` §8）
4. **CR**：合入前 review 完整 diff（正确性/安全/边界/命名/死代码），阻断项先修再合。
5. **提交信息**：emoji Angular 中文；subject 小写开头（commitlint 强制）；husky 自动跑 lint-staged（eslint + prettier）。
6. **合入**：`git merge --no-ff` 回 `main`（保留合入记录）→ `git push origin main` → 删除已合并分支。
7. **约定**：`.env*` 一律不提交；前后端两个仓库分开提交/推送；`pnpm-lock.yaml` 由 pnpm 维护，prettier ignore。
8. **文档**：代码/接口/实体有变动时，按 `COGNITION_SYNC.md` §7「改动联动清单」同步 `docs/` 与两仓 README，并更新 §3 看板与 §4 修复记录。

---

## 6. 备注

- **`docs/` 已纳入版本管理**：2026-09-15 起在 `docs/` 单独 `git init` 建仓（不含前后端代码），
  可独立提交推送。此前它不属于任何仓库、无法随代码提交，是文档漂移的根因。
- **待用户确认**：前端 `.env.production` 的 `VITE_BASE_URL` 由 `/pro/` 改为 `/` 仍未提交
  （提交流水线排除 `.env*`），部署路径变更需确认后再处理。
- AI 相关页面已从「占位」转为**在建**：侧边栏「时间表」已改为「AI 助手」(`/ai`，分支 `feat/ai-assistant`)，
  功能定位为「推荐番剧 / 寻找番剧」对话助手，技术栈见 `ai-chat-tech-stack.md`。
  当前前端只有占位页，**后端 AI 能力尚未实现**（无 `AiModule`、无模型调用）。
- 计划/规格旧文档（superpowers 时代）已删除；`api-auth-collection.md` 已重写为 `api-contract.md`。
  设计决策以上文 §2 与 `COGNITION_SYNC.md` 为准。
- 两仓均**没有可运行的测试**（后端 jest 已配置但 0 个 spec），验收全靠手动；见 `COGNITION_SYNC.md` §8。
