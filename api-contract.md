# 接口契约（前后端共同遵守）

> 统一响应、鉴权方式、用户/认证/追番接口。
> 放映室与播放接口见 `PROJECT_MEMORY.md` §2 与 `playback-architecture.md`。

## 0. 通用约定

统一响应信封（`TransformInterceptor` + `HttpExceptionFilter`）：

```json
{ "code": 200, "message": "请求成功", "data": {} }
```

- 成功 `code` 恒为 `200`；错误 `code` = HTTP 状态码，`message` 为中文文案，`data` 为 `{}`
- **错误响应同时设置真实 HTTP 状态码**（401 就是 401，不是 200 带 code 401）——
  前端因而可以在 axios 错误分支按 `status === 401` 触发静默刷新
- 全局前缀 `/api`
- 全局 `ValidationPipe`：`whitelist` + `forbidNonWhitelisted` + `transform`
  → **传多余字段直接 400**，前端不要夹带未声明字段

## 1. 鉴权：双 token

| | accessToken | refreshToken |
| --- | --- | --- |
| 有效期 | 默认 `2h`（`JWT_ACCESS_EXPIRES_IN`） | 默认 `30d`（`JWT_REFRESH_EXPIRES_IN`） |
| 存放 | 前端 localStorage，随 `Authorization: Bearer` 下发 | 前端 localStorage，**只**发给 `/auth/refresh` 与 `/auth/logout` |
| 落库 | 否 | 是（`refresh_token` 表，仅存 sha256） |
| 用途 | 访问所有业务接口 | 换新 accessToken |

- accessToken 载荷含 `typ: 'access'` 与 `jti`（对应 refreshToken 记录 id）；
  refreshToken 载荷含 `typ: 'refresh'` 与 `jti`
- `JwtStrategy` **拒绝** `typ === 'refresh'` 的 token 访问业务接口（401）
- 流接口（video/hls 无法带 Header）额外支持 `?token=<accessToken>`

### POST `/api/auth/login`

Body：`{ "username", "password" }`

成功 `data`：

```json
{
  "user_id": "uuid",
  "username": "string",
  "token": "accessToken 的兼容别名",
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "tokenType": "Bearer",
  "expiresIn": 7200,
  "refreshExpiresIn": 2592000,
  "user": { "user_id": "...", "username": "...", "nickname": "...", "avatar": "...", "role": "user", "status": 1, "create_time": "..." }
}
```

> `token` 保留为 accessToken 别名，兼容旧前端逻辑；新代码请用 `accessToken`。

错误：`400` 不存在此用户 / 密码错误。

### POST `/api/auth/refresh`

Body：`{ "refreshToken": "jwt" }`

成功 `data`：同登录（一整套新 token）。**轮换语义**：

- 旧 refreshToken 立即作废，写 `replaced_by` = 新记录 id
- 同一 refreshToken 被**再次使用**（已作废）视为泄露 → 吊销该用户**全部**会话
- 过期记录在下次登录时顺带清理

错误：`401` 登录状态无效/已过期/状态异常；`400` 缺 refreshToken。

### POST `/api/auth/logout`

Body：`{ "refreshToken": "jwt" }`（可选）

成功 `data`：`{ "revoked": true }`；不传 refreshToken 时 `{ "revoked": false }`。
accessToken 不做服务端吊销，自然过期即可（短时效）。

### 吊销时机（后端统一负责）

| 事件 | 行为 |
| --- | --- |
| 主动登出 | 吊销该条 refreshToken |
| 改密（`PATCH /user/:id` 带 `password`） | 吊销该用户**全部** refreshToken |
| 删除账号（`DELETE /user/:id`） | 吊销该用户**全部** refreshToken |

> 改密会连本机一起吊销。前端 `User.vue` 因此在改密成功后用新密码静默重登，
> 避免 accessToken 到期后被登出。

## 2. 用户表 `user`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| user_id | uuid PK | 自动生成 |
| username | varchar unique | 登录名 |
| password | varchar | bcrypt，响应中永不返回 |
| nickname | varchar | 昵称 |
| avatar | varchar | 默认 `/api/images/avatar(1).png` |
| role | enum root/user | 默认 `user`，注册禁止传 root |
| status | tinyint | 0 离线 / 1 在线，默认 0 |
| create_time | datetime | 创建时间 |

### POST `/api/user/register`

Body（仅允许）：`{ "username", "password", "nickname", "avatar?" }`
服务端默认 `role=user`、`status=0`，`avatar` 缺省用默认头像。

### GET `/api/user/:id` — JWT

返回用户公开信息（无 password）。

### PATCH `/api/user/:id` — JWT（**仅本人**，否则 403）

可改：`nickname`、`password`、`avatar`（不可改 `role` / `username`）。
`password` 需 ≥6 位且含字母与数字；仅当 body 含 `password` 时才 hash。

### DELETE `/api/user/:id` — JWT（**仅本人**，否则 403）

删号并作废该用户全部 refreshToken。

### PATCH `/api/user/status/:id` — JWT（**仅本人**）

Body：`{ "status": 0 | 1 }`

### POST `/api/user/avatar` — JWT

`multipart/form-data`，字段名 **`file`**。

| 限制 | 值 |
| --- | --- |
| 类型 | jpg / jpeg / png / gif / webp |
| 大小 | ≤ 2MB |

流程：写入 MinIO Private 桶 → `user.avatar` 存后端代理路径
`/api/images/avatars/...` → 前端经 `resolveAvatarUrl` 访问。

## 3. 追番表 `user_anime`

前端番剧数据走 Bangumi API，**不依赖本地 `anime` 表**。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid | FK → user.user_id |
| bangumi_id | int | Bangumi subject id |
| status | enum | `wish` 想看 / `watching` 在看 / `done` 看完 |
| title / name_cn / cover | varchar nullable | 展示冗余 |
| create_time / update_time | datetime | |

唯一约束：`(user_id, bangumi_id)`

| 接口 | 说明 |
| --- | --- |
| POST `/api/user-anime` — JWT | upsert（新增或覆盖状态） |
| PATCH `/api/user-anime/:bangumiId` — JWT | 改状态，可选同步 title/name_cn/cover |
| DELETE `/api/user-anime/:bangumiId` — JWT | 取消追番 |
| GET `/api/user-anime` — JWT | 查列表，`?status=` 过滤，按 update_time 倒序 |
| GET `/api/user-anime/:bangumiId` — JWT | 查单条，无则 `data: null` |

## 4. AI 助手（2026-09-21 新增）

网关在 `anime-chat-server`，检索与模型编排在独立的 `anime-ai` 服务（Spring Boot，8013）。
**本服务的 MySQL 是会话历史的权威来源**，anime-ai 无状态。

### POST `/api/ai/chat` — JWT（**SSE**）

一轮对话，返回 `text/event-stream`。

请求体（注意全局 `ValidationPipe` 开了 `forbidNonWhitelisted`，**多传字段直接 400**）：

```json
{ "conversationId": "可选，不传则新建", "message": "用户这轮说的话" }
```

响应头：

| 头 | 说明 |
| --- | --- |
| `Content-Type` | `text/event-stream; charset=utf-8` |
| `X-Conversation-Id` | 本轮所属会话 id。**新建会话时前端必须读它**，否则无法续聊 |
| `X-Accel-Buffering` | `no`（避免 nginx 缓冲导致「一次性吐出」而非流式） |

SSE 事件（与 anime-ai 的协议一致，见 `ai-chat-tech-stack.md` §4.5）：

```
event:text-delta    data:{"text":"..."}
event:tool-call     data:{"name":"browse_anime","args":{...}}
event:tool-result   data:{"name":"browse_anime","failed":false,"subjects":[{"id":…,"nameCn":…}]}
event:usage         data:{"promptTokens":…,"completionTokens":…}
event:error         data:{"message":"..."}
event:done          data:{"conversationId":"...","finishReason":"STOP","model":"deepseek-flash"}
```

⚠️ `data:` 后**没有空格**；`data` 恒为单行 JSON。前端解析要兼容 `data:x` 与 `data: x` 两种写法。

### 话题范围守卫（2026-09-22 新增，anime-ai 侧）

anime-ai 在**调用模型之前**判断用户输入是否属于动漫话题，明显越界的直接回绝。
判定规则与设计取舍见 `anime-ai` 的 `TopicScopeGuard`。

**拒答走正常 SSE 流，不是错误**，前端不需要为它写任何新分支：

```
event:text-delta    data:{"text":"我只能聊动漫相关的话题～…"}   ← 单条，完整文案
event:usage         data:{"promptTokens":0,"completionTokens":0,"totalTokens":0}
event:done          data:{"conversationId":"...","finishReason":"SCOPE_REJECTED","model":null}
```

三处要点：

- **HTTP 200 + 不出现 `event:error`**。拒答是正常业务结果，不是故障 ——
  用 4xx 的话前端只有一套「出错了」的展示，网关还会把它记成 `status=error` 的埋点。
- **`finishReason` 是新增取值 `SCOPE_REJECTED`**（原先只有模型给的 `STOP` 等）。
  它让看板能把「被守卫拦下」与「模型正常回答」分开统计，进而评估命中率与误伤率。
  前端忽略未知 finishReason，所以这是向后兼容的。
- **`model` 为 `null`**：这一轮没有调用任何模型。三个 token 字段也都是 0 ——
  这正是前置拦截省下成本的地方。

边界（重要）：守卫是**保守的**（白名单优先 + 黑名单兜底，拒答需要正面证据），
不确定时放行。因此像「翻译一下命运石之门」这类不带任何载体词的动漫相关请求会**放行**，
再由系统提示词那层礼貌拒答 —— 这是**刻意的分层**，不是漏判。

错误（发生在写 SSE 头**之前**，所以是普通 JSON 信封）：

| 状态码 | 场景 |
| --- | --- |
| 401 | 未登录 / token 无效 |
| 429 | 当日配额用尽 → `{ code:429, message:"今日 AI 对话次数已用完（50 次/天），请明天再试" }` |
| 503 | anime-ai 不可达 → `{ code:503, message:"AI 服务暂时不可用：…" }`。**此时不落库，并退回配额** |

### GET `/api/ai/conversations` — JWT

会话列表，按 `update_time` 倒序，最多 50 条。

### GET `/api/ai/conversations/:id/messages` — JWT

某会话的全部消息（按时间正序），含 `tool_results`（番剧卡片数组），用于刷新后恢复界面。
非本人会话返回 **404**（不区分「不存在」与「不属于你」，避免探测他人会话 id）。

### DELETE `/api/ai/conversations/:id` — JWT

删除会话及其消息。同样对非本人会话返回 404。

### 配额与计费

- 按 `(user_id, 本地日期)` 一行计数，落在 `ai_usage` 表
- **请求开始前**就 +1：用户中途断开也照样扣，否则「断开重连」可绕过配额
- 唯一例外：**上游连不上时退回**（用户没拿到任何结果；且用户无法主动制造该情况）
- 并发下可能略超扣（多个请求同时 +1 后都判超限），这是**故意 fail-closed**：宁可少给几次

## 5. 埋点（2026-09-21 新增）

前端行为与后端业务事件都写进**同一张 `track_event` 表**，走 `TrackService` 一条写入路径。
这样管理员看板不必为每类数据各写一套查询。

### POST `/api/track` — **匿名可用**

前端**攒批**上报（攒够 20 条或每 5s 一批；关闭页面用 `fetch(keepalive)` 补发）。

```json
{ "events": [
  { "event": "ai.card.click", "page": "Ai", "target": "card",
    "props": { "id": 10380, "name": "命运石之门" },
    "clientTs": "2026-09-21T08:00:00.000Z",
    "anonymousId": "3f2a…" } ] }
```

- 单次最多 50 条（`ArrayMaxSize`）
- 登录时按 `req.user` 归属；未登录时用 `anonymousId` 串联 —— 所以这个接口**不能**挂必需的 JWT 守卫
- `props` 是自由 JSON；但 DTO 本身开了 `forbidNonWhitelisted`，**新增顶层字段要同步改 DTO**
- 上报接口**不返回写入结果**，前端也不解析响应（埋点不该阻塞用户操作）

### 事件命名约定

点号分命名空间，便于按前缀聚合：

| 前缀 | 来源 | 示例 |
| --- | --- | --- |
| `page.view` | 前端路由（`router.afterEach`） | `page.view { page: 'Ai' }` |
| `ai.*` | 前端行为 | `ai.send` / `ai.done` / `ai.card.click` / `ai.welcome.view` |
| `ai.chat` | **后端**业务事件 | 见下 |

`ai.chat` 由网关在流结束后上报，`props` 含 `model / promptTokens / completionTokens /
toolCalls / toolNames / latencyMs / firstTokenMs / status / finishReason / candidateCount`。

> 前端 `ai.send`/`ai.done` 与后端 `ai.chat` 是**两个视角**，不是重复：
> 后端知道 token、模型、上游耗时；前端知道用户等了多久、看到几张卡片、是否中途放弃。

### 统计接口（**仅 root**）

| 接口 | 说明 |
| --- | --- |
| `GET /api/track/stats/overview?days=` | 事件总量、独立用户、事件类型数、今日量 |
| `GET /api/track/stats/top-events?days=&limit=` | 事件量排行 |
| `GET /api/track/stats/daily?days=` | 按天趋势（含匿名数） |
| `GET /api/ai/stats/overview` | AI：请求数、成功/错误/中途放弃、token、平均延迟与首字延迟（**全时段**，不吃 `days`） |
| `GET /api/ai/stats/daily?days=` | AI：按天趋势 |
| `GET /api/ai/stats/tools?days=` | 工具使用分布（按调用组合分组） |
| `GET /api/ai/stats/top-users?days=&limit=` | 用量最高的用户，含 `username`/`nickname` |

非 `role = 'root'` 一律 403。`days` 收敛到 1–90，`limit` 上限 100。
前端页面对应 `/admin`（侧边栏入口只对 root 展示）。

**响应字段一律是数字，不会出现 `null`。** 零行时 `COUNT` 天然返回 0，但
`SUM(...)` 返回 **NULL** —— 所以每个 `SUM` 都包了 `COALESCE(...,0)`
（漏包过，看板拿到一串 null）。而 `toNumbers()` 是**故意跳过 null** 的：
它只负责「字符串→数字」，不负责补默认值。

**`top-users` 的 `username`/`nickname` 来自 `LEFT JOIN user`**，用 LEFT 而非 INNER：
`user_id` 可为空（匿名埋点），INNER 会把这些行吞掉导致排行总数对不上。
两种情况会返回 `null`，前端退化成短 id 展示：匿名埋点、用户已注销。

⚠️ 数值列在应用层用 `core/utils/sql.ts` 的 `toNumbers()` 收敛 ——
TypeORM 的 mysql 驱动开了 `bigNumberStrings`，COUNT/SUM 回来是字符串，
在 SQL 里包 `CAST(... AS SIGNED)` **无效**（实测）。

⚠️ `ai.chat` 的 `props.toolNames` 落库是 **JSON 数组**（如 `["browse_anime"]`），
`props->>'$.toolNames'` 取出来**带方括号和引号**，不是逗号分隔的裸名字。
`statsTools` 用多层 `REPLACE` 剥掉 JSON 语法后再分组。
保留数组写法是故意的（将来可用 `JSON_CONTAINS` 查「谁调用过某工具」），
所以修的是读侧不是写侧。

### 授予管理员

`user.role` 默认 `'user'`，**没有任何接口能改它**（避免提权面），只能改库：

```sql
UPDATE `user` SET role = 'root' WHERE username = '你的用户名';
```

改完需**重新登录**：`userInfo`（含 role）缓存在 localStorage，不重登看不到
侧边栏的「管理看板」入口。前端隐藏入口**不是安全边界**，真正的判定在后端
`assertRoot`，直接敲 `/admin` 会被 403。

## 6. 建表策略

- 开发：TypeORM `synchronize: true` 自动同步
- 生产：`synchronize` 需关掉，用 `docs/schema.sql` 手工建表或迁移
- **改实体后必须同步更新 `schema.sql`**（生产建库依赖它）
