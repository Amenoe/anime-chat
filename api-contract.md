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

> **本模块全部接口需要登录**（`@Controller('ai')` 上挂了 `@UseGuards(AuthGuard('jwt'))`）。
> 前端 `/ai` 页面**未登录时只显示登录引导、不渲染对话区、也不发任何 `/api/ai/*` 请求** ——
> 对话历史属于隐私，且白挨 401 会把界面刷成错误态（同 `User.vue` 的做法）。

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
| `ai.*` | 前端行为 | `ai.send.click` / `ai.done` / `ai.card.click` / `ai.welcome.view` |
| `search.*` | 前端行为（搜索页） | `search.submit` / `search.result.click` |
| `admin.*` | 前端行为（看板自身） | `admin.range.change` / `admin.refresh` |
| `ai.chat` | **后端**业务事件 | 见下 |

`ai.chat` 由网关在流结束后上报，`props` 含 `model / promptTokens / completionTokens /
toolCalls / toolNames / latencyMs / firstTokenMs / status / finishReason / candidateCount`。

`finishReason` 除上游给的 `STOP` 等值外，还有 `SCOPE_REJECTED` ——
anime-ai 的**话题范围守卫**拦下非动漫提问时给出。这种轮次是**正常业务结果**：
HTTP 200、不发 `error` 事件、`status=ok`、`model=null`、token 全为 0。
所以看板的错误率**不会**被拒答污染（见 §4 与 `ai-chat-tech-stack.md` §4.5）。

> 前端 `ai.send.click`/`ai.done` 与后端 `ai.chat` 是**两个视角**，不是重复：
> 后端知道 token、模型、上游耗时；前端知道用户等了多久、看到几张卡片、是否中途放弃。

**前端事件的中文名映射在 `anime-chat` 的 `src/constants/track-events.ts`** ——
看板不直接摆 `page.view` 这种内部代号。表里没有的事件名**原样显示**（不显示「未知」），
这样新加埋点时会一眼看出「这里少了一条映射」。

### 统计接口（**仅 root**）

| 接口 | 说明 |
| --- | --- |
| `GET /api/track/stats/overview?days=` | 事件总量、独立用户、事件类型数、今日量 |
| `GET /api/track/stats/top-events?days=&limit=` | 事件量排行，**按 (event, page) 分组**，故多一个 `page` 字段 |
| `GET /api/track/stats/daily?days=` | 按天趋势（含匿名数） |
| `GET /api/ai/stats/overview` | AI：请求数、成功/错误/中途放弃、token、平均延迟与首字延迟（**全时段**，不吃 `days`） |
| `GET /api/ai/stats/engagement?days=` | **看板主指标**：访问量 / 消耗 / 使用率（含 AI vs 手动搜索对比），口径见下 |
| `GET /api/ai/stats/daily?days=` | AI：按天趋势 |
| `GET /api/ai/stats/tools?days=` | 工具使用分布（按调用组合分组）。**看板已不展示**，接口保留备用 |
| `GET /api/ai/stats/top-users?days=&limit=` | 用量最高的用户，含 `username`/`nickname` |

### 管理端 P1：审阅与埋点明细

以下接口均要求 `AuthGuard('jwt') + RootGuard`。AI 会话列表不返回 `title`，避免把用户首轮提问批量暴露；查看单会话消息会单独写入 `admin_audit_log` 的 `ai.read`。

| 接口 | 说明 |
| --- | --- |
| `GET /api/admin/ai/conversations?userId=&from=&to=&cursor=&size=` | 按创建时间倒序，游标分页，不返回标题原文 |
| `GET /api/admin/ai/conversations/:id/messages` | 一次只返回一个会话的消息，读取动作审计 |
| `GET /api/admin/track/events?event=&userId=&from=&to=&cursor=&size=` | 游标分页，默认不返回 `props`，不返回 total |
| `GET /api/admin/track/events/export?...&includeProps=1` | UTF-8 BOM CSV，最多 50000 行、时间跨度最多 31 天；导出前写 `track.export` 审计，字段做 CSV 公式注入防护 |

埋点链路保持统一：前端通过 `/api/track` 批量写入，后端业务通过 `TrackService.trackOne()` 写入同一张 `track_event`。两者使用相同的 `event/page/target/props/client_ts` 字段；登录事件以 JWT 用户归属，匿名事件以 `anonymousId` 串联。后端业务事件应避免写入消息正文、密码、令牌或其他不必要的个人数据，AI 请求只记录模型、耗时、token、工具名和终态。

非 `role = 'root'` 一律 403。`days` 收敛到 1–90，`limit` 上限 100。
前端页面对应 `/admin`（侧边栏入口只对 root 展示）。

#### `engagement` 的口径（**改之前先看这里**）

这些是**跨功能**的业务定义，只在后端定义一处（`AiService.statsEngagement`），前端不拼装：

| 字段 | 口径 |
| --- | --- |
| `page_views` / `page_users` | `event='page.view' AND page='Ai'` 的次数 / 去重用户 |
| `chat_requests` / `chat_users` | `ai.chat` 的次数 / 去重用户（**发起即计**，不看成功与否） |
| `total_tokens` / `tokens_per_request` | 输入+输出 token 之和 ÷ `chat_requests` |
| `card_click_rate` | `ai.card.click` ÷ `chat_requests`。一轮可返回多张卡，**可能 > 100%** —— 它衡量「一次对话平均被点开几个推荐」，不是「多少比例的对话被点开」 |
| `search_count` / `search_users` | `search.submit` 的次数 / 去重用户。**换排序的重发不计**（那会灌水分母） |
| `search_card_click_rate` | `search.result.click` ÷ `search_count`，与 AI 侧对称可比 |
| `ai_rate` | `chat_requests` ÷ (`chat_requests` + `search_count`)。回答「找番时更倾向 AI 还是搜索」。**不含首页/详情页浏览** —— 那是「逛」不是「找」 |

⚠️ **`ai_rate` 依赖四个前端埋点事件名**（`page.view` / `ai.card.click` / `search.submit` /
`search.result.click`），常量集中在 `AiService` 顶部，改名要两端一起改。
**查不到事件名不会报错，只会静默算成 0**，看板上表现为「AI 使用率 100%」这种假象 ——
本开发过程中就因为一处埋点没上报踩过（见 `PROJECT_MEMORY.md` 修复记录）。

⚠️ 看板「使用率」四张卡都把**算式**写进 hint（分子分母都给出）：只看百分比无法复核口径。

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
`RootGuard`，直接敲 `/admin` 会被 403。

## 6. 建表策略

- 开发：TypeORM `synchronize: true` 自动同步
- 生产：`synchronize` 需关掉，用 `docs/schema.sql` 手工建表或迁移
- **改实体后必须同步更新 `schema.sql`**（生产建库依赖它）

## 7. 管理端（2026-09-22 新增）

`src/admin/` 模块。**每个接口都挂 `@UseGuards(AuthGuard('jwt'), RootGuard)`，两个都挂、顺序不能换** ——
没有 JWT 守卫时 `req.user` 恒为 `undefined`，连管理员都会被 `RootGuard` 判成 403
（本项目真实踩过两次，所以现在抽成一个守卫：挂错一次就立刻暴露，而不是各 controller 各写一份 `assertRoot` 各漏各的）。

### 7.1 用户管理

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/admin/users` | `keyword?` `role?` `disabled?` `page?` `size?` | `{ items, total, page, size }` |
| GET | `/api/admin/users/audit` | `limit?` | 审计记录数组（倒序，上限 200） |
| GET | `/api/admin/users/:id` | — | `{ user, stats: { conversations, messages, events, animes } }` |
| PATCH | `/api/admin/users/:id/ban` | `{ banned: boolean, reason?: string }` | 同详情 |
| PATCH | `/api/admin/users/:id/role` | `{ role: 'root' \| 'user' }` | 同详情 |
| POST | `/api/admin/users/:id/password` | `{ newPassword: string }` | `{ reset: true }` |
| DELETE | `/api/admin/users/:id` | — | `{ deleted: true, counts }` |

⚠️ **路由顺序**：`audit` 必须在 `:id` **之前**声明，否则 `/admin/users/audit` 会被 `:id` 吃掉
（然后报「用户不存在」）。

用户对象字段是**显式白名单**，**不含 `password`**：`password` 目前靠实体上的 `@Exclude()` +
`ClassSerializerInterceptor` 保护，而那个拦截器只挂在 `UserController` 上 ——
新 controller 忘了挂就漏密码，所以这里显式 `select`，比「记得挂拦截器」可靠。

`keyword` 同时匹配 `username`/`nickname`，**LIKE 的 `%` 与 `_` 已转义**（转义符用 `!`，
因为反斜杠在 JS 和 SQL 里要各转一层、极易写错）；不转义的话输入一个 `%` 就等于拉全表。

### 7.2 封禁（新列 + 即时失效）

`user` 表新增两列：`disabled_at datetime NULL`（**NULL 即正常**，非空既判真假又记录时间）、
`disabled_reason varchar(255)`。

**刻意不复用 `status`**：那是**在线状态**（登录置 1、`User.vue` 离开置 0）。
复用会让「用户关掉页面」显示成「已封禁」。

**即时失效靠三个拦截点，缺一不可**：
① `JwtStrategy.validate` 查到 user 后判 `disabled_at`（该方法**本就每请求查库**，
所以是免费的）；② `AuthService.login` 在**签发 token 之前**拒绝（否则能登录成功但每请求 401，
用户无从理解）；③ `AuthService.refresh` 校验后先 `revokeAllForUser` 再抛。
判定集中在 `AuthService.assertNotDisabled()` 一处，避免两处漂移。

**不需要 accessToken 黑名单**，也不要为「可吊销」把 accessToken 落库。

**有意保留的缺口**：被封用户揣着未过期 accessToken 打 `POST /api/track`，会因 `OptionalJwtGuard`
丢弃 err 而被记成**匿名**。不改的理由：埋点必须对「token 过期的访客」也保持匿名可用
（见 §5），改 401 会误伤正常访客。业务接口全走必需的 `AuthGuard('jwt')`，已被拦。

**防自锁**：禁止封自己；禁止封禁/降级**最后一个未封禁的 root**。
后者只在**真的会减少**可用 root 时才生效（目标本来就已封禁时跳过），
否则「封一个已封的 root」会被误判成「最后一个」而拒绝。

### 7.3 删号级联

`AccountCleanupService.purge(userId)` 是**唯一实现**，「用户自删」（`DELETE /api/user/:id`）与
「管理员删号」（`DELETE /api/admin/users/:id`）共用它 —— 原先只有 `UserService.delete` 删
`user` 一行，留下 8 张表孤儿；根因不是「忘了写 DELETE」，而是同一个语义有两份实现。
现在 `UserService.delete` 已**删除**，不存在「有人调了那个裸删方法」的可能。

事务内按「叶子 → 主体」硬删：
`ai_message → ai_conversation → ai_usage → user_anime → media_source → refresh_token
→ group_user_map → playback_session → user`

三个**明确保留**（不是遗漏）：`group`/`group_message`（房间是多人共享上下文；但用户正主持的
房间会先走 `RoomService.destroyRoom` 销毁，否则房主指向不存在的用户）、`track_event`
（埋点不属于个人数据，已删用户的行会退化成 LEFT JOIN 能识别的「已注销」）、
MinIO 头像（best-effort，失败只记日志不阻断 —— 账号都删了，为一张图回滚没意义）。

### 7.4 提权红线

- **绝不把 `role` 加进 `UpdateUserDto`。** `PATCH /api/user/:id` 的判定是「本人**或** root」，
  一旦 `role` 可写，**任何登录用户都能把自己提成 root**。
  已加**编译期断言**：该 DTO 上一旦出现 `role`/`username` 就编译失败。
  运行时也有兜底：全局 `ValidationPipe` 开了 `forbidNonWhitelisted`，多传 `role` 直接 400。
- 改角色只走 `/api/admin/users/:id/role`。
- **禁止修改自己的角色**（含自我降级，会立刻失去管理能力）。
- 重置密码：显式 `bcrypt.hashSync`（`@BeforeInsert` 只在插入时生效，直接 update 明文会存进去）、
  重置后 `revokeAllForUser` 强制全设备重登、**响应与审计都不回显密码**。

### 7.5 审计

写操作一律写 `admin_audit_log`，**且审计失败会让操作一起失败**（与埋点相反，见 `schema.sql` 注释）。
`action` 取值：`user.ban` / `user.role` / `user.password` / `user.delete`
（后续还有 `ai.read` / `track.export` / `config.update`）。
`detail` 记「改了什么、从什么变成什么」，**绝不写密码或令牌明文**。
