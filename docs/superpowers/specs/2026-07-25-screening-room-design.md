# 放映室（一起看）设计规格

日期：2026-07-25  
状态：待用户审查后进入实现计划  
范围：将现有「每番聊天室」升级为「放映室」——左播放、右聊天/列表，主机强同步进度。

---

## 1. 目标与非目标

### 1.1 目标

1. 详情页点集/播放：若该番**相关放映室**已存在则提示进入；否则确认是否创建。支持多人同步观看与实时聊天。
2. 布局对齐参考图：左侧播放器 + 集数，右侧「聊天 / 播放列表」Tab，在线用户与公告。
3. **房主**控制播放进度与剧集；观众只读跟随。
4. 房间内所有用户观看同一播放内容；聊天实时。
5. **同一番可多间放映室**：用随机 `season_id`（房间 key，**与番剧分季无关**）区分房间。
6. **房间播放内容绑定集数**：创建/开播时记录 ep 相关 id（见 §2.1）。
7. 房主离开：有人则**转让**房主；无人则**销毁**房间。
8. **不保留**纯文字聊天模式（始终是放映室 UI）。

### 1.2 非目标（一期不做）

- Cloudflare 验证码源的 WebView 解谜（沿用现有数据源限制）。
- 好友系统完整实现（「邀好友」可先占位：复制带 `season_id` 的房间链接）。
- 弹幕叠在视频上。
- 跨机房多实例状态外置（一期单机 Socket 即可）。

---

## 2. 产品决策（已确认）

| 项       | 决策                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 架构路径 | 方案 A：扩展现有 `Group` + Socket，合并聊天为放映室                     |
| 房间标识 | `season_id` = **随机生成的房间 key**（字符串），与播放内容/番剧分季无关 |
| 内容绑定 | 房间关联 `anime_id` + **集数相关 id**（`episode_id` / `episode_sort`）  |
| 多厅     | 同一 `anime_id` 可有多间房（不同 `season_id`）                          |
| 进度同步 | 强同步：主机 pause/play/seek/切集广播，观众强制跟随                     |
| 房主离开 | 有人 → 转让；无人 → 销毁                                                |
| 纯聊天   | 不保留                                                                  |

### 2.1 字段语义（重要）

#### `season_id`（房间 key）

- **不是** Bangumi 分季 id，也不是「第几季」。
- 类型：`varchar(32)`（或 36），创建房间时服务端生成（如短 UUID / nanoid）。
- 用途：房间对外唯一业务 key；邀请链接、join 参数使用它。
- 全局唯一（或至少在业务上唯一索引）。

#### 集数相关 id（房间内容）

| 字段                    | 类型           | 说明                                   |
| ----------------------- | -------------- | -------------------------------------- |
| `episode_id`            | int nullable   | Bangumi 剧集 id（`ep.id`），有则优先用 |
| `episode_sort`          | float nullable | 集序号（第 n 话，对应 Bangumi `sort`） |
| `playback_episode_sort` | float nullable | **当前正在播**的集（房主可切集后更新） |

约定：

- 用户从详情页点「第 3 话」创建房间时：写入 `episode_id`（若有）、`episode_sort=3`，并可作为初始 `playback_episode_sort`。
- 列表/入口展示：「xxx 第 3 话放映室」。
- 查询「该番是否已有放映室」：按 `anime_id` 列出进行中的房间；可选再按 `episode_sort` 过滤「同集房间」。
- 房主切集：更新 `playback_episode_sort`（及可选 `episode_id`）；**不改变** `season_id`。

---

## 3. 用户流程

### 3.1 进入

```
详情页点击集数 / 播放（带 anime_id + episode_id? + episode_sort）
  → 需登录
  → GET 该 anime 下进行中的放映室列表（可按 episode_sort 高亮同集）
  → 已有房间：
       提示「当前番剧已有放映室，是否进入？」
       （多间时展示列表：房间名 / 当前集 / 人数 / 是否在播）
       选择进入 → joinRoom(season_id)
  → 无房间或用户选择新建：
       弹窗「是否创建放映室？」
       确认 → 创建（生成 season_id，绑定 ep）→ 创建者 = host → 进入
       取消 → 停留详情
```

### 3.2 房内

- **房主**：搜源选源 → `set_source` → 全员加载同一流；可切集、暂停、seek。
- **观众**：禁用进度/切集；可聊天；新进对齐 `playback_state`。
- **右侧**：聊天（在线头像、公告、消息）/ 播放列表（集数列表 + 当前集高亮）。

### 3.3 离开 / 断线

- 离开者是房主且仍有人在线 → 转让房主。
- 最后一人离开 → **销毁**房间（硬删 group + 消息 + 映射，与「不保留聊天」一致）。

---

## 4. 界面结构

路由建议：

- `/room/:seasonId`（推荐：用房间 key 进房，稳定分享）
- 或 `/chat?season_id=` + `anime_id` 兼容

布局：

```
+---------------------------+------------------+
|  播放器 (Artplayer)        | Tab: 聊天 | 列表  |
|                           | 公开开关(占位)    |
|                           | 在线头像 / 邀好友 |
|  当前集 / 主机 / 同步状态   | 消息流 + 公告    |
|  集数条（主机可点）         | 输入框 + 发送    |
+---------------------------+------------------+
```

视觉：站内暗色 + primary `#68c6bd`；主区约 65–70%，侧栏约 320–380px。

---

## 5. 数据模型

### 5.1 扩展 `group`（放映室）

| 字段                    | 类型               | 说明                                       |
| ----------------------- | ------------------ | ------------------------------------------ |
| `group_id`              | uuid PK            | 内部主键（Socket room 可用此或 season_id） |
| `season_id`             | varchar(32) UNIQUE | **随机房间 key**，创建时生成               |
| `anime_id`              | int                | 番剧 Bangumi id                            |
| `episode_id`            | int nullable       | 创建时/当前关联的 Bangumi 集 id            |
| `episode_sort`          | float nullable     | 创建时关联的集序号（入口展示）             |
| `host_user_id`          | varchar            | 当前房主                                   |
| `is_public`             | tinyint default 1  | 公开放映                                   |
| `notice`                | 已有               | 公告                                       |
| `group_name`            | 已有               | 展示名，可默认「{番名} 第 n 话」           |
| `playback_status`       | varchar            | `idle` / `playing` / `paused`              |
| `playback_episode_sort` | float nullable     | **当前播放**集序号                         |
| `playback_episode_id`   | int nullable       | **当前播放** Bangumi 集 id                 |
| `playback_session_id`   | varchar nullable   | Nest playback session                      |
| `playback_stream_url`   | text nullable      | 相对 stream 路径（无 JWT）                 |
| `playback_position`     | float default 0    | 秒                                         |
| `playback_updated_at`   | datetime nullable  | 状态版本时间                               |
| `playback_title`        | varchar nullable   | 当前资源标题                               |

约束：

- **`season_id` UNIQUE**（房间 key）。
- 索引：`(anime_id)`、`(anime_id, episode_sort)` 便于列表查询。
- **不再**使用「每 anime 仅一房」；旧逻辑 `findOne({ anime_id })` 废弃。
- 历史字段 `user_id`：创建时与 `host_user_id` 对齐。

### 5.2 权限

- 房主 = `host_user_id`；一期无多管理员。
- 在线以 Socket 房间成员为准。

### 5.3 房主转让顺序

1. 在线成员中**最早加入**且非原房主；
2. 否则任意在线用户；
3. 无在线 → 销毁。

---

## 6. 实时协议（Socket.IO）

### 6.1 进房

- 客户端：`joinRoom` `{ season_id, create?, anime_id?, episode_id?, episode_sort?, group_name? }`
  - 已有房：只传 `season_id`。
  - 创建：`create: true` + `anime_id` + ep 字段；服务端生成 `season_id`。
- 服务端：
  - 创建时生成 `season_id`，写入 ep 字段，host = 当前用户；
  - `client.join(group_id)`（或 `season_id`，实现统一一种）；
  - 回包：`joinRoom` `{ group, role, playback_state, recent_messages, online_users }`。
  - 若 `create: false` 且不存在 → `need_create` / 404。

兼容：旧 `addGroup` 可映射为「按 anime 找任意公开房或创建 season_id 新房」；新前端只走 `joinRoom`。

### 6.2 聊天

- 沿用 `groupMessage`；绑 `group_id`。

### 6.3 播放控制（仅 host）

`playback:control`：

```ts
{
  group_id: string // 或 season_id
  action: 'play' | 'pause' | 'seek' | 'switch_episode' | 'set_source'
  position?: number
  episode_sort?: number
  episode_id?: number
  session_id?: string
  stream_url?: string
  title?: string
  paused?: boolean
}
```

服务端校验 host → 更新 DB → `playback:state` 广播。

### 6.4 `playback:state`

```ts
{
  group_id: string
  season_id: string
  status: 'idle' | 'playing' | 'paused'
  episode_sort: number | null
  episode_id: number | null
  session_id: string | null
  stream_url: string | null
  position: number
  paused: boolean
  host_user_id: string
  server_time: number
  updated_at: string
}
```

观众：url 变化则重载；playing 时 `currentTime ≈ position + (now - server_time)/1000`。

### 6.5 心跳

- 房主每 5–10s 上报 position；DB 写入可节流（如 2s）。

### 6.6 在线 / 转让 / 销毁

- `activeGroupUser` 扩展在线用户摘要。
- `host:changed` `{ season_id, host_user_id }`。
- `room:destroyed` `{ season_id }` → 前端回详情。

---

## 7. HTTP API

| 方法 | 路径                                 | 说明                                                                              |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------- |
| GET  | `/api/rooms?anime_id=&episode_sort=` | 列出该番进行中的房；可选按集过滤/排序                                             |
| POST | `/api/rooms`                         | 创建 `{ anime_id, episode_id?, episode_sort?, group_name? }` → 返回含 `season_id` |
| GET  | `/api/rooms/by-key/:seasonId`        | 按房间 key 取详情 + playback_state                                                |

播放仍走 `/api/playback/*`；host 创建 session 时带 `group_id`。

---

## 8. 前端模块

| 模块                                | 职责                                     |
| ----------------------------------- | ---------------------------------------- |
| 放映室页（升级 Chat 或 `Room.vue`） | 左播右聊布局                             |
| `PlayerPane`                        | 播放器 + 集数 + 同步                     |
| `ChatPane`                          | 聊天 / 在线 / 公告                       |
| `PlaylistPane`                      | 集数列表                                 |
| store                               | socket、role、playback_state、season_id  |
| 详情页                              | 点集 → 列房/创建确认 → `/room/:seasonId` |

`AnimePlayer`：`controlled`（观众禁用）、host `timeupdate` 回调。

---

## 9. 后端模块

| 模块            | 职责                             |
| --------------- | -------------------------------- |
| Group 扩展      | §5 字段 + season_id 生成         |
| RoomService     | 创建/列表/销毁/转让/更新播放状态 |
| ChatGateway     | join/control/leave               |
| PlaybackService | session.group_id；同房成员可读流 |

销毁：硬删 message、map、group。

---

## 10. 安全

- control 仅 host。
- 广播 stream 路径不含 JWT；观众自带 token。
- **同房可读 host 的 playback session**（`openStream` 鉴权扩展 + session.group_id）。

---

## 11. 错误与边界

| 场景                  | 行为                   |
| --------------------- | ---------------------- |
| 未登录                | 提示登录               |
| season_id 无效/已销毁 | 提示并回详情           |
| 非 host control       | 忽略 + 错误事件        |
| 源失效                | 房主重选；广播新 state |
| 房主断线超时          | 转让或销毁             |
| 观众缓冲慢            | 心跳再对齐             |

---

## 12. 分步实现顺序

1. DB：`season_id` 随机 key、`episode_id` / `episode_sort`、播放状态字段、session.group_id
2. RoomService：创建/列表/销毁/转让
3. Gateway：joinRoom / playback 事件
4. Stream 同房鉴权
5. 前端放映室布局 + 进房/创建确认
6. 强同步播放
7. 聊天侧栏迁入
8. 集数条 + 房主搜源开播 + 心跳打磨

---

## 13. 成功标准

- 同一 `anime_id` 可创建多个 `season_id` 不同的房；链接用 `season_id` 进入正确房间。
- 创建时绑定集数（`episode_sort` / `episode_id`），列表可展示「第 n 话」。
- 房主开播后观众同集同进度（误差 &lt; 2s）；暂停/seek/切集 1s 内跟随。
- 观众无法拖进度/切集。
- 房主离开有人 → 转让；最后一人离开 → 销毁。
- 聊天实时。

---

## 14. 规格自检

- 已纠正：`season_id` ≠ 番剧分季，= 随机房间 key。
- 已补充：`episode_id` / `episode_sort` / `playback_episode_*` 内容绑定。
- 多厅模型与唯一索引一致（`season_id` UNIQUE，非 anime 唯一）。
- 同房播流鉴权仍为必须项。
