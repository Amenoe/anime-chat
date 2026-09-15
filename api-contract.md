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

## 4. 建表策略

- 开发：TypeORM `synchronize: true` 自动同步
- 生产：`synchronize` 需关掉，用 `docs/schema.sql` 手工建表或迁移
- **改实体后必须同步更新 `schema.sql`**（生产建库依赖它）
