# 动漫放映室 · 项目记忆与任务同步

> 本文件是单仓（`client/` 前端 / `server/` 后端）的公共记忆与任务同步文档，`docs/` 与代码同仓。
> 修改代码、推进任务或发现新问题后，请同步更新「任务看板」与「修复记录」。
> 已废弃 superpowers 框架（2026-08-16），相关文档已清理；此文档取代旧的 specs/plans 作为唯一项目记忆。

### 文档入口

完整文档地图与给 AI 的阅读顺序见 [`README.md`](./README.md)。本文只保留**项目记忆**
（概览、进度、看板、修复记录）；跨端约定、接口、播放与 AI 分别见
`COGNITION_SYNC.md`、`api-contract.md`、`playback-architecture.md`、`AI.md`。

> 代码仓级工作规则：`../client/AGENTS.md`（前端）、`../server/AGENTS.md`（后端）、
> 独立仓 `../../anime-ai/AGENTS.md`（AI 服务）。

---

## 1. 项目概览

| 项 | 说明 |
| --- | --- |
| 前端 | `client/` — Vue 3 + TS + Vite + Pinia + Element Plus + Artplayer + hls.js + socket.io-client |
| 后端 | `server/` — NestJS 9 + TypeORM 0.2 + Socket.IO + MySQL + MinIO + qBittorrent |
| **AI 服务** | **`anime-ai`** — Spring Boot 4.0.8 + Java 21 + LangChain4j 1.20.0（2026-09-21 新增）。只做检索与模型编排，不碰业务数据；监听 8013 |
| 定位 | 动漫讨论平台 +「放映室」一起看：左播放右聊天、房主强同步、按随机 `season_id` 多厅；AI 助手提供推荐/寻找番剧 |
| 语言 | 注释、commit、UI 均为中文 |
| 仓库 | 单仓 github.com/Amenoe/anime-chat（`client/` + `server/` + `docs/`，版本 tag `v1.0.0`）；AI 服务仍是独立仓库 `anime-ai` |

### 命令速查

| 动作 | 前端（client/） | 后端（server/） | AI 服务（anime-ai） |
| --- | --- | --- | --- |
| 启动 | `pnpm dev`（localhost:8012） | `pnpm start:dev`（localhost:3000） | `mvn spring-boot:run`（localhost:8013） |
| 类型检查 | `pnpm type-check` | `pnpm exec tsc --noEmit -p tsconfig.build.json` | `mvn -q -B compile` |
| 构建 | `pnpm build-only`（跳过类型检查）/ `pnpm build` | `pnpm run build` | `mvn -B package -DskipTests` |
| 测试 | 无测试框架 | jest 已配但 0 spec | `mvn test`（`BangumiClientTest` **打真实 Bangumi 接口**，需联网） |
| 提交 | emoji 前缀 Angular 风格（commitlint + husky） | 同左 | 同左（手动遵守，无 hook） |

> Maven 不在默认 PATH 时：`export PATH="$PATH:/Users/rain/Java/apache-maven-3.9.9/bin"`；本机 JDK 25（Boot 4 基线 Java 17，`anime-ai` 编译目标 21）。

Commit 前缀：`🌟feat` `🐛fix` `📝docs` `💎style` `🌠refactor` `🚀perf` `🚨test` `📦build` `👷ci` `🔂revert`。
⚠️ commitlint 两条容易踩的规则：① **不允许 `🔀merge` 类型**，合并提交也要用那 10 种之一（用 `🌟feat`）；② **subject 不能以大写词开头**（`subject-case`），例如 `🌟feat(ai): AI 助手...` 会被拒，改成中文开头即可（`新增 AI 助手...`）。

### 环境变量（重要）

- 前端 `.env.*`：`VITE_SERVE_URL`（后端地址）、`VITE_BASE_URL`、`VITE_BASE_API`（/api）、`VITE_TIME_OUT`
- 后端 `.env.development` / `.env.production`：`DB_*`、`JWT_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ACCESS_EXPIRES_IN`（默认 2h）/ `JWT_REFRESH_EXPIRES_IN`（默认 30d）、`MINIO_*`（头像对象存储）、`QB_*`（BT 边下边播）、`OUTBOUND_PROXY`（可选出站代理）、**AI 网关：`AI_SERVICE_URL`（默认 `http://127.0.0.1:8013`）/ `AI_INTERNAL_TOKEN`（须与 anime-ai 侧一致）/ `AI_DAILY_QUOTA`（默认 50）/ `AI_HISTORY_WINDOW`（默认 20）等**
- anime-ai 侧 `.env`：`AI_CHAT_API_KEY`（DeepSeek，必需）、`AI_CHAT_MODEL`（默认 `deepseek-flash`）、`AI_INTERNAL_TOKEN`、`AI_EMBEDDING_API_KEY`（SiliconFlow，M2 才用）
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
- 模块：auth / user / user-anime / group（旧聊天）/ room（放映室）/ chat（Socket Gateway）/ playback（播放）/ media-source（数据源）/ storage（MinIO 头像）/ ai（网关）/ track（埋点）/ admin（管理端）
- 数据库：MySQL `anime_chat`；dev 用 TypeORM `synchronize: true`，**生产关掉并用 `docs/schema.sql` 建表**
- 头像存 MinIO Private 桶，DB 记代理路径 `/api/images/avatars/...`，前端经 `resolveAvatarUrl` 访问

---

## 2. 当前进度（截至 2026-11-05）

> 平台已上线生产（`http://8.130.120.172`，2C2G，Nginx + systemd + GitHub Actions 自动部署），
> 部署细节见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。单仓（`client/` + `server/` + `docs/`，tag `v1.0.0`）。

### 已完成

- **账号与用户**：注册/登录、JWT 双 token + 前端静默刷新（刷新即轮换、复用检测整户吊销）、
  头像裁剪上传（MinIO Private 桶）、昵称放开到 1–20 码点（含 emoji）、个人中心
- **番剧与数据源**：首页/搜索/详情全部走 Bangumi；追番（想看/在看/看完）；数据源订阅与
  站点列表（按用户隔离缓存）；首页骨架屏
- **放映室**（`/room/:seasonId`）：多厅、房主强同步、观众只读跟随、房主离开转让、
  空房销毁、进出提示、移动端适配
- **点播室**（`/vod/:seasonId`）：私人房间、邀请链接、房主选源/成员跟随、房主离开解散、
  无弹幕；与放映室共用 `ChatPaneBase`
- **播放**：流媒体 Range 代理、m3u8 相对 URI 改写、BT 磁力**边下边播**（qBittorrent）、
  mkv/HEVC 走 HLS 分片按需转码、内嵌字幕 ASS→VTT（双语合并、字号四档）。
  架构与限制见 [`playback-architecture.md`](./playback-architecture.md)
- **管理端**：只读看板（埋点 + AI 用量，亮暗主题）、用户管理（分页/搜索/封禁/改角色/
  重置密码/级联删号）、审计日志、AI 会话审阅、埋点明细查询与 CSV 导出。
  契约见 [`api-contract.md`](./api-contract.md) §7，设计依据见 [`admin-roadmap.md`](./admin-roadmap.md)
- **AI 助手**：`/ai` 对话（SSE）、5 个工具、每日配额、话题范围守卫（fail-open）、
  RAG M2（3000 条语料，`hybrid` 策略 **Hit Rate@10 100% / MRR 0.8056**）、
  系列级知识（TMDB 分集简介）。细节见 [`AI.md`](./AI.md)
- **埋点**：`track_event` 统一事件流（前端 `v-track` + 后端 `ai.chat`），看板 v2
  （访问量/消耗/使用率，事件中文化）
- **工程**：`schema.sql` 实测可空库建表且幂等（14 张表）；双 token 真实接口验收 24/24、
  管理端 57 项断言连跑 3 次全绿；单仓两端与 `anime-ai` 的 `type-check` / `build` / `lint` 全绿

### 进行中 / 待办

- **RAG 下一步**（#16）：显式重复 `meta_tags` 做 term weighting、扩充 golden set（现 12 条）；
  台词 RAG 与弹幕库仅规划、未实施（见 [`AI.md`](./AI.md) §6）
- **管理端剩余**（#20）：系统配置（P2）、番剧数据维护（按方案 A 删除，见 [`admin-roadmap.md`](./admin-roadmap.md) §8）
- 已知未修：`pnpm build` 在 pnpm 10 下因 `config.commitizen` 失败（验收用 `type-check && build-only` 代替）

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
| 5 | P1 | 文档同步：`docs/schema.sql` 补全新表；README 更新；仓级 AI 工作指南补放映室/播放/媒体源模块清单 | ✅ 2026-08-16 | schema 已含 group/playback/media_source 等全部表 |
| 6 | P2 | 前端 chunk 拆分 | ✅ 2026-08-17 | Element Plus 按需引入 + artplayer/hls.js 独立分包；index 1.2MB → 525KB（gzip 408→176KB） |
| 7 | P2 | `/timeline` 改为 AI 相关页面 | ✅ 2026-09-21 | 已并入 `anime-chat` main（merge `727dc25`）。侧边栏「时间表」→「AI 助手」(`/ai`)，`/timeline` 保留重定向兼容旧书签；`views/ai/Ai.vue` 暂为占位页，待接入真实对话（见 #15） |
| 8 | P2 | heartbeat 广播节流 | ✅ 2026-08-17 | 1s 内不重复广播 playback:state；非心跳控制即时广播 |
| 9 | P2 | 首页「最近播放」 | ✅ 2026-08-17 | localStorage 记录；首页顶部横滑卡片，无记录隐藏；埋点：详情页点集/选源、放映室开播换源切集 |
| 9 | P1 | 放映室离开二次确认 + 侧边栏改 a 标签 | ✅ 2026-08-17 | 头像/侧边栏导航弹确认；a 标签支持中键/Cmd 新开 |
| 10 | P1 | 选源抽屉数据同步 + 当前源高亮/滚动定位 | ✅ 2026-08-17 | 会话内 + sessionStorage 持久缓存；播放标题兜底匹配当前源；打开抽屉直接展示并滚动定位 |
| 11 | P1 | joinRoom 回包字段对齐（`playback_episode_*` → `episode_*`） | ✅ 2026-08-18 | 修复「第几话建房不自动播第几话」；另加 `[src-debug]` 日志定位残余重搜 |
| 12 | P2 | PlayerPane 拆分重构 | ✅ 2026-08-18 | 1209 行 → 375 行；拆出 useSourceSearch / SourceDrawer / source-quality；已提交推送 |
| 13 | P1 | JWT 双 token + 前端静默刷新 | ✅ 2026-09-15 | accessToken 2h / refreshToken 30d 落库轮换吊销；前端 401 单次重试 + 并发合并；真实接口验收 24/24 |
| 14 | P1 | 文档同步与前后端认知同步 | ✅ 2026-09-15 | 新增 `COGNITION_SYNC.md` + 后端仓级工作指南；`api-contract.md` 重写；`schema.sql` 补 `refresh_token`；`docs/` 纳入版本管理 |
| 15 | P2 | AI 对话 MVP（对话 + 番剧工具 + SSE + 配额） | ✅ 2026-09-21 | **`anime-ai` 服务**✅（SSE 实测通 DeepSeek、2 个工具、4 个真实接口测试）；**NestJS 网关**✅（`3858179`）；**前端对话界面**✅（`aa65f50`，分支 `feat/ai-chat-ui` 未合并）。浏览器实测 11/11：流式渲染、Markdown、卡片、点按跳详情、刷新恢复；**用户头像同步 + 卡片与推荐对齐 + 埋点体系**✅ 2026-09-21（已合入 main 并推送） |
| 17 | P2 | 管理员数据看板（展示埋点与 AI 用量） | ✅ 2026-09-22 | 前端 `/admin` + 侧边栏按 role 动态入口；图表用 echarts 6（按需注册 + 独立分包，Admin 101KB / charts 549KB 均为懒加载）。顺带修出 3 个后端统计 bug（见 §4）。**初始没有任何 root 账号**，需手工 `UPDATE user SET role='root'`（见 `api-contract.md` §5） |
| 16 | P2 | RAG / 知识库 / Workflow 能力建设 | 🔄 2026-10-23 | 见 `AI.md`。**M1/M2 已验收**：3000 条语料、幂等/增量断言、冷启动 3 分 42 秒；检索策略对照后 **`hybrid` 成为默认（Hit Rate@10 100% / MRR 0.8056，基线 91.7% / 0.6285）**，RRF 与语料去噪两个改动被数据否掉。**2026-10-23 收尾**：策略/开关改配置、`search_knowledge` 两级降级、工具失败不再把原始异常塞回模型；新增系列级知识（TMDB `series_outline` / `find_character_episodes`）。**M5 取消**，台词 RAG / 弹幕仅规划。下一步：`meta_tags` term weighting、扩 golden set（见 `AI.md` §6） |
| 18 | P1 | 看板 v2：亮色适配 / 事件中文化 / 指标重构 / AI 登录门禁 | ✅ 2026-09-22 | 新增 `stats/engagement`（访问量·消耗·使用率）；`CHART_COLORS` 改为运行时读 CSS 变量（图表终于跟随主题）；事件中文名映射 `constants/track-events.ts`；AI 页未登录不再发请求。**顺带修出 `search.submit` 从未上报**（见 §4） |
| 19 | P1 | anime-ai 话题范围守卫（只聊动漫） | ✅ 2026-09-22 | 提示词加固 + 输入前置拦截，**fail-open**。拒答走正常 SSE、`finishReason=SCOPE_REJECTED`、不计为错误。71 项纯函数单测 |
| 20 | P1 | 管理员功能建设（用户管理 / AI 会话审阅 / 埋点明细 / 系统配置 / 番剧数据） | 🔄 2026-10-23 | 见 `admin-roadmap.md`。**已完成**：用户管理（含前端）+ 安全收口（封禁三处即时失效、`RootGuard`、`admin/users`、级联删号、审计表）、**AI 会话审阅**（列表不回标题原文、单会话读取审计）、**埋点明细查询/导出**（游标分页、CSV 注入防护、硬上限）。**剩余**：系统配置（P2）、番剧数据维护（按方案 A 删除，见 roadmap §8） |
| 21 | P1 | 播放能力拆分：详情页移除播放 + 新增点播室 `/vod` | ✅ 2026-10-30 | 详情页 `PlaybackPanel` 删除；点播室是**私人房间**（`POST /api/rooms/vod`，`anime_id=0` 不进公开列表，邀请链接 `/vod/:seasonId`）：房主选源、成员只读同步，房间内聊天、无弹幕，**房主离开即解散**；聊天面板抽 `ChatPaneBase` 与放映室共用；双浏览器实测：建房→邀请→跟随播放→聊天→房主退出解散 |
| 22 | P1 | 修「下载前就判定不能播 / 下载完也不能播」→ 边下边播 | ✅ 2026-10-30 | ① `create()` 不再同步等 metadata（超时不再是 400）；② qB 加种幂等 + 只下选中文件 + 顺序下载；③ 出流按「已下载字节」裁剪 Range，不足返回 503；④ **`local_path` 曾被写成种子目录**（多文件种子 `content_path` 是目录）→ 下载完也播不了；⑤ mkv/HEVC 用 ffmpeg 转 HLS 分片（真实时长 + 可拖动）；⑥ 前端缓冲自动重试。见 §4 |
| 24 | P2 | 字幕字号可调（ASS 特效暂不做） | ✅ 2026-10-31 | `AnimePlayer` 用 `video::cue` 动态规则给 80/100/130/160% 四档，localStorage 持久化；ASS 特效（描边/字体/定位）需要 JASSUB 或服务端烧录，方案已写进 `playback-architecture.md`，未实现 |
| 23 | P2 | 内嵌字幕显示（ASS→VTT） | ✅ 2026-10-30 | `GET .../subtitles` + `.../subtitle/:track.vtt`；ASS 只保留对白；双语同刻 cue 合并成一条多行；前端 `AnimePlayer` 单选轨道下拉。**外挂字幕文件仍不下载**（用户明确只做内嵌） |

---

## 4. 修复记录

### 2026-11-05 · 详情页返回按钮 + 点播室离开确认（桌面 / 移动端）

- **详情页返回**：`Detail.vue` 顶部加 `.detail-back` 按钮（骨架屏之上，加载中也能点）；
  优先 `router.back()`，从外部链接直接打开、没有历史时回首页。
- **点播室离开确认**：`useLeaveRoomGuard` 从只拦截 `Room` 扩展为同时拦截 `Room` / `VodRoom`：
  - 房主文案强调「离开后房间会立即解散，其他成员也会被请出」，确认按钮用 danger；
    成员是普通「离开后需通过邀请链接重新进入」。
  - 点播室「退出房间」按钮也走同一守卫（之前点一下就直接退）。
  - 移动端顶部导航原本是 `<router-link>`，默认导航先于 `@click` 执行，`preventDefault()`
    拦不住；改为 `<a :href>` + `onMobileNavClick`，与桌面侧边栏同一套拦截逻辑。
- **验证**：桌面侧边栏、移动端导航、点播室「退出房间」都会弹「离开点播室」；
  点「留下」留在房间、点「离开」才跳转；放映室仍弹原「离开放映室」提示；
  详情页返回按钮点击回到上一页。`pnpm type-check` / `build-only` / `lint` 全绿。

### 2026-11-05 · 管理看板暗色表格白底白字 + 首页骨架屏

**问题一**：管理看板「AI 用量 TOP 用户」的斑马纹行在暗色主题下是白底白字，几乎读不出。

- 根因：Element Plus 的 stripe 直接读 `--el-fill-color-lighter`，而 app.less 只覆盖了
  `--el-fill-color-light` / `--el-fill-color-blank`，这个变量仍是亮色默认值 `#fafafa`；
  且只有 `.user-table` 补了 el-table 变量，`AI TOP / 会话 / 埋点 / 审计` 这些
  `.admin-table` 没有。
- 修复：两套主题都定义 `--el-fill-color` / `--el-fill-color-lighter`（= `--surface-weak`）；
  把 el-table 变量从 `.user-table` 提升到 `.admin-table`，所有管理表格统一一套暗色令牌。
- 验证：暗色 stripe `rgba(255,255,255,.04)` + 白字、亮色 `rgba(31,36,48,.04)` + 深字，
  控制台无错误。

**问题二**：首页加载慢（Bangumi 反代 2–30s）时只有区块标题，没有加载反馈。

- 修复：home store 增加 `hotsLoading` / `calendarLoading`（两个接口分别结算，快的区块先渲染）；
  `HomeList` 增加 `loading`（12 张卡片骨架），`WeeklyTimeline` 增加 7 列 × 4 张骨架；
  骨架样式（`.skeleton-block` / `.skeleton-line` + shimmer）提到全局 `app.less`，
  搜索页复用同一套并删掉重复定义。
- 验证：CDP 拦截 `api.bgm.tv` 观察加载中 24 张首页骨架 + 28 张时间表骨架；
  放行后骨架归零，真实卡片 22 / 时间表 114，无控制台错误。
- `pnpm type-check`、`pnpm build-only`、`pnpm lint` 全绿。

### 2026-11-05 · 番剧搜源持久缓存不跟随站点变化（个人中心有源、房间里只有两个 BT）

**现象**：个人中心「数据源 → 站点」已恢复 18 个流媒体源，进入番剧放映室点「选源开播」，
抽屉里仍只有 2 个 BT 源。

**根因**：站点列表之外还有第二层缓存 —— `sessionStorage` 的搜源结果
`room-source-cache:v1:<bangumiId>:<sort>`（24h）。`startSearch` 命中时直接
`searchRows = persisted`，**不校验当前站点列表**，于是修复前写下的「只有两个 BT」结果继续展示。
这份 key 同样没有用户维度。

**修复**：

- 持久缓存 key 加 user id（`...:<bangumiId>:<uid>:<sort>`），读取时清掉旧的无用户 key。
- 命中持久缓存时先 `ensureCatalogEntries()` 对齐站点集合：一致才复用搜索结果；
  不一致（订阅增删、账号切换、旧残缺缓存）直接丢弃并重新搜源。
- `startSearch` 改为 async；打开抽屉时等行建好再同步「当前源」标记。

**验证**（local dev + 后端 3000，headless Chrome / CDP）：

- 注入旧格式（无 uid）2 行 BT 持久缓存：抽屉显示 **20 行 = 18 个流媒体源 + 2 个 BT**，
  旧 key 被删除、新 key 写入。
- 注入新格式 2 行缓存 + 20 条 catalog：识别到集合不一致，重新搜源后同样 20 行。
- `pnpm type-check`、`pnpm build-only`、`pnpm lint` 全绿。

### 2026-11-05 · 新用户站点缓存串账号：只剩两个 BT 源、没有流媒体源

**现象**：新注册用户打开「个人中心 → 数据源」，站点区只有 `nyaa.land` / `AnimeGarden`
两个磁力源，18 个流媒体源（css1）不出现；订阅区本身正常显示 css1 + bt1 两条。

**根因**：站点列表的 localStorage 缓存 key 是固定的 `media_catalog_entries`，**没有用户维度**。
同一浏览器切换账号（尤其先退出旧号再注册新号）会直接命中上一个账号的缓存；
若那份缓存来自「某次 css1 拉取失败、只返回 bt1」的部分结果，新用户就只看到两个 BT 源。
雪上加霜的是 `listCatalog` 返回的 `errors` 被忽略 ——
**部分订阅失败的结果也会被缓存 12 小时**，期间刷新页面都不自愈。

**修复**：

- `utils/media-catalog-cache.ts`：缓存 key 改为 `media_catalog_entries:<user_id>`；
  读取时清理旧的无用户维度 key；`clearCatalogCache()` 清理全部用户维度 key。
- `views/user/User.vue` 与 `composables/useSourceSearch.ts`：
  - 读写缓存都带当前 `userInfo.user_id`；
  - `errors` 非空时**不写缓存**，并弹「部分订阅拉取失败」提示（保留上一次完整列表）。

**验证**（local dev + 后端 3000，headless Chrome / CDP）：

- 复现：注入一份只有 2 条 BT 的旧 `media_catalog_entries` 缓存 + 新账号登录，
  站点区显示 2 条（修复前）。
- 修复后同一场景：站点区 20 条 = **18 个流媒体源 + 2 个 BT 源**；
  旧 key 被删除，新 key `media_catalog_entries:<uid>` 写入 20 条。
- 用 CDP 拦截 catalog 返回 `errors: ['css1: timeout']`：页面显示 1 条 + 警告提示，
  localStorage 不产生新缓存（避免不完整结果固化）。
- 放映室「选源开播」：搜源流程写入同一用户维度缓存 20 条。
- `pnpm type-check`、`pnpm build-only`、`pnpm lint` 全绿。

### 2026-11-04 · 复制链接全线修复（非安全上下文 + 双斜杠）

**背景**：平台只有两处复制链接入口 —— 放映室聊天侧栏「复制链接」（`/room/:seasonId`）
与点播室房间「复制邀请链接」（`/vod/:seasonId`）。两者都直接调用
`navigator.clipboard.writeText(origin + base + path)`。

**根因**（headless Chrome 实测）：

1. **线上根本复制不了**：`navigator.clipboard` 只在安全上下文（HTTPS / localhost）存在。
   生产是 `http://8.130.120.172`，非 localhost 的 http 页面里 `navigator.clipboard` 是
   `undefined`，`navigator.clipboard.writeText(...)` 直接同步抛 `TypeError`，
   原来的 `.catch` 根本接不到 —— 点击后没有任何提示，剪贴板也没变。
2. **双斜杠**：`base` 生产是 `/`，字符串拼接得到 `http://host//room/xxx`；
   开发是 `/dev/` 才碰巧正确。`base` 若改成不带尾斜杠（`/app`）还会拼出 `/approom/xxx`。

**修复**：

- 新增 `client/src/utils/share.ts`：
  - `shareUrlOf(router, to)`：用 `router.resolve()` 生成带 base 的 href，再交给
    `new URL()` 补 origin；`new URL` 会折叠多余斜杠，也避免 `//xxx` 被解析成协议相对地址。
  - `copyText(text)`：优先 Clipboard API；不可用或被拒时降级到
    `textarea + document.execCommand('copy')`（含 iOS 的 `setSelectionRange`、复制前后
    选区/焦点恢复）。返回布尔值，调用方据此提示成功/失败。
- 两处入口统一改走这两个函数：成功后弹「已复制…」通知（用户明确要求复制完成要有提示），
  失败弹「浏览器未允许访问剪贴板，请手动复制地址栏链接」。

**验证**（2026-11-04，本地 dev + 后端 3000 + MySQL，headless Chrome 156 / CDP）：

- `pnpm type-check`、`pnpm build-only`、`pnpm lint` 全绿。
- localhost 安全上下文（`navigator.clipboard=object`）点两处按钮，剪贴板读回
  `http://localhost:8012/dev/vod/<id>`、`.../dev/room/<id>`，通知「已复制邀请链接/放映室链接」。
- 局域网 IP `http://192.168.2.80:8012`（非安全上下文，`navigator.clipboard=undefined`）：
  修复前点击立即抛 `TypeError: Cannot read properties of undefined (reading 'writeText')`、
  无通知；修复后 `execCommand('copy')` 返回 true、选中文本即完整链接、通知正常。
- 权限拒绝降级：把 `navigator.clipboard.writeText` 覆写为抛 `NotAllowedError`，
  `copyText` 仍走 execCommand 成功。
- URL 规范化：`absoluteShareUrl('/room/abc', 'http://8.130.120.172')` →
  `http://8.130.120.172/room/abc`；`'//room/abc'` 也归一到同一结果，未变成协议相对地址。
- 测试账号 `copytest01` 与测试房间已通过级联删号清理。

**已知边界**：未登录用户打开邀请链接仍会被弹回（点播室回 `/vod`、放映室回首页 + 「未登录」提示），
登录后需重新点一次链接；本次未改登录回跳流程。

### 2026-11-03 · 线上四项：昵称放开、观众锁进度条、移动端横屏、AI 配额复核

**背景**：站点已上线（`http://8.130.120.172`，部署细节见服务器
`/www/wwwroot/DEPLOYMENT-RECORD.md`），用户提了四点。前三项改代码，第四项是核对既有实现。

1. **昵称限制过严**：旧规则 `^[a-zA-Z0-9一-龥]{1,10}$` 把空格、标点、emoji 全挡住，
   「夜刀神十香🌸」「kirito · 桐人」都存不进去。改为 **1–20 个码点 + 禁控制字符 + 裁掉首尾空白**，
   其余放开。前后端同一套规则：`server/src/user/nickname.ts`（`@IsNickname()` 装饰器，
   顺带解决 `@IsNotEmpty` + `@Matches` 同时失败时拼出两句提示的问题）与
   `client/src/utils/nickname.ts`（Element Plus 校验器）。`nickname` 列是 `varchar(255)` +
   `utf8mb4`，**不需要改表**。
2. **观众能拖进度条**：根因是旧实现给播放器外层容器整体 `pointer-events: none` ——
   ① 连全屏按钮一起冻住；② 网页全屏时 Artplayer 把播放器节点搬到 `document.body`
   （`FULLSCREEN_WEB_IN_BODY`），挂在祖先上的规则随之失效，观众反而能在全屏里拖。
   现在只给 `.art-progress` 节点打行内 `pointer-events: none`（节点被搬走也生效），
   并关掉 `hotkey` / `gesture`（键盘快进、视频区滑动 seek）。全屏、音量、播放暂停仍可用。
3. **移动端全屏不横屏**：打开 Artplayer 内置 `autoOrientation`（仅移动端生效）：
   原生全屏走 `screen.orientation.lock('landscape')`，Web 全屏在 iOS 等不支持方向锁的浏览器上
   退化为 CSS 旋转 90° 铺满。
4. **AI 每日次数**：已有实现，无需改动 —— `AiService.consumeQuota()` 在写 SSE 头之前
   用 `INSERT ... ON DUPLICATE KEY UPDATE` 原子自增 `ai_usage`，超限抛 429
   「今日 AI 对话次数已用完（50 次/天）」；上游不可达会退回配额；中途断开照扣（防重连绕过）。
   生产 `.env.production` 已配 `AI_DAILY_QUOTA=50`。

**验证**（本地 dev，2026-11-03）：

- 接口：20 emoji ✅ 201 / 21 码点 ❌ 400 / 纯空格 ❌「昵称不能为空」/ 中英混排 ✅，
  首尾空格被裁掉。
- 浏览器（headless Chrome + 真实点播室，房主 + 观众两个账号）：房主 `progress` 的
  `pointer-events=auto`、观众为 `none`；暂停后观众点击 60%、拖动 10%→90%、按 → ×5、
  移动端触摸拖进度条与视频区横滑，时间均不变（4.25 → 4.25）；房主点 50% 正常跳到 149s。
- 移动端（iPhone UA + 390×844）：全屏后 `art-fullscreen-web` + `art-auto-orientation` 同时命中。
- 昵称表单：`夜刀神十香🌸 · 测试` 无错误提示，21 字提示长度错误。

### 2026-10-30 · 点播室拆分 + 磁力「边下边播」

**背景**：详情页的播放面板与放映室没有任何联动，谁都能往里塞资源播；同时磁力测试出现
「还没下载就提示不能播放」「下完了也播不了」两种失败。于是把播放从详情页拆出去，并重做播放链路。

**三个根因**（都不是「前端没写好」）：

1. `create()` 同步等 metadata（最长 30s），超时直接 400 —— 磁力 metadata 经常 1-2 分钟才到，
   用户看到的就是「下载前就判定不能播」。现在先落库 `fetching` 立刻返回，后台补选文件；
   `refreshOne` 对「元数据迟到」也会自动补选，不再标 `failed`。
2. `resolveLocalPath` 把多文件种子的 `content_path`（**是目录**）当成了播放文件，
   `local_path` 指向目录 → `statSync` 读到 160 字节 → 永远「缓冲不足」。修复为只接受普通文件。
3. 下载中 `size < playableMinBytes` 直接 400，且 `toView` 只在 `playable/ready` 给 `playUrl`。
   现在按「已下载字节」裁剪 Range，不足先等、超时 503；播放器每 2s 自动重试并 seek 回原进度。

另外：番剧磁力常见 `xxx.mkv`（HEVC 10bit + ASS），浏览器根本不认这个容器。新增
`MediaTranscodeService`：ffmpeg 输入走 pipe（只喂已下载字节，避免 qB 预分配的空洞当数据），
输出 frag-mp4；h264 直接 copy，HEVC 才转码（macOS 走 `h264_videotoolbox`）。
实测 `Get /api/playback/sessions/:id/stream?format=fmp4` 在 headless Chrome 里
`readyState=4, currentTime=8s, 1920x1080`。

**同日补丁：mkv 从「单条 fMP4」改为 HLS 分片。** 用户实测进度条只显示 20 秒、不能拖动 ——
fragmented mp4 没有 moov 索引，浏览器拿不到总时长。现在 `/hls.m3u8` 一次性给出全部
EXTINF + ENDLIST（实测 24:00、241 片），播放器能算出真实时长并 seek；分片首次请求时用
ffmpeg 精确 seek 转码 6 秒并落缓存。⚠️ 分片必须 `-copyts`（保留原始时间戳）：每段从 0 开始
会让 hls.js 判定时间戳回退，播放卡在第一片末尾、且没有任何报错。实测点进度条 40% →
`09:38 / 24:00` 并继续播放。

**同日再补：点播室从「公共聊天室」改为「私人房间」。** 原设计是全局大厅 + 各自播放，实际用起来
不像「一起看」。现在：`POST /api/rooms/vod` 建私人房间（`anime_id=0`、随机 `season_id`、不进详情页
房间列表），邀请链接 `/vod/:seasonId`；房主选源后**只广播 `session_id`**，成员用自己的 token 拉流
（不把房主 accessToken 泄给观众）；`playback:control` 仅房主、成员播放器 `controlled` 只读；
`ChatGateway.handleLeaveGroup` 对 `anime_id===0` 的房间在房主离开时直接销毁并广播 `room:destroyed`；
聊天随房间销毁。踩过的坑：房主建会话时**必须带 `groupId`**，否则成员拉流走 `findUserMap` 鉴权失败，
观众端 404「播放会话不存在」。

**验证**（真实接口 + 浏览器，非 mock）：mp4 下载中拉流返回
`206 Content-Range: bytes 0-233366214/276134947`（裁剪到已下载）；点播室 UI 粘贴磁力 →
播放器出现 → 播放；`/dev/detail/10380` 只剩「简介 / 剧集」两个 section；
点播室聊天发消息后消息落库并回显。

### 2026-10-14 · M2 验收收口、评估集纠错与三项技术债

**M2 五条验收标准全部达成**（脚本与数字见 `anime-ai/eval/README.md`）：3000 条语料、
Hit Rate@10 **91.7%** / MRR **0.6285**、幂等与增量各有断言脚本、冷启动实测 300 条 3.2s。

⚠️ **比数字更重要的一件事：一条误判被纠正了。** 原文写着「『时间循环 悬疑』top-5 不含
《命运石之门》→ 语义召回不能算验收完成」。该条验收标准是「结果**合理**」而非「必须命中
某部作品」——它实际 **rank=1 命中《古诺希亚》**，而古诺希亚/夏日重现/四叠半时光机都是
确凿的时间循环题材。用单一期望 id 判定会把「语义正确但不是我想的那部」算成失败，
**系统性低估质量**：修正评估集后基线从 66.7% 升到 91.7%。
反向的坑同样要防：把 `expect` 扩到 top10 全算对就等于自证，边缘相关的仍不收。

**唯一真失败已定位到根因**（`C2 催泪 家族 治愈` → CLANNAD 系未进 top10）：
不是语料缺词 —— 换成同样在语料里的「亲情」「家庭」也召不回，而**去掉「家族」、
只用「催泪 治愈」立刻 rank=5**。即**多词查询被强特征词主导**。改进方向是查询分解 +
多路召回融合（M4 的 RRF），不是重做语料。

**三项技术债，每一项都是实测踩出来的：**

1. **`mvn` 不带 `clean` 会跳过增量编译，把「编译不过」伪装成全绿。** pom 里有一行
   `--enable-preview`（且代码根本没用 preview 特性），而 `source 21` + JDK 25 下它是
   **硬错误**：`源发行版 21 与 enable preview 一起使用时无效`。因为 target/ 里有旧 class，
   `mvn package` / `mvn test` 全都看起来通过，**于是编译不过的代码被合进了 main**；
   `git stash` 后对已提交版本 `mvn clean compile` 可复现同样失败。
   → 判断编译是否通过**必须用 `mvn clean`**，不要拿不带 clean 的输出下结论。
   （另：XML 注释里不能出现连续两个减号，我在 pom 注释里写了参数名，直接把 POM 写坏。）
2. **内部令牌校验抽成拦截器**：原本 `ChatController` 与 `KnowledgeController` 各有一份
   **逐字相同**的私有方法。本仓已因这类重复踩过两次（漏挂 `/ping`、`assertRoot` 抄两份）。
   拦截器罩住 `/internal/**`，新增端点**默认安全**，忘记配置的代价从「泄漏」变成「调不通」。
3. **语料源的 0 条不再伪装成成功**：本地 `anime` 表为空时原样返回 `upserted=0`，
   与「幂等跳过」长得一模一样（区别只在 `loaded=0`）。现在报 400。
   顺带查出 `.env.example` 的 JDBC 模板本身是错的 —— `characterEncoding=utf8mb4`
   （MySQL 字符集名）在 Connector/J 9.x 下抛 `UnsupportedEncodingException`，
   而要的是 Java 字符集名 `UTF-8`；配了它 `useBangumi` 就默认 false，
   **默认语料源变成一调就炸的 mysql**。

⚠️ **Spring Boot 4 配置迁移**：`server.error.*` 已迁到 `spring.web.error.*`，
旧名标记为 `deprecation level=error` 却**静默不生效** —— 我先写成旧名，实测错误响应
仍只有 `{"status":400,"error":"Bad Request"}`，与「语料源返回 0 条」「jdbc 字符集写错」
两种完全不同的故障长得一模一样，根本没法排障。

### 2026-09-23 · 管理页切换覆盖、用户表暗色适配与 AI 工作指南迁移

- 管理页使用绝对定位的路由动画，且 `Admin.vue` 以 renderless 的 `el-config-provider` 作为根节点；路由离场后 Transition 留下空占位，后续页面未挂载。移除这层自定义过渡，保留 Search 的 KeepAlive，页面切换后旧页卸载、新页显示。
- 用户管理表及隔行背景都改用项目主题令牌，暗色主题不再出现 Element Plus 默认白色条纹。
- 三个代码仓将 `CLAUDE.md` 迁移为面向通用 AI 编码助手的 `AGENTS.md`，并同步当前文档入口；保留各仓技术边界与验证约定。
- **验证**：`pnpm type-check`、`pnpm build-only`、`pnpm lint` 与 Prettier 均通过；真实 headless Chrome 验收 9/9（含用户管理、暗色样式目测、离开管理页后首页可见、切回看板与 0 console error），临时账号已清理。构建保留既有 Rollup 注释/分包/chunk 体积警告；截图 `/tmp/parent-admin-users.png`。

### 2026-09-22 · 管理端落地：封禁、用户管理、级联删号、安全收口

按 `admin-roadmap.md` 的 P0/P1 实施，五件事：

1. **封禁用新列 `disabled_at`，不复用 `status`**。`status` 是**在线状态**（登录置 1、
   `User.vue` 离开置 0）—— 复用会让「关掉页面」显示成「已封禁」。
   即时失效靠**三个拦截点**（`JwtStrategy.validate` / `login` / `refresh`），
   判定集中在 `AuthService.assertNotDisabled()` 一处。
   **不需要 accessToken 黑名单**：`validate` 本就每请求查库，多判一个字段是免费的。
2. **抽公共 `RootGuard` 替掉两份 `assertRoot`**。原先 `track` 与 `ai` 各写一份，
   而且都踩过「漏挂 JWT 守卫 → 连管理员都 403」的坑。抽成守卫后，
   挂错一次就立刻暴露，不必每个 controller 各漏各的。
3. **删掉越权枚举接口 `GET /api/user`**：它只要求「登录」不要求 root，
   等于任何注册用户能枚举全站账号（含 `role`，连谁是管理员都暴露），而前端全仓从未调用。
   规划文档原本建议「收紧为仅 root」，但管理端列表已由 `/api/admin/users`
   （分页 + 关键词 + 字段白名单）承担，保留一个无分页的 root-only 副本只是死代码 → 选择删除。
4. **删掉整个停用的番剧 HTTP 子系统**（`AnimeController`/`AnimeService`/`AnimeModule`/DTO/`AnimeEp` 实体）。
   核查依据：`UseGuards` 出现 0 次（无鉴权）、写操作是 `return 'This action adds a new anime'`
   这类脚手架桩、`anime`/`anime_ep` 两张表 0 行、前端零调用。
   ⚠️ **桩在 `AnimeService` 而不是 `AnimeController`**（controller 只是转发）——
   规划文档这里写错了层，已修正，否则下一个人会照着 controller 找半天。
   `Anime` 实体**保留**：`chat.gateway` 那个已标 deprecated 的 `addGroup` 路径还在用它取标题兜底。
   `anime_ep` 表也从 `schema.sql` 移除了（实体与唯一使用者都已删，留着就是死表）。
   顺带**首次实测了 `schema.sql`**：建临时库执行 → 14 张表齐全、`user` 新列到位、重复执行幂等。
   生产建库依赖这个文件，之前从没跑过，属于「没验证过的关键路径」。
5. **修掉 `UserService.delete` 的孤儿数据**（8 张表）。根因不是「忘了写 DELETE」，
   而是**同一个语义有两份实现**（用户自删 vs 管理删号）必然漂移 → 抽
   `AccountCleanupService.purge`，并**直接删掉 `UserService.delete` 这个裸删方法**，
   从结构上消灭「有人调了它」的可能。

**过程中踩到/查出的三个问题**：

- **DI 环**：`UserService` 被 `UserModule` 与 `AuthModule` **各提供一份**（既有重复），
  给它加 `AccountCleanupService` 依赖后 `AuthModule` 那份解析不出来。
  解法不是把 Room/Storage 也拖进 AuthModule，而是**去掉 `UserService` 对该服务的依赖** ——
  把级联调用上移到 `UserController.delete`，`UserService.delete` 整个删掉。
  教训：依赖注入报错往往在提示「结构问题」，顺着它改结构比加 import 更好。
- **防自锁判定的假阳性**：`countActiveRoots() <= 1` 只数未封禁的 root，
  于是「封一个**已经封了**的 root」必然命中 ≤1 而被拒 —— 可这个操作根本不减少可用管理员。
  加 `target.disabled_at == null` 作为前提，只在**真的会减少**时才拦。
- **验收脚本自己会留垃圾**：产品行为是**有意保留** `track_event`（埋点不属个人数据），
  于是脚本跑完在开发库里留下孤儿埋点行。脚本的断言验证保留行为、
  但**清理阶段必须把脚本自己造的数据删掉** ——「产品会留下这些行」不等于「可以往库里留垃圾」。
- **在共享库里不要断言全局不变量**（这条最值得记）：脚本原本断言「全局零孤儿」，
  结果被**并行运行的前端验证脚本**留下的 `page.view` 孤儿误伤 —— 那次失败与后端代码
  毫无关系，却看起来像回归。改成两条**各自可归因**的断言：
  ①「自己造的埋点行已清干净」（必须为 0）②「本次运行未新增孤儿」（运行前后基线之差）。
  历史残留只打印提示，不算失败。**教训：断言要能归因到被测对象，否则共享环境里的
  他人残留会持续制造假失败，久了就没人信这个断言了。**
- **兜底清理要能覆盖「崩在半路」**：脚本中途抛异常时，用户行可能已删，
  只按用户名清理会漏掉它名下的埋点。改成把测试账号 id 存在**模块级变量**里，
  `main().catch()` 按 id 删。

- **孤儿断言只查 `track_event` 是无效断言**（并行 agent 验收时指出，查证属实且更广）：
  脚本自己造数的 `ai_conversation`/`ai_message`/`ai_usage`/`user_anime` **没进清理**，
  于是崩溃运行留下了孤儿 —— 而「删号不留孤儿」正是它断言的项。改为统计**全部 8 张级联表**
  的孤儿总数并断言「本次增量 0」；兜底清理补齐漏掉的表（正常路径靠 API 级联不会漏，
  但**崩溃路径只能靠兜底**）。清理时全库实测有 `ai_message` 8 / `ai_conversation` 4 /
  `refresh_token` **49** / `playback_session` 4 行孤儿，其中 `refresh_token` 那 49 行是
  **修掉 `UserService.delete` 之前长年泄漏的历史残留** —— 正好是那个 bug 真实存在的物证。
  ⚠️ 教训：**断言范围必须覆盖「被测代码负责清理的全部对象」，否则它会在真正的泄漏面前照样通过。**

**验证**：新增可重复执行的 `scripts/admin-e2e.mjs`（**57 项断言，连跑 3 次全绿**），覆盖
非 root 越权（7 个端点全 403 + 匿名 401）、列表无 `password` 字段、**LIKE 通配符转义**
（`%%%` 不返回全表）、封禁三处拦截（旧 accessToken / 登录 / 刷新全部拒绝）、
解封恢复、改角色、**自锁防护**（封自己、改自己角色均 400）、重置密码与会话吊销、
**提权红线**（`PATCH /user/:id` 传 `role` → 400 且库里未变）、级联删号后
**9 张表零残留**、审计四类动作齐全且**不含密码明文**、`from/to` 与 actor 快照完整。
同时回归 `scripts/auth-e2e.mjs`（24 项全绿）。脚本自清理后库里 `orphan=0`、用户数不变。

**未处理（已记录，非本次范围）**：登录失败的错误信息会区分「不存在此用户」与「密码错误」，
等于**用户名枚举**；且密码错误返回 **400** 而非 401。这是既有行为，
改成统一文案是「可用性 vs 枚举防护」的产品取舍，留给用户决定。
脚本里已把断言写成「登录失败且无 token」而不是硬编码状态码，避免把既有行为当回归。

### 2026-09-22 · 看板 v2：亮色适配、事件中文化、指标重构、AI 范围守卫

一轮六项改进（用户提出），顺手查出 2 个真 bug：

1. **看板图表在亮色主题下看不清**（用户实测反馈）。
   根因：`CHART_COLORS` 把颜色硬编码成暗色一套 —— ECharts 画在 canvas 上读不到 CSS 变量，
   当初就「只好」抄了一份，结果亮色下坐标轴文字/网格线与背景糊在一起。
   **修法不是再抄一份亮色表**（品牌色一改就要同步两处、必然漏），而是新建
   `composables/useChartTheme.ts` 运行时 `getComputedStyle` 读令牌。
   同时 tooltip 也给了主题色（ECharts 默认白底黑字，暗色下很刺眼）。
   ⚠️ 踩到第二层：一开始依赖 `useTheme()` 的 `mode` ref，实测**直接改 `data-theme` 属性时图表不重绘**
   （亮色主色像素命中 0、旧暗色仍有 1307）。CSS 令牌挂在 `[data-theme]` 上，
   **DOM 才是唯一事实来源** → 改用 `MutationObserver` 监听属性。两条路径现在都生效。
   **验证手段**：采样 canvas 像素统计落在目标主色附近的个数（暗色 1504 → 亮色 1504、旧色残留 0），
   而不是「看着差不多」。
2. **`search.submit` 一次都没上报**（自查发现，非用户报告）。
   模板写 `@click="onSearch"` 时 **Vue 会把事件对象当第一个实参传进去**，
   而当时用 `onSearch(fromSortChange = false)` 的参数区分「新搜索 / 换排序重发」——
   事件对象是真值，于是埋点被静默跳过。
   **后果是看板「手动搜索次数」永远 0、「AI 使用率」永远 100%**，且不报任何错。
   修法不是加个判断补丁，而是**拆成两个入口函数**（`onSearch` 计数 / `runSearch` 不计数，
   `onSortChange` 调后者），从结构上消除「参数被事件对象顶掉」的可能。
   这个坑只有在核对**数据库真实行**时才会暴露 —— 界面上一切正常。
3. **事件代号改为中文直白名**：新增 `src/constants/track-events.ts`，
   `event.view` 这种内部代号不再直接摆给管理员。`page.view` 的文案由 `page` 拼出
   （`Home` → 首页访问），所以映射是**函数**不是纯字典。
   为此后端 `statsTopEvents` 改为按 `(event, page)` 分组。
   表里没有的事件名**原样显示而非「未知」** —— 新加埋点时一眼看出缺映射。
4. **AI 用量指标重构**：移除延迟与工具调用，聚焦**访问量 / 消耗 / 使用率**。
   新增 `GET /api/ai/stats/engagement`（口径集中在后端一处，含
   `ai_rate = AI 对话 ÷ (AI + 手动搜索)` 与两侧跳转率）。为此给搜索页补了两个埋点。
   使用率四张卡都把**算式**写进 hint，因为只看百分比无法复核口径。
5. **AI 助手改为登录后可用**：`/ai` 未登录只显示登录引导，不渲染对话区、不发任何 `/api/ai/*`。
   后端本来就要求 JWT，改的是前端体验。同时给 ai store 补 `reset()`——
   **store 是单例，登出不清空会把上一个人的会话列表与消息展示给下一个登录的人**，
   属于跨账号数据泄露而非体验问题。
6. **anime-ai 增加话题范围守卫**：系统提示词加固 + 输入关键词前置拦截（见
   `AI.md` §2.4）。拒答走**正常 SSE 流**、HTTP 200、
   `finishReason=SCOPE_REJECTED`、`status=ok` —— 拒答是业务结果不是错误，
   不能污染看板错误率（实测 0 条 `status=error`）。守卫是 **fail-open** 的：
   拒答需要正面证据、放行不需要，误伤（用户直接走掉）远比漏放（浪费一次生成）严重。
   71 项纯函数单测覆盖放行/拒答/注入/易误伤边界。

**验证**：三仓 tsc/build/lint/prettier/mvn test 全绿；headless Chrome 双主题像素级核对
（含 `data-theme` 属性路径与真实头部切换两条路径）、未登录门禁（`/api/ai/*` 请求数为 0）、
真实 AI 提问（20 张卡片、`failed:false`、413 个 text-delta、0 error）、
真实搜索（20 条结果 + 跳详情）、拒答端到端（网关埋点 `SCOPE_REJECTED`/`model=null`/0 error）。
指标口径用**已知数字的 fixture** 验算过一遍（期望 50/50/20/12000/1200 全部吻合），
再用真实产生的数据复核（3 次 AI + 1 次搜索 → 75%）。

### 2026-09-22 · 管理看板：顺带查出 3 个统计 bug + 1 个前端渲染 bug

做 #17 看板时，为了「看板显示的数必须是真的」逐个核对了统计口径，结果查出：

1. **零数据时 `SUM` 返回 `null` 而不是 0**（`ai.service.ts` / `track.service.ts` 的 `statsOverview`）。
   `COUNT` 天然返回 0，但 `SUM(...)` 在零行时是 NULL；当时只有 token 那几个 `SUM` 包了
   `COALESCE(...,0)`，`ok/error/aborted/today_requests/today_events` 全漏了。
   而 `toNumbers()` 是**故意跳过 null** 的（它只做「字符串→数字」，不补默认值），
   于是前端拿到一串 null。**修法是在 SQL 里 COALESCE，而不是让前端兜底** ——
   接口契约说好是数字，就不该把 null 漏出去。
2. **`statsTools` 把 JSON 数组当逗号分隔串分组**（`ai.service.ts`）。
   写侧存的是数组（`toolNames: [...toolNames]`），`props->>'$.toolNames'` 取出来是
   `["browse_anime"]`（MySQL 序列化多元素时带空格：`["a", "b"]`），
   而那条 SQL 的注释和 `GROUP BY` 都假设是 `browse_anime,search_anime` 这种裸名字 ——
   看板上工具名列显示成 `["browse_anime"]`。用多层 `REPLACE` 剥掉方括号引号。
   **修读侧而不是写侧**：数组能支持将来 `JSON_CONTAINS` 查「谁调用过某工具」，拍平就查不了了。
3. **`top-users` 只返回 UUID**，看板读不了。`LEFT JOIN user` 带出 `username/nickname`。
   必须 LEFT：匿名埋点 `user_id` 为空，INNER 会把它们吞掉导致排行总数对不上（实测验证过）。
4. **前端 `Admin.vue` 漏了 `@import '~styles/page'`** —— `.page` 不是全局样式，
   每个 view 各自引入。漏了以后 `height:100%` 与 `overflow-y:auto` 都不生效，
   页面高度变成内容高度（实测 1347px），被父容器 `.app-container__main` 的
   `overflow:hidden` 直接裁掉且**滚不动**，看板下半部分根本够不着。
   type-check / build / lint **全部通过**，只有真实浏览器量 `clientHeight` 才暴露。
   → UI 改动必须 headless Chrome 实测，别凭类型检查收工。

**验证**：后端 tsc/build/prettier 全绿；前端 type-check/build-only/lint/prettier 全绿；
headless Chrome 双场景 —— root 侧边栏出现「管理看板」且 4 个 canvas 均实际绘制
（抽样非透明像素）、TOP 用户表显示 `探针 @probeadmin`；普通账号侧边栏无入口、
直敲 `/admin` 只显示「仅管理员可访问」且 0 个 canvas；**无 console error / 未捕获异常**。
协议侧：非 root 访问 7 个统计接口全部 403，无 token 401。

**另发现（未修，非本任务范围）**：`pnpm build`（`run-p type-check build-only`）
在 pnpm 10 下**必然失败** —— `package.json` 的 `config.commitizen` 会被当成 CLI 选项
传给子进程（`ERROR Unknown option: 'anime-chat-client:commitizen_path'`）。
已用 main 的原始 `package.json` 复现，确认**与本次改动无关且长期存在**。
验证过的解法：把该配置挪到 `.czrc`（内容 `{"path":"@commitlint/cz-commitlint"}` → 实测 `pnpm build` EXIT=0）。
项目约定的验收命令是 `pnpm type-check && pnpm build-only`（不走 `pnpm build`），故暂未改动提交工具链。

### 2026-09-21 · 埋点体系：AI 明细表改造成通用事件流

- **背景**：原先 AI 请求明细单独一张 `ai_request_log`，字段是为 AI 定制的。
  要加前端行为埋点时，若再建一套就变成「每类数据一套表 + 一套查询」。
- **改造**：换成通用埋点表 `track_event`（`event` + `props` JSON + `client_ts`），
  前端行为与后端业务事件（`ai.chat`）**共用一条写入路径**（`TrackService`）。
  `ai_request_log` 已删除。配额计数仍留在 `ai_usage`（高频读，需单行原子更新，
  与明细的分析场景目标不同，刻意不合并）。
- **前端**：新增 `v-track` 自定义指令（首次在本仓引入自定义指令）——
  `v-track="'ai.send'"` 点击上报、`.view` 曝光（IntersectionObserver）、`.once` 只报一次；
  非 DOM 事件直接调 `track()`。攒批上报（20 条 / 5s），关闭页面用 `fetch(keepalive)` 补发。
- **取舍**：通用 JSON 表的代价是聚合要 `JSON_EXTRACT`。当前量级够用；
  量级上来后应另建**物化汇总表**（走 `ai_usage` 的思路），而不是给通用表加业务专用列。

### 2026-09-21 · 埋点：v-track 点击事件静默丢失（捕获阶段）

- **现象**：示例问题 chip 上同时有 `@click="onSuggest"` 与 `v-track`，点击后 `ai.send` 上报了，
  但 `ai.suggest.click` **从未出现** —— 埋点静默丢失，没有任何报错。
- **根因**：`v-track` 默认在冒泡阶段注册监听。冒泡时 Vue 的 `@click` 先执行，
  它把 `streaming` 置真触发重渲染；Vue 在**微任务**里刷新，而 DOM 规范允许微任务检查点
  插在「每个监听器调用之间」—— 于是重渲染卸载了元素、`unmounted` 摘掉了我们的监听，
  浏览器继续派发本次事件时列表里已经没有它。
- **修复**：改用**捕获阶段** `addEventListener(..., { capture: true })`。
  捕获在目标处理器之前执行，天然免疫；语义上也更对（先记「用户点了」再谈业务反应）。
- **教训**：这类「元素可能在本次事件派发中途被卸载」的问题，只有真实浏览器点得出来 ——
  单元测试与类型检查都不可能发现。

### 2026-09-21 · 埋点：统计接口 403 与 500

- **403**：`/api/track/stats/*` 忘了挂 `AuthGuard('jwt')`。没有守卫时 `req.user` 恒为 `undefined`，
  连管理员都会被 `assertRoot` 判成 403 —— 加守卫才修好。
- **500**：`SUM(props->>'$.promptTokens' + props->>'$.completionTokens')`。
  `props->>` 取出来是**字符串**，`+` 做的是字符串拼接，`SUM` 直接报错。
  两侧各自 `CAST(... AS UNSIGNED)` 才对。
- **另一个反直觉点**：为了「返回值是数字」在 SQL 外层再包 `CAST(... AS SIGNED)` 是**无效**的 ——
  TypeORM 的 mysql 驱动开了 `bigNumberStrings`，COUNT/SUM 回来仍是字符串。
  最终用 `core/utils/sql.ts` 的 `toNumbers()` 在应用层收敛。
  日期同理：`DATE()` 会以 Date 对象返回并被 JSON 化成 UTC 时间戳（`2026-09-21` 变成
  `2026-09-20T16:00:00Z`，看板上日期整体差一天），要用 `DATE_FORMAT`。


### 2026-09-21 · AI 助手：记忆窗口槽位不足导致工具调用后丢失用户问题

- **现象**：用户问「推荐几部高分科幻番」，模型先正常起手（「我来帮你从高分榜里挑科幻题材的」），
  调用 `browse_anime` 拿到 20 条结果后，**回答变成重新打招呼**（「你好呀！我是番剧助手…想从哪儿开始？」）。
- **根因**：`anime-ai` 给每次请求临时构造 `MessageWindowChatMemory`，窗口大小写成了
  `history.size() + 2`。而**一次工具往返要占 3 个槽**（`user`、`ai(toolCall)`、`toolResult`）：
  单轮请求时窗口只有 2，toolResult 一进来就把 `user` 挤出去，模型第二次被调用时
  上下文里只剩「工具调用 + 结果」，于是答非所问。
- **修复**：窗口按 `history.size() + 1 + 2 * MAX_TOOL_ROUNDS` 预留，并加
  `maxToolCallingRoundTrips(MAX_TOOL_ROUNDS)` 兜住失控循环（两者是一对）。
- **为什么之前没发现**：M1 验收时只有占位 key，模型只返回 `error` 事件、根本走不到工具往返；
  换成真实 key 跑完整链路才暴露。**假 key 只能验链路，验不了行为。**
- **验证**：真 key 下模型正确按标签从总榜筛出 6 部科幻（攻壳 S.A.C./2nd GIG、星际牛仔、
  命运石之门、银河英雄传说、EVA），并指出 2nd GIG 是 S.A.C. 的续篇。

### 2026-09-21 · AI 助手：网关改写了 SSE 线格式

- **现象**：直连 `anime-ai` 出 `event:text-delta`（无空格），经 NestJS 网关却变成
  `event: text-delta`（多一个空格）—— 同一份协议出现两种线格式。
- **根因**：网关转发时把事件块**重新拼装**成 `event: ${name}\ndata:${data}`。
- **修复**：改为**原样透传**上游事件块（仅统一换行后再按 `\n\n` 分块）。
  两种写法其实都是合法 SSE、前端也能兼容，但排查时要分别对照，属于无谓的偏差。

### 2026-09-21 · 前端：工具卡片铺满视口挤掉文字回答

- **现象**：模型一次请求 20 条候选（它需要足够候选才能按标签筛），前端把 20 张卡片全部铺开，
  变成一堵卡片墙，**文字回答被挤出视口**，用户只看到卡片。
- **修复**：默认只展示 6 张 + 「还有 N 部，展开看看」；**不改工具返回条数** ——
  砍候选会削弱模型按标签筛选的能力，问题在展示不在数据。

### 2026-09-21 · 待处理：删用户不清理关联表

- **现象**：清测试数据时发现 13 条孤立 `ai_usage` 记录（对应用户已删）。
- **根因**：`UserService.delete(id)` 只执行 `userRepository.delete(id)`，
  不清理 `user_anime` / `refresh_token` / `ai_conversation` / `ai_message` / `ai_usage` / `group_user_map`。
- **状态**：**未修**。属既存问题（非本次引入），涉及多个模块，建议单独一次改动统一处理。

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

## 5. Git Ship 流程（本项目规范）

参考 git-ship / PR checklist / 分支模型并结合项目现状定稿。**完整校验命令、验证约定与提交规范见
[`COGNITION_SYNC.md`](./COGNITION_SYNC.md) §8–§9**，这里只记流程要点：

1. **分支**：修复类小改动可直接在 `main` 提交；新功能/重构从最新 `main` 切 `feat/xxx` 或 `fix/xxx` 分支。
2. **开发**：小步提交，每个 commit 只讲一个故事（可独立 review、可安全 revert）。
3. **校验**：按 `COGNITION_SYNC.md` §8 跑该仓的 type-check / build / lint；UI 与真实接口改动必须实测。
4. **CR**：合入前 review 完整 diff（正确性/安全/边界/命名/死代码），阻断项先修再合。
5. **提交信息**：emoji Angular 风格中文；subject 不能以大写词开头（commitlint 强制）；husky 自动跑 lint-staged。
6. **合入**：`git merge --no-ff` 回 `main` → `git push origin main` → 删除已合并分支。
7. **约定**：`.env*` 一律不提交；`client/`、`server/`、`docs/` 同仓提交；`pnpm-lock.yaml` 由 pnpm 维护。
8. **文档**：代码/接口/实体有变动时按 `COGNITION_SYNC.md` §7 联动清单同步，并更新 §3 看板与 §4 修复记录。

---

## 6. 备注

- **文档随代码同仓**：2026-10 起 `client/` + `server/` + `docs/` 在同一个 `anime-chat` 仓库，
  不再有独立文档仓（旧的独立 `docs/` 与 `anime-chat-server/` 目录已并入后归档/删除）。
  文档漂移的根因是「文档不在代码仓里」，这条不要再回退。
- **AI 能力已端到端上线**：`anime-ai`（独立仓，8013）+ server 的 `AiModule` 网关（SSE 转发 +
  配额 + 会话落库）。架构、工具、RAG 与决策见 [`AI.md`](./AI.md)。
- ⚠️ **一条被实测推翻的早期假设**：曾认为「Bangumi 的结构化过滤足以覆盖找番需求，故 MVP 不需向量库」。
  M1 实测确认 `POST /v0/search/subjects` 的 `keyword` 是**标题字面匹配**，`tag`/`meta_tags`
  只能收窄、无法用于发现，「按题材找番」在该接口上走不通 —— 这也正是上向量检索的理由。
  更正见 [`AI.md`](./AI.md) §2.3。
- 旧规格文档（superpowers 时代）已删除；`api-auth-collection.md` 已重写为 `api-contract.md`。
  设计决策以上文 §2 与 `COGNITION_SYNC.md` 为准。
- 单仓两端都**没有可运行的测试**（server 的 jest 已配置但 0 个 spec），验收全靠手动；见 `COGNITION_SYNC.md` §8。
