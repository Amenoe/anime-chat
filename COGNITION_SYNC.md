# 前后端认知同步

> 双仓库（`anime-chat` 前端 / `anime-chat-server` 后端）**必须共同遵守**的约定。
> 两端各自的代码导览见 `anime-chat/CLAUDE.md` 与 `anime-chat-server/CLAUDE.md`；
> 本文只写「跨仓」的部分——凡是两端要对齐的东西都在这里。
>
> 改任何一端前，先确认本文对应小节是否要一起改。

---

## 1. 拓扑

| | 仓库 | 技术栈 | 地址 |
| --- | --- | --- | --- |
| 前端 | `anime-chat` | Vue 3.5 + Vite 5.4 + Pinia + Element Plus + Artplayer/hls.js + socket.io-client | `localhost:8012` |
| 后端 | `anime-chat-server` | NestJS 9 + TypeORM 0.2 + Socket.IO + MySQL + MinIO + qBittorrent | `localhost:3000` |

- 前端 dev 把 `/api` 代理到后端（`VITE_BASE_API=/api`），生产由网关转发
- 后端全局前缀 `api`，静态资源（头像）也挂在 `/api`
- 两个仓库**各自独立 git**，分开提交/推送；`docs/` 是第三个独立仓库（共享文档）
- 验证环境的真实端口：**前端 8012、后端 3000**（文档/脚本里出现 5173、8080 一律是错的）

## 2. 统一响应信封

```json
// 成功
{ "code": 200, "message": "请求成功", "data": { } }
// 失败
{ "code": 401, "message": "登录已过期，请重新登录", "data": {} }
```

- **错误同时带真实 HTTP 状态码**（`HttpExceptionFilter` 里 `response.status(status)`）。
  前端据此在 axios 错误分支按 `status === 401` 触发静默刷新。
  如果哪天改成「HTTP 200 + body.code=401」，前端的自动刷新会静默失效——**别改**。
- 前端 `request` 响应拦截器成功时直接解包成 `response.data.data`，所以业务代码拿到的
  已经是 `data` 本身，不要再 `.data`
- ValidationPipe 开了 `whitelist + forbidNonWhitelisted`：**前端多传一个未声明字段就是 400**。
  新增可选参数时，后端 DTO 必须同步加声明

## 3. 鉴权：双 token（跨仓契约）

### 3.1 职责划分

| | accessToken | refreshToken |
| --- | --- | --- |
| 后端 | 签发、校验、**不落库**、拒绝其访问 refresh 之外的用途 | 签发、**只存 sha256**、轮换、吊销 |
| 前端 | localStorage，`Authorization: Bearer` 随请求下发 | localStorage，**只**发给 `/auth/refresh`、`/auth/logout` |
| 时效 | `JWT_ACCESS_EXPIRES_IN`（默认 2h） | `JWT_REFRESH_EXPIRES_IN`（默认 30d） |

- 两端字段名固定：`accessToken` / `refreshToken` / `tokenType` / `expiresIn` / `refreshExpiresIn`；
  登录响应保留 `token` 作为 `accessToken` 的**兼容别名**（新代码用 `accessToken`）
- 流接口例外：`?token=<accessToken>`（`video`/`hls` 无法带 Header）

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

| 事件 | 后端行为 | 前端行为 |
| --- | --- | --- |
| 主动登出 | `POST /auth/logout` 吊销该条 refreshToken | `logoutAction()`：先调接口再清本地（后端不可用也要清成功） |
| 改密 | 吊销该用户**全部** refreshToken | 改密成功后用新密码**静默重登**，否则 2h 后会被登出 |
| 删号 | 吊销该用户全部 refreshToken | —— |

> ⚠️ 改密会连本机一起吊销。这是有意为之（踢掉其他设备），前端必须配套静默重登，
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

## 6. 数据与建表

- MySQL `anime_chat`；dev 用 TypeORM `synchronize: true` + `autoLoadEntities: true`
- **生产必须关 `synchronize`**，用 `docs/schema.sql` 建表
- 改实体后**必须同步 `docs/schema.sql`**，否则生产建库缺表（`refresh_token` 就曾漏过）
- `refresh_token` 表必须存在，否则**登录直接失败**

## 7. 改动联动清单（改一端必须同步另一端/文档）

| 你改了 | 必须同步 |
| --- | --- |
| 任一 TypeORM 实体 | `docs/schema.sql` |
| 接口路径 / 请求响应字段 | 另一端调用处 + `docs/api-contract.md` + 前端 `src/api/types.ts` |
| 鉴权行为（token 时效、吊销时机、字段名） | `docs/api-contract.md` + 前端 `axios-utils.ts` / `login` store |
| 新增环境变量 | 对应 README 的环境变量表 + 本机 `.env.*` |
| Socket 事件 / 回包字段 | `chat.gateway.ts` + 前端 `room` store + 本文 §4 |
| 跨仓的概念命名 | 两端一起改，并更新本文 §5 |
| 任务状态 / 踩坑 | `docs/PROJECT_MEMORY.md` 看板与修复记录 |

## 8. 验证约定（无测试框架，靠手动）

两端都没有跑得起来的测试（后端 jest 已配置但 `src/` 下 0 个 spec）。因此：

**每个仓库改动后至少：**

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
cd anime-chat-server && node scripts/auth-e2e.mjs    # 24 项断言，测试账号自动清理
```

（本次双 token 落地即按此验收 24/24。此前这类脚本放在 `/tmp` 会随重启丢失，故入库。）

**UI 类改动**需 headless Chrome 打真实页面（见 `PROJECT_MEMORY.md` 修复记录里的做法），
不能只凭类型检查就认为功能可用。

**注意**：验证服务别占用 3000/8012 上正在跑的开发进程；用独立端口或先确认端口空闲。

## 9. 提交约定（两仓一致）

- emoji 前缀 Angular 风格，中文 subject：`🌟feat` `🐛fix` `📝docs` `💎style` `🌠refactor`
  `🚀perf` `🚨test` `📦build` `👷ci` `🔂revert`
- 流程：CR → lint/prettier → type-check → build → 小步 commit → `merge --no-ff` 回 `main`
  → `push origin main` → 删分支
- **`.env*` 一律不提交**；前后端两仓分开提交；`docs/` 独立提交
- 禁止提交 Claude 元数据 trailer
