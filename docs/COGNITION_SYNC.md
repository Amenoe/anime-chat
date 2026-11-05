# 前后端认知同步

> 单仓两端（`client/` 前端 / `server/` 后端）**必须共同遵守**的约定。
> 两端各自的 AI 助手工作规则与代码导览见 `../client/AGENTS.md` 与 `../server/AGENTS.md`；AI 服务见独立仓库 `../../anime-ai/AGENTS.md`。
> 本文只写「跨端」的部分——凡是两端要对齐的东西都在这里。
>
> 改任何一端前，先确认本文对应小节是否要一起改。

---

## 1. 拓扑

| | 目录 | 技术栈 | 地址 |
| --- | --- | --- | --- |
| 前端 | `client/` | Vue 3.5 + Vite 5.4 + Pinia + Element Plus + Artplayer/hls.js + socket.io-client | `localhost:8012` |
| 后端 | `server/` | NestJS 9 + TypeORM 0.2 + Socket.IO + MySQL + MinIO + qBittorrent | `localhost:3000` |

- 前端 dev 把 `/api` 代理到后端（`VITE_BASE_API=/api`），生产由网关转发
- 后端全局前缀 `api`，静态资源（头像）也挂在 `/api`
- 前端与后端在**同一个仓库**（`client/` + `server/`），`docs/` 也在同一仓库根目录；AI 服务 `anime-ai` 是独立仓库
- 验证环境的真实端口：**前端 8012、后端 3000**（文档/脚本里出现 5173、8080 一律是错的）

## 2. 统一响应信封（跨端后果）

字段与状态码的**权威定义**见 [`api-contract.md`](./api-contract.md) §0，这里只记两端必须一起遵守的后果：

- **错误同时带真实 HTTP 状态码**（不是 HTTP 200 + body.code）—— 前端的 401 静默刷新依赖它，**别改**。
- 前端响应拦截器成功时已解包成 `data` 本身，业务代码不要再 `.data`。
- `ValidationPipe` 开了 `whitelist + forbidNonWhitelisted`：**前端多传一个未声明字段就是 400**。
  新增可选参数时后端 DTO 必须同步声明。

## 3. 鉴权：双 token（跨仓契约）

### 3.1 职责划分

字段名、时效、落库与轮换规则的**权威定义**见 [`api-contract.md`](./api-contract.md) §1。两端只记职责：

- 后端签发/校验/轮换/吊销；refreshToken 只存 sha256。
- 前端：accessToken 随 `Authorization` 下发；refreshToken **只**发给 `/auth/refresh` 与 `/auth/logout`。
- 流接口例外：`?token=<accessToken>`（`video`/`hls` 无法带 Header）。

### 3.2 前端刷新时序

```
业务请求 → 401
   └─ 拦截器：renewAccessToken()
        ├─ 已有 refreshPromise？→ 复用（并发 401 合并为一次）
        └─ login store.refreshAction() → POST /auth/refresh
             ├─ 成功：setTokens() 同时更新 store ref + localStorage
             │        → 原请求带新 accessToken 重放一次（_authRetried 防死循环）
             └─ 失败：handleUnauthorized() 清态 + 提示重新登录（并发只提示一次）
```

- 刷新请求自身带 `skipAuthRefresh`，**不会**递归刷新
- 刷新失败后原请求的 `.catch` 也会调一次 `handleUnauthorized()`（幂等，提示有节流）

### 3.3 吊销责任在后端

各事件的吊销行为见 [`api-contract.md`](./api-contract.md) §1「吊销时机」。跨端唯一需要额外记住的配套：

> ⚠️ 改密会连本机一起吊销（有意踢掉其他设备），前端必须**用新密码静默重登**；
> 少任何一半都会造成「改完密码过一会儿莫名其妙被登出」。

### 3.4 泄露检测（有意为之的严格策略）

已作废的 refreshToken 被再次使用 → 判定为泄露，吊销该用户**全部**会话。

- 代价：客户端若对 `/auth/refresh` 做网络层重试，可能触发整户吊销
- 缓解：前端用 `refreshPromise` 合并并发、`_authRetried` 限制单次重试，正常路径不会重放旧 token
- 改动此策略需两端一起评估，不要只动后端

## 4. 跨仓字段命名（踩过的坑）

**同一个概念，两端字段名必须逐字一致。** 已经踩过一次：

- `joinRoom` 回包后端曾返回 `playback_episode_sort`，而 `playback:state` 广播与前端
  `PlaybackState` 用的是 `episode_sort` → 前端读不到集数，`currentEpisodeSort` 恒为 `null`，
  导致「第几话建房不自动播第几话」。后端已改为对齐（`episode_id` / `episode_sort` / `session_id`）。

规则：

- Socket 回包与广播**必须用同一套字段名**（`toPlaybackState` 是唯一来源）
- 改接口响应字段 = 前端 `src/api/types.ts` 一起改，且 `docs/api-contract.md` 同步
- 不要发明 `playback_` 前缀的平行命名

## 5. 关键领域概念

| 概念 | 含义 | 易混点 |
| --- | --- | --- |
| `season_id` | 放映室**房间业务 key**，随机 16 位 hex，全局 UNIQUE | **不是** `session_id`，也**不是**番剧分季 |
| `session_id` | 一次播放会话（`playback_session.id`） | 切集/换源会变，房间 key 永不变 |
| `group` | 旧聊天室 + 放映室**共用表** | 放映室不是独立表 |
| `anime_id` / `episode_id` / `episode_sort` | 房间的内容绑定 | 切集只改 `playback_episode_*`，**永不改 `season_id`** |
| `bangumi_id` | Bangumi subject id（前端番剧数据源） | 与本地 `anime` 表基本无关（已迁移） |

- 同一 `anime_id` 可以有**多间房**（不同 `season_id`）
- 进度同步是**强同步**：房主控制，观众强制跟随；心跳 8s，广播节流 1s，写库节流 2s

### 5.1 放映室 vs 点播室（别把两者混在一起）

| | 放映室 `/room/:seasonId` | 点播室 `/vod/:seasonId` |
| --- | --- | --- |
| 房间 | 绑定番剧，公开可列（按 `anime_id` 查），空房销毁 | 私人房间（`anime_id = 0`，不列），凭邀请链接进，空房销毁 |
| 播放 | 房主选源，`playback:state` 强同步给观众 | **相同**（房主选源、成员只读跟随） |
| 弹幕 | 按 `anime_id + episode_sort` 拉取，房主/观众都显示 | **不加载弹幕** |
| 聊天 | `ChatGateway.groupMessage` | 复用同一套，房间内的聊天 |
| 房主离开 | 转让给最早加入者 | **解散房间**（广播 `room:destroyed`） |
| 聊天数据 | `group_message` 随房间销毁 | 随房间销毁 |

实现上刻意分成两个 Pinia store（`room` / `vod`）：都是单例，混用会让「放映室的状态」被点播室覆盖。

### 5.2 播放会话字段（前端 `PlaybackSessionView`）

| 字段 | 含义 |
| --- | --- |
| `status` | `fetching`（等 metadata）→ `downloading` → `playable`/`ready`；`failed` 才代表不可恢复 |
| `playUrl` | `failed` 以外都给（下载中也要给，播放器靠重试推进）；前端也可以自己拼 |
| `remuxRequired` | true = mkv/HEVC：**不要用 `stream`**，改用 `GET /api/playback/sessions/:id/hls.m3u8`（静态 VOD playlist，有时长、可 seek） |
| 字幕 | `GET /api/playback/sessions/:id/subtitles` 列**内嵌**字幕轨；`.../subtitle/:track.vtt?token=` 取 WebVTT。外挂字幕文件不下载，PGS 图形字幕不可转 |
| `progress` / `downloadedBytes` / `sizeBytes` | 进度；`downloadedBytes` 才是「真实可读」的上限（qB 预分配） |

⚠️ `status !== 'ready'` 不等于不能播；`playUrl === null` 只在 `failed` 时出现。

## 6. 数据与建表

表结构以 [`schema.sql`](./schema.sql) 为唯一事实来源；dev / 生产的差异见
[`api-contract.md`](./api-contract.md) §6。三条跨端硬约束：

- 改实体后**必须同步 `schema.sql`**，否则生产建库缺表（`refresh_token` 就曾漏过）。
- 生产必须关 `synchronize`。
- `refresh_token` 表必须存在，否则**登录直接失败**。

## 7. 改动联动清单（改一端必须同步另一端/文档）

| 你改了 | 必须同步 |
| --- | --- |
| 任一 TypeORM 实体 | `docs/schema.sql` |
| 接口路径 / 请求响应字段 | 另一端调用处 + `docs/api-contract.md` + 前端 `src/api/types.ts` |
| 鉴权行为（token 时效、吊销时机、字段名） | `docs/api-contract.md` + 前端 `axios-utils.ts` / `login` store |
| 新增环境变量 | 对应 README 的环境变量表 + 本机 `.env.*` |
| Socket 事件 / 回包字段 | `chat.gateway.ts` + 前端 `room`/`vod` store + 本文 §4 |
| 播放会话字段 / 出流参数 | 前端 `api/playback.ts` + `VodPlayer`/`AnimePlayer` + `playback-architecture.md` |
| AI 网关 / SSE / 工具 / 检索 | `docs/AI.md` + `anime-ai` 的 `SseEvent` / `AnimeTools` / `KnowledgeService` |
| 文档拆分或合并 | `docs/README.md` 的文档地图与阅读顺序 |
| 跨仓的概念命名 | 两端一起改，并更新本文 §5 |
| 任务状态 / 踩坑 | `docs/PROJECT_MEMORY.md` 看板与修复记录 |

## 8. 验证约定（无测试框架，靠手动）

两端都没有跑得起来的测试（后端 jest 已配置但 `src/` 下 0 个 spec）。因此：

**单仓两端与 `anime-ai` 改动后至少：**

```bash
# 前端
pnpm type-check && pnpm build-only && pnpm lint
# 后端
pnpm exec tsc --noEmit -p tsconfig.build.json && pnpm run build && pnpm run lint
```

**后端还要真实启动**（tsc 查不出 DI 错误和路由缺失）：

```bash
NODE_ENV=development node dist/main.js   # 看到 "Nest application successfully started" + 路由映射
```

**鉴权类改动**必须打真实接口跑一遍全链路（注册 → 登录 → 业务接口 → 刷新 → 复用检测 →
登出 → 改密 → 删号清理）。脚本已入库，改完直接跑：

```bash
cd server && node scripts/auth-e2e.mjs    # 24 项断言，测试账号自动清理
```

（本次双 token 落地即按此验收 24/24。此前这类脚本放在 `/tmp` 会随重启丢失，故入库。）

**UI 类改动**需 headless Chrome 打真实页面（见 `PROJECT_MEMORY.md` 修复记录里的做法），
不能只凭类型检查就认为功能可用。

**注意**：验证服务别占用 3000/8012 上正在跑的开发进程；用独立端口或先确认端口空闲。

## 9. 提交约定（单仓）

> `anime-chat` 单仓一次提交（`client/` + `server/` + `docs/` 可一起）；独立仓 `anime-ai` 单独提交。

- emoji 前缀 Angular 风格，中文 subject：`🌟feat` `🐛fix` `📝docs` `💎style` `🌠refactor`
  `🚀perf` `🚨test` `📦build` `👷ci` `🔂revert`
- 流程：CR → lint/prettier → type-check → build → 小步 commit → `merge --no-ff` 回 `main`
  → `push origin main` → 删分支
- **`.env*` 一律不提交**
- 禁止提交 Claude 元数据 trailer
