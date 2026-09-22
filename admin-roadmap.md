# 管理员功能路线（Admin Roadmap）

> 状态：**P0/P1 部分已实施**（2026-09-22）｜前置：只读看板 `/admin` 已上线（`PROJECT_MEMORY.md` #17）
> 契约照 `api-contract.md`：前缀 `api`、成功走 `TransformInterceptor` 信封、错误走 `HttpExceptionFilter`
> 且带真实状态码、DTO 必须显式声明每个可收字段（`forbidNonWhitelisted` 传未声明字段直接 400）
> 本文只写**管理员增量**，不改用户侧已有契约。表结构变动最终要同步进 `docs/schema.sql`
>
> **实施进度**（详细验证见 `PROJECT_MEMORY.md` §4 的「管理端落地」条）：
> - ✅ §2.2 审计表 `admin_audit_log`、§3.1 封禁（新列 + 三处即时失效）、
>   §3.2 级联清理（`AccountCleanupService`）、§3.3 越权枚举处置、§4 用户管理
> - ✅ 额外完成：抽公共 `RootGuard` 替换两份 `assertRoot`；删除整个停用的番剧 HTTP 子系统（§8 方案 A）
> - ⬜ §5 AI 会话审阅、§6 埋点明细查询与导出、§7 系统配置
> - ⚠️ **§3.3 的处置方式与原文不同**：原文建议把 `GET /api/user` 收紧为仅 root，
>   实际选择**直接删除** —— 管理端列表已由 `/api/admin/users`（分页 + 关键词 + 字段白名单）承担，
>   保留一个无分页的 root-only 副本只是死代码。
> - ⚠️ **§8 的一处事实修正**：番剧的写操作桩在 `AnimeService` 而非 `AnimeController`
>   （controller 只是转发），照着 controller 找会白费功夫。

## 0. 范围与一条硬约束

规划五项：**用户管理**、**AI 会话审阅**、**埋点明细查询与导出**、**系统配置**、**番剧数据维护**。

硬约束：**权限判定只在后端**。前端隐藏入口是体验不是边界 —— `/admin` 路由刻意无守卫，
普通用户直敲 URL 被 `assertRoot` 挡成 403。这个模式继续沿用。

## 1. 现状体检（已读代码核实，开工前必看）

| # | 事实 | 影响 |
| --- | --- | --- |
| 1 | `user.status` 是**在线状态**：登录置 1（`auth.service.login`），`User.vue` 离开置 0 | **禁用不能复用 `status`**，必须新增列，否则「离线」会变成「被封」 |
| 2 | `JwtStrategy.validate` **每请求都查库** | 封禁可即时生效，**不需要** token 黑名单 |
| 3 | `OptionalJwtGuard.handleRequest` 丢弃 `err`、返回 `user \|\| null` | 被禁用户打 `POST /api/track` 退化成匿名而非 401（有意，见 §3.1） |
| 4 | `assertRoot` 在 `track` / `ai` 两个 controller 各抄一份 | 再加 5 个模块前必须抽公共守卫，否则权限逻辑漂移 |
| 5 | `AnimeController` **零守卫**（`UseGuards` 出现 0 次）；它转发到的 `AnimeService.create/update/remove` 是脚手架桩（`return 'This action adds a new anime'` 等） | 无鉴权的假写接口。⚠️ **桩在 service 层、不在 controller 层**（`anime.service.ts`），controller 只是老实转发 —— 别照着 controller 找。正解是**做减法**，见 §8 |
| 6 | `GET /api/user`（`findAll`）只要登录就返回**全表用户** | 前端全仓无调用（已核实），可安全收紧为仅 root |
| 7 | `UserService.delete` 只删 `user` 行 | 孤儿留在 `user_anime`/`refresh_token`/`ai_conversation`/`ai_message`/`ai_usage`/`group_user_map`/`media_source`/`playback_session` 共 **8 张表** |

`anime` 与 `anime_ep` 当前均为 **0 行**，前端 `src/api/` 无任何 `/anime/` 调用 —— 该子系统实际已停用。

## 2. 公共底座（第 0 步，后续每项都依赖）

**2.1 抽 `RootGuard`**：新增 `src/auth/root.guard.ts`，`canActivate` 判 `req.user?.role !== 'root'` 抛 403，
统一用法 `@UseGuards(AuthGuard('jwt'), RootGuard)`；顺手把现有 7 个统计端点的 `assertRoot(req)` 换成守卫，一处定义。

⚠️ **顺序不能反**：`RootGuard` 依赖 `AuthGuard('jwt')` 填充的 `req.user`。反了则 `req.user` 恒为
`undefined`、连管理员都 403 —— `CLAUDE.md` 已记过一次同类坑，换守卫后**依然存在**，只是从「忘挂守卫」
变成「挂错顺序」。

**2.2 审计表 `admin_audit_log`**（横切，先建）—— 字段：

```
id(bigint PK,自增) actor_user_id(36) actor_username(255,快照:actor 被删后仍可读)
action(64) target_type(32) target_id(64) detail(json,绝不写密码/令牌明文)
ip(64) user_agent(255) create_time(datetime)
索引：(actor_user_id,create_time) (action,create_time) (target_type,target_id)
```

`action` 取值固定为：`user.ban` / `user.role` / `user.password` / `user.delete` /
`ai.read` / `track.export` / `config.update`。

**为什么不复用 `track_event`**（三条都源于既有代码，不是洁癖）：

1. **失败策略相反**。`TrackService.track()` 的设计是**吞掉所有异常**（「埋点写不进去不该让业务请求失败」）；
   审计必须反过来 —— **留不下痕就不许操作成功**。同一个方法不可能同时满足两者。
2. **保留期不同**。埋点是分析数据、量级上来要清理；审计不能随便删。
3. **检索维度与污染**。审计按 `actor`/`target` 查，而 `track_event` 会被前端匿名上报灌入。

`AuditService.record()` 必须与业务改动**在同一事务内**，否则会出现「封禁生效了但没留痕」这种最难查的状态。

## 3. P0：安全与遗留缺陷

排最前，理由：**都是已存在、或被新增能力放大的风险**，且不依赖前端，可独立验收。

### 3.1 封禁 / 启用（新列 + 即时失效）

```sql
ALTER TABLE `user`
  ADD COLUMN `disabled_at` datetime DEFAULT NULL,
  ADD COLUMN `disabled_reason` varchar(255) NOT NULL DEFAULT '';
```

用**时间戳**而非布尔位：`NULL` 即正常，非空既判真假、又回答「什么时候封的」。

**即时失效的三个拦截点，缺一不可**：① `JwtStrategy.validate` 查到 user 后
`if (user.disabled_at) throw new UnauthorizedException('账号已被禁用')`；
② `AuthService.login` 在**签发 token 之前**拒绝（否则能登录成功但每请求 401，用户无从理解）；
③ `AuthService.refresh` 校验后 `revokeAllForUser` 再抛。封禁时同时 `revokeAllForUser(id)` 断掉静默续期。

关键点：**不要**引入 accessToken 黑名单，也不要为「可吊销」把 accessToken 落库。`validate` 本就每请求
查一次库（体检 #2），在那里拦一次主键查询就够了 —— 这是该需求能低成本成立的原因。

**有意保留的缺口**：被封用户揣着未过期 accessToken 打 `POST /api/track`，会因 `OptionalJwtGuard`
丢弃 err 而被记成匿名。不改的理由：埋点必须对「token 过期的访客」也保持匿名可用（`CLAUDE.md`
明确两者冲突时选埋点可用性），改成 401 会误伤正常访客。业务接口全走必需的 `AuthGuard('jwt')`，已被 401 拦住。

**防自锁**：禁止封禁自己；禁止封禁**最后一个未封禁的 root**
（`SELECT COUNT(*) FROM user WHERE role='root' AND disabled_at IS NULL` ≤ 1 → 400）。

### 3.2 删号级联清理（收尾已知缺陷）

抽 `AccountCleanupService.purge(userId, tx)`，让「用户自删」与「管理员删号」**共用一条路径** ——
两条路一定会漂移，这正是当初留下孤儿的原因。事务内从叶子到主体：

```
ai_message → ai_conversation → ai_usage → user_anime → media_source
→ refresh_token（硬删，不只置 revoked=1）→ group_user_map → playback_session → user
```

三处需要**明确决策**而非顺手删：① **`group`/`group_message` 保留** —— 房间是多人共享上下文，
删掉会破坏其他成员的记录；若该用户正主持某房间，先走放映室既有逻辑销毁或转移房主。
② **`track_event` 保留** —— 行为统计不属于个人数据删除范围，且已删用户的行会自然退化成
「`user_id` 指向不存在的用户」，`statsTopUsers` 的 `LEFT JOIN` 早已把它显示成「已注销」。
③ **MinIO 头像对象一并删**（best-effort，失败只记日志不阻断删号），复用 `uploadAvatar` 里已有的 `removeObject`。

反过来，**`ai_message.content` 是私密对话，必须真删**，不能只删会话壳。

### 3.3 收紧 `GET /api/user` 与无鉴权端点

`GET /api/user` 改为 `@UseGuards(AuthGuard('jwt'), RootGuard)`；管理界面需要列表时走 §4 的分页接口，
不要复用这条（无分页、无字段白名单）。同时按 §8 处理 `AnimeController` 的无守卫写接口 ——
不能带着「无鉴权的写 API」进入下一阶段。

## 4. P1：用户管理

新建 `AdminModule`，全部 `@UseGuards(AuthGuard('jwt'), RootGuard)`：

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/admin/users` | `keyword? role? disabled? page? size?` | `{ items, total, page, size }` |
| GET | `/api/admin/users/:id` | — | 详情 + 统计（会话数/消息数/埋点数/追番数） |
| PATCH | `/api/admin/users/:id/ban` | `{ banned: boolean, reason?: string }` | 更新后的用户 |
| PATCH | `/api/admin/users/:id/role` | `{ role: 'root' \| 'user' }` | 更新后的用户 |
| POST | `/api/admin/users/:id/password` | `{ newPassword: string }` | `{ reset: true }` |
| DELETE | `/api/admin/users/:id` | — | `{ deleted: true }` |

`keyword` 同匹配 `username`/`nickname`，**`LIKE` 的 `%` 与 `_` 必须转义**，否则输入 `%` 等于拉全表。
`user` 表量级小，这里用 `skip/take` + `total` 即可（大表才需要游标，见 §6.1）。

**响应字段用显式白名单 `select`，不要 `find()` 整行**：`password` 靠 `@Exclude()` +
`ClassSerializerInterceptor` 保护，而该拦截器目前只挂在 `UserController` 上 —— 新 controller 若忘了挂，
密码会直接漏出去。显式 select 一次，比依赖拦截器可靠。

**提权面收敛（本项最要紧）**：

1. **红线：绝不把 `role` 加进 `UpdateUserDto`。** `PATCH /api/user/:id` 的判定是「本人**或** root」
   （`if (id !== req.user.user_id && req.user.role !== 'root')`）—— 一旦 `role` 可写，
   **任何登录用户都能把自己改成 root**。保持该 DTO 现有注释「禁止改 username / role」，并加一条断言守它。
2. 改角色只走 `/api/admin/users/:id/role`，由 `RootGuard` 把关，普通用户无路径可提权。
3. **禁止修改自己的 `role`**（含自我降级）：降级自己会立刻失去管理能力，纯属手滑。
4. **禁止把最后一个未封禁的 root 降级**（判定同 §3.1）。
5. **每次改角色必须写审计**，`detail` 记 `{ from, to }`。

**重置密码**：复用 `PASSWORD_PATTERN`（≥6 位含字母与数字）；`bcrypt.hashSync(pwd, 10)` —— `User` 的
`@BeforeInsert` 只在插入时加密，**更新必须显式 hash**（`UserService.update` 已有此约定，照抄）；
重置后**必须** `revokeAllForUser(id)` 强制全设备重登；**响应绝不回显密码，审计绝不记密码**，
只记「重置了某人的密码」。允许重置自己（等价改密），但前端要提示「将登出全部设备，含当前设备」。

## 5. P1：AI 会话审阅（隐私是重点）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/ai/conversations` | `userId? from? to? cursor? size?`，按 `create_time` 倒序 |
| GET | `/api/admin/ai/conversations/:id/messages` | 单会话全部消息（含 `tool_results` 卡片） |

**不复用**用户侧 `GET /api/ai/conversations`：那条按 `req.user.user_id` 过滤，语义是「我的」，
与「任意用户的」混在一个 handler 里，迟早写错归属判定那一行。索引：`ai_conversation` 已有 `(user_id)`，
补 `(create_time)` 以支持「不限用户、按时间浏览」；`ai_message` 已有 `(conversation_id)`，够用。

**隐私边界（要写进代码注释，不只是文档）**：

1. **这是查看他人私密对话**，读取动作**默认留痕且不可绕过**：每次调用写 `admin_audit_log`，
   `action='ai.read'`，单会话读记 `conversationId`，列表读记 `userId` + 筛选条件。
2. **列表页默认不回标题原文**。`ai_conversation.title` 是**用户首轮提问的前 30 字**
   （见 `AiService.touchConversation`），直接展示等于把所有人的提问摊在列表里。列表只给
   `会话 #<id 前 6 位> + 时间 + 消息数`；点开单会话是**显式动作**，因此单独留痕。
3. **一次只取一个会话的消息**，不提供「一次拉走某用户全部对话」的接口。
4. **审阅接口只读**：违规处置走删号（§3.2），避免把审阅界面变成误操作高危区。
   确有需求时另开 `reason` 必填 + 审计的高危接口。
5. **不做全文检索**：`content` 是 `text`，`LIKE '%x%'` 既全表扫描，又把审阅界面变成批量抓取隐私的工具。
6. **明确「谁能看」的现状不足**：目前只有 `root` 一个角色，**给了 root 就等于给了看所有人私聊的权力**。
   这是架构短板而非可默认接受的设计。将来要加管理员，**必须先把 `role` 拆成权限位**
   （如 `admin:user` / `admin:ai:read` / `admin:config`）；**在拆之前，不要把它授予除你本人以外的人**。
7. 建议给 `ai_message`/`ai_conversation` 一个 TTL（如 180 天）定期清理，同时降隐私面与表膨胀（P2）。

## 6. P1：埋点明细查询与导出

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/track/events` | `event? userId? from? to? cursor? size?` |
| GET | `/api/admin/track/events/export` | 同筛选条件，流式 CSV |

**6.1 分页用游标，不用 `OFFSET`**。`track_event.id` 是 `bigint AUTO_INCREMENT`，与插入顺序单调一致，
天然适合当游标：

```sql
SELECT ... FROM track_event
WHERE (:event IS NULL OR event = :event) AND (:userId IS NULL OR user_id = :userId)
  AND create_time >= :from AND create_time < :to AND (:cursor IS NULL OR id < :cursor)
ORDER BY id DESC LIMIT :size + 1     -- 多取一条判 hasMore，省掉 COUNT(*)
```

`OFFSET 100000` 会让 MySQL 先扫过 10 万行再丢掉，明细页越翻越慢。统一返回 `{ items, nextCursor }`，
**不返回 `total`**（大表上 `COUNT(*)` 代价高，管理界面知道「有没有下一页」就够）。
`size` 用 `clampLimit(size, 50, 200)` 收敛（`core/utils/sql.ts` 已有该工具）。

**6.2 索引**。现有 `(event, create_time)` 与 `(user_id, create_time)`，**缺 `create_time` 单列索引**，
导致「只看时间范围、不限 event/user」全表扫：

```sql
ALTER TABLE `track_event` ADD KEY `IDX_track_event_time` (`create_time`);
```

`anonymous_id`/`page` 均无索引：**先不做**这两个筛选项（YAGNI），真要用再加对应复合索引，
别为了让筛选项看起来齐全而留全表扫。

**6.3 导出**：

- `Content-Type: text/csv; charset=utf-8`，用 `@Res()` 自己写。一旦自己写响应头就
  **不能再走 `TransformInterceptor` 信封** —— 与 SSE 同一类坑（`AiController.chat` 注释里记过）。
- **流式写出**：按游标每批 2000 行查、逐批 `res.write`，绝不 `SELECT *` 全量进内存。
- **硬上限**：单次 ≤ 50000 行 **且** 时间跨度 ≤ 31 天，超出直接 400 并提示缩小范围 ——
  没有上限的导出接口等于一个 DoS 入口。
- **UTF-8 BOM**（首字节 `\uFEFF`），否则 Excel 打开中文乱码。
- **CSV 公式注入防护**：字段以 `=` `+` `-` `@` 开头时前置 `'`。极易漏，而导出文件通常会被直接双击用 Excel 打开。
- **默认不导出 `props`**（可能含 `conversationId` 等业务数据）；需要时 `includeProps=1` 显式开启并提示风险。
- 导出同样写审计：actor、筛选条件、导出行数。

**6.4 何时才做物化汇总表**：**不给 `track_event` 加业务专用列**（既有认知：通用 JSON 表换扩展性，
聚合代价是 `JSON_EXTRACT`）。现在只加 6.2 那个索引。触发条件写死，避免凭感觉提前优化：
**日增事件 > 50 万行，或 `stats/*` P95 > 1s**。届时报 `track_daily_stat`（唯一键 `(stat_date, event)`，
列 `events/users/anonymous`），由 `@nestjs/schedule` 凌晨聚合前一日；看板改读汇总表，**明细表保留**用于下钻。

## 7. P2：系统配置

现状：`aiConfig` 等在**模块加载时**从 `process.env` 读成常量对象。好消息是 `aiConfig.dailyQuota`
这类字段是**每次请求读属性**（`consumeQuota` 现读现用），所以运行时覆盖**对象属性**即可立即生效、
无需重启 —— 热改因此可行。

新增 `system_config` 表 —— 字段：`config_key(varchar 64 PK)` / `config_value(varchar 512)` /
`description(varchar 255)` / `update_by(36)` / `update_time(datetime)`。

`GET /api/admin/config` 列出**白名单内**配置项 + 生效值 + 描述；`PATCH /api/admin/config/:key` `{ value }`
→ 校验值域 → 写库 + 刷本机内存 + 审计。**只接受白名单键**，否则等于开放「远程改任意环境变量」。

| key | 映射 | 值域 | 生效 |
| --- | --- | --- | --- |
| `ai.dailyQuota` | `aiConfig.dailyQuota` | 0–10000（0=不限） | ✅ 立即 |
| `ai.historyWindow` | `aiConfig.historyWindow` | 2–50 | ✅ 下次请求 |
| `ai.enabled`（新增） | — | bool | ✅ 立即 |
| `qb.enabled` | `qbittorrentConfig.enabled` | bool | ⚠️ 需先确认下游读取时机 |

`ai.enabled` 在 `AiService.streamChat` **写 SSE 头之前**短路并抛 503 —— 沿用既有的
「配额/上游错误必须发生在写头之前，否则拿不到真实状态码」设计。

**明确不做**：`DB_PASSWORD`/`JWT_SECRET`/`MINIO_*`/`AI_SERVICE_URL` 一律 env-only。理由：改错会直接把
自己锁在门外，且这些值在进程内被多处缓存/用于建连，热改语义并不成立。**多实例局限**：DB 是唯一真相，
本方案只保证「写库实例立即生效 + 其它实例重启后一致」；本项目单实例够用，写清边界即可，不要假装它是配置中心。

## 8. P2：番剧数据维护 —— 先做减法，再谈界面

体检结论：`anime`/`anime_ep` **0 行**、前端 **0 调用**、`create/update/remove` 是脚手架桩、且**零守卫**。
所以第一步不是「建维护界面」，而是**先决定去留**。

**方案 A（推荐）**：删掉 `POST/PATCH/DELETE /api/anime` 与未被路由的死方法 `findAll()`，
清理 `CreateAnimeDto`/`UpdateAnimeDto`。理由：留着「无鉴权 + 不干活 + 看起来能写库」的接口，
下一个人很可能照着它实现真逻辑，把一个未鉴权写接口直接发到线上 —— 这是最贵的一种坑。
读接口（`getIndex`/`getDetail`/`filter`）确认无调用后一并删。

**方案 B（仅需求确认后）**：把「番剧数据维护」重新定义为**「Bangumi 检索结果的本地纠错/缓存表」**
（当前 `anime` 是旧站数据模型，`rank/season/region/status` 全是无约束 `varchar`，不适合当权威数据）。
此时才需要：先给所有写接口挂 `AuthGuard('jwt') + RootGuard`（**先加守卫，再加实现**）→ 真实实现 +
DTO 白名单校验（`forbidNonWhitelisted` 已开）→ 维护界面（列表/搜索/编辑单条/删除，
**新增走「按 bangumi_id 从 Bangumi 拉取」**，不手工填字段）→ `anime_ep` 一并纳入
（目前只有实体，无 service/controller）。

**决策顺序不能反**：先确认「是否还需要本地番剧表」，再决定做界面。需求未证实就做 CRUD 是最典型的白工。

## 9. 分期与建议顺序

| 期 | 内容 | 理由 |
| --- | --- | --- |
| P0 | §2 公共底座（RootGuard / 审计表） | 后面每项都要用；先抽出来才不会各写一份 |
| P0 | §3.1 封禁即时失效 | 唯一的**新增安全能力**，不依赖前端 |
| P0 | §3.2 删号级联清理 | 已知遗留缺陷，用户管理一开就会用到；两条删号路径必须先合并 |
| P0 | §3.3 收紧 `GET /api/user` + §8 删无鉴权写接口 | 纯收口，改动小、风险确定 |
| P1 | §4 用户管理 | 封禁与级联删已铺好，这里只是拼装 + 前端 |
| P1 | §5 AI 会话审阅 | 需求明确但**隐私风险最高**，放在审计表落地之后 |
| P1 | §6 埋点明细与导出 | 有明确上限设计，风险可控；顺带补索引 |
| P2 | §7 系统配置 | 收益是运维便利，不做也不影响安全；白名单慢慢加 |
| P2 | §6.4 物化汇总表、§5 第 7 条会话 TTL | 有明确触发条件，到达再动 |

一句话：**守卫与审计 → 封禁与清理 → 用户管理 → 会话审阅 → 埋点导出 → 配置 → 番剧（减法）**。

## 10. 验收方式

无测试框架（`src/` 下 0 个 spec），一律按 `COGNITION_SYNC.md` §8 跑
`tsc --noEmit && pnpm run build && pnpm run lint` + `NODE_ENV=development node dist/main.js`（真实启动看路由）。

| 项 | 必须实测的点 |
| --- | --- |
| RootGuard | 普通用户打每个新接口 → **403**；无 token → **401**（不是 500） |
| 封禁 | ① 已签发 accessToken 立刻 401（不等 2h）② refresh 也失败 ③ 登录被拒 ④ 解封后恢复 |
| 防自锁 | 封自己 → 400；降级/封禁最后一个 root → 400 |
| 删号级联 | 8 张表逐表 `COUNT(*) WHERE user_id=?` 全为 **0**；`group`/`group_message`/`track_event` **保留**；MinIO 对象已删 |
| 提权红线 | 普通用户 `PATCH /api/user/:id` 传 `role` → **400**，确认无可提权路径 |
| 审计 | 每个写操作后 `admin_audit_log` 有行；**detail 不含密码明文** |
| 会话审阅 | 列表**不含**标题原文；每次调用产生审计行 |
| 明细分页 / 导出 | 翻页不重不漏（对照 `id` 游标）；导出 Excel 中文不乱码（BOM）、`=1+1` 被转义、超上限 400、响应**不是** JSON 信封 |
| 系统配置 | 改 `ai.dailyQuota` 对**下一次请求**立即生效（无需重启）；非白名单键 → 400 |

前端按既有要求 `pnpm type-check && pnpm build-only && pnpm lint`，并用 headless Chrome 真实渲染验收
（`.page` 忘记 `@import '~styles/page'` 导致页面滚不动那类问题，类型检查查不出来）。

## 11. 附：改动文件总览

后端路径均在 `anime-chat-server/src/`，前端在 `anime-chat/src/`。

| 项 | 新增 | 修改 |
| --- | --- | --- |
| P0 底座 | `auth/root.guard.ts`、`admin/audit.service.ts`、`admin/entities/admin-audit-log.entity.ts` | `track/track.controller.ts`、`ai/ai.controller.ts`（改用守卫）、`app.module.ts`、`docs/schema.sql` |
| P0 封禁 | — | `user/entities/user.entity.ts`、`auth/jwt.strategy.ts`、`auth/auth.service.ts`、`docs/schema.sql` |
| P0 级联删 | `user/account-cleanup.service.ts` | `user/user.service.ts`、`user/user.controller.ts` |
| P1 用户管理 | `admin/{admin.module,admin.controller,admin.service}.ts` + `admin/dto/*` | `app.module.ts`；前端 `api/admin.ts`、`router/index.ts`、`stores/modules/route.ts`、`views/admin/*` |
| P1 会话审阅 | `admin/ai-review.controller.ts` | `ai/ai.service.ts`（复用查询）、`docs/schema.sql`（索引） |
| P1 埋点明细/导出 | `admin/track-admin.controller.ts` | `track/track.service.ts`、`core/utils/sql.ts`、`docs/schema.sql`（索引） |
| P2 系统配置 | `admin/config.controller.ts`、`admin/runtime-config.service.ts` + 实体 | `core/config/config.ts`、`ai/ai.service.ts`（`ai.enabled` 短路）、`docs/schema.sql` |
| P2 番剧 | — | `anime/anime.controller.ts`、`anime/anime.service.ts`、`anime/dto/*`（方案 A 为删除） |

前端新页面统一放 `views/admin/`，路由与侧边栏沿用「按 role 计算的 `computed`」模式
（`stores/modules/route.ts`）。**注意 `routeList` 的消费处必须包 `computed`** ——
直接 `const x = routeStore.routeList` 拿到的是数组快照，登录/登出后不更新（此坑已踩过一次）。

## 12. 不建议做什么

| 不做 | 原因 |
| --- | --- |
| 把 root 判定下放到前端 | 前端隐藏入口只是体验；`/admin` 刻意无守卫，判定必须在后端 |
| 把 `role` 加进 `UpdateUserDto` | 「本人或 root」的判定会让**任何用户**把自己改成 root，一行代码就是一个提权漏洞 |
| 复用 `user.status` 当封禁位 | 它是**在线状态**（登录置 1、离开置 0），混用会让「离线」显示成「被封」 |
| 为封禁把 accessToken 落库 / 上黑名单 | `validate` 本就每请求查库，一次主键查询即可即时生效 |
| 审计写进 `track_event` | 埋点**故意吞异常**，审计必须反过来；保留期与检索维度也不同 |
| 给 `track_event` 加业务专用列 | 量级上来另建物化汇总表；通用表只加索引 |
| 明细 `OFFSET` 深翻 / 导出 `SELECT *` 全量进内存 | 表持续增长：深翻退化、全量 OOM；用游标 + 流式 + 硬上限 |
| 导出默认带 `props` | 含业务数据，默认最小化，要就显式开关并提示风险 |
| 对 `ai_message.content` 做全文检索 | `LIKE '%x%'` 全表扫，且把审阅界面变成批量抓取隐私的工具 |
| 需求未证实就做番剧 CRUD 界面 | §8：两张表 0 行、前端 0 调用，先做减法 |
| 把 `DB_PASSWORD`/`JWT_SECRET` 纳入热改白名单 | 改错直接自锁，且进程内多处缓存，热改语义不成立 |
