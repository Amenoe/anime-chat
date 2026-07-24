# 放映室（一起看）设计规格

日期：2026-07-25  
状态：待用户审查后进入实现计划  
范围：将现有「每番聊天室」升级为「按季放映室」——左播放、右聊天/列表，主机强同步进度。

---

## 1. 目标与非目标

### 1.1 目标

1. 详情页点集/播放时进入**放映室**（原聊天室升级），支持多人同步观看与实时聊天。
2. 布局对齐参考图：左侧播放器 + 集数，右侧「聊天 / 播放列表」Tab，在线用户与公告。
3. **房主/管理员**控制播放进度与剧集；观众只读跟随。
4. 房间内所有用户观看同一播放内容；聊天实时。
5. 按 **`(anime_id, season_id)`** 一间公共厅（同季一厅，多季多厅）。
6. 房主离开：有人则**转让**房主；无人则**销毁**房间。
7. **不保留**纯文字聊天模式（始终是放映室 UI）。

### 1.2 非目标（一期不做）

- 同季多开私人厅 / 邀请码（二期可扩展 `room_key`）。
- Cloudflare 验证码源的 WebView 解谜（沿用现有数据源限制）。
- 好友系统完整实现（「邀好友」可先占位：复制房间链接）。
- 弹幕叠在视频上。
- 跨机房多实例状态外置（一期单机 Socket 即可；字段设计预留）。

---

## 2. 产品决策（已确认）

| 项       | 决策                                                |
| -------- | --------------------------------------------------- |
| 架构路径 | 方案 A：扩展现有 `Group` + Socket，合并聊天为放映室 |
| 房间粒度 | 每 `(bangumi anime_id, season_id)` 一间公共厅       |
| 进度同步 | 强同步：主机 pause/play/seek/切集广播，观众强制跟随 |
| 房主离开 | 有人 → 转让；无人 → 销毁                            |
| 纯聊天   | 不保留                                              |

### 2.1 season_id 约定

- 类型：`int`，默认 `0` 表示「整部/未知季/单季作品」。
- 来源优先级：
  1. 详情页若能解析 Bangumi 分季 subject，则用对应 id 或序号；
  2. 否则 `0`。
- 一期前端可先固定传 `season_id = 0` 或从路由 query 传入，接口与表结构先支持字段。

---

## 3. 用户流程

### 3.1 进入

```
详情页点击集数 / 播放
  → 需登录
  → 请求「查询或提示创建」放映室 (anime_id, season_id)
  → 不存在：弹窗「是否创建放映室？」
       确认 → 创建，创建者 = host → 进入放映室页并可选直接开搜源
       取消 → 停留详情
  → 已存在：直接进入放映室页（角色 = 观众，除非已是 host/admin）
```

### 3.2 房内

- **房主**：打开搜源抽屉选源 → 写入房间播放状态 → 所有人加载同一流；可切集、暂停、seek。
- **观众**：播放器控件禁用进度/切集；聊天可用；新进对齐当前 `playback_state`。
- **右侧**：Tab「聊天」显示在线头像、公告、消息；Tab「播放列表」显示本季/本房相关资源或集数状态（一期可用 Bangumi 集数列表 + 当前集高亮）。

### 3.3 离开 / 断线

- 用户主动离开或 Socket 断线：从在线集合移除。
- 若离开者是房主：
  - 在线人数 > 0：按规则转让（见 §5.3），广播新房主；
  - 在线人数 = 0：销毁房间（删 group 及相关消息/映射，或软删 + 清理），释放资源。

---

## 4. 界面结构

路由建议（二选一，实现时定一种并统一入口）：

- 升级现有：`/chat` + query `anime_id` & `season_id`
- 或更名：`/room/:animeId` + query `season_id`

布局：

```
+---------------------------+------------------+
|  播放器 (Artplayer)        | Tab: 聊天 | 列表  |
|                           | 公开开关(占位)    |
|                           | 在线头像 / 邀好友 |
|  当前集 / 主机信息 / 同步   | 消息流 + 公告    |
|  集数条（主机可点）         | 输入框 + 发送    |
+---------------------------+------------------+
```

视觉：沿用站内暗色主题与 primary `#68c6bd`，参考用户截图的左右分栏比例（主区约 65–70%，侧栏约 320–380px）。

---

## 5. 数据模型

### 5.1 扩展 `group`（放映室）

在现有字段上增加（命名可微调，语义固定）：

| 字段                    | 类型               | 说明                                   |
| ----------------------- | ------------------ | -------------------------------------- |
| `season_id`             | int, default 0     | 季标识                                 |
| `host_user_id`          | varchar            | 当前房主                               |
| `is_public`             | tinyint, default 1 | 公开放映（一期恒 1，UI 可展示）        |
| `notice`                | 已有               | 公告/自定义提示                        |
| `playback_status`       | varchar            | `idle` / `playing` / `paused`          |
| `playback_episode_sort` | float nullable     | 当前集                                 |
| `playback_session_id`   | varchar nullable   | 当前 Nest playback session             |
| `playback_stream_url`   | text nullable      | 可选：直链或相对 stream 路径（无密钥） |
| `playback_position`     | float default 0    | 秒                                     |
| `playback_updated_at`   | datetime nullable  | 状态版本时间                           |
| `playback_title`        | varchar nullable   | 当前资源标题展示                       |

约束：

- **唯一索引** `(anime_id, season_id)`（替换原先仅按 `anime_id` 查一间的逻辑）。
- `user_id` 历史字段：可与 `host_user_id` 对齐迁移（创建时两者同为创建者）。

### 5.2 权限

- `host_user_id`：房主。
- 一期可不引入多管理员表；「管理员」= 房主。转让即改 `host_user_id`。
- `group_user_map`：继续记录进过房的用户（可选）；在线以 Socket room 为准。

### 5.3 房主转让顺序

1. 当前在线 Socket 中，**最早加入**且非原房主的用户；
2. 若无元数据，则任意在线用户；
3. 无在线用户 → 销毁。

---

## 6. 实时协议（Socket.IO）

复用现有 Gateway；扩展事件命名如下（可加 `room:` 前缀避免冲突）。

### 6.1 进房

- 客户端：`joinRoom` `{ anime_id, season_id, group_name? }`
- 服务端：
  - 查 `(anime_id, season_id)`；
  - 无则仅当客户端带 `create: true` 时创建并设 host，否则返回 `need_create`；
  - `client.join(group_id)`；
  - 回包：`joinRoom` `{ group, role: 'host'|'viewer', playback_state, recent_messages, online_count }`。

兼容：可保留 `addGroup` 映射到 `joinRoom` 且 `season_id=0`，避免旧客户端立刻挂掉；前端新版只走 `joinRoom`。

### 6.2 聊天

- 沿用 `groupMessage` / 历史拉取逻辑；消息仍绑 `group_id`。

### 6.3 播放控制（仅 host）

客户端 → 服务端：`playback:control`

```ts
{
  group_id: string
  action: 'play' | 'pause' | 'seek' | 'switch_episode' | 'set_source'
  position?: number          // seek / 心跳
  episode_sort?: number
  session_id?: string
  stream_url?: string        // 相对或可拼接 token 的路径
  title?: string
  paused?: boolean
}
```

服务端：

1. 校验 `socket` 用户 === `host_user_id`；
2. 更新 DB 播放字段 + `playback_updated_at`；
3. `server.to(group_id).emit('playback:state', state)`。

### 6.4 状态广播与对齐

`playback:state`：

```ts
{
  group_id: string
  status: 'idle' | 'playing' | 'paused'
  episode_sort: number | null
  session_id: string | null
  stream_url: string | null
  position: number
  paused: boolean
  host_user_id: string
  server_time: number // Date.now()
  updated_at: string
}
```

观众：

- 收到后设置播放器 url（若 session/stream 变化）、`currentTime ≈ position + (now - server_time)/1000`（playing 时）、paused 对齐。
- 忽略自身非 host 的控制尝试（UI 已禁用）。

### 6.5 房主心跳（可选但建议一期做）

- 房主每 5–10s：`playback:control` `action: 'seek'` 仅带 `position`（或独立 `playback:heartbeat`），用于漂移校正与后进对齐。
- 节流：服务端可限制写入 DB 频率（如 2s 一次），广播可更勤。

### 6.6 在线与转让

- 沿用/扩展 `activeGroupUser`；payload 增加在线用户摘要 `{ user_id, nickname, avatar }[]` 便于侧栏头像。
- `host:changed` `{ group_id, host_user_id }`。
- `room:destroyed` `{ group_id }` → 前端退回详情。

---

## 7. HTTP API（补充）

| 方法 | 路径                              | 说明                                                          |
| ---- | --------------------------------- | ------------------------------------------------------------- |
| GET  | `/api/rooms?anime_id=&season_id=` | 查询房间是否存在 + 摘要（是否在播、人数需 socket 或缓存）     |
| POST | `/api/rooms`                      | 显式创建 `{ anime_id, season_id, group_name }`，创建者为 host |
| GET  | `/api/rooms/:id`                  | 房间详情 + playback_state（进房前预览可选）                   |

播放会话仍走现有 `/api/playback/*`；**仅 host** 在前端创建 session 后通过 `set_source` 写入房间。

---

## 8. 前端模块划分

| 模块                                               | 职责                                          |
| -------------------------------------------------- | --------------------------------------------- |
| `views/room/Room.vue` 或升级 `views/chat/Chat.vue` | 放映室页布局                                  |
| `components/Room/PlayerPane.vue`                   | 播放器 + 集数条 + 同步逻辑                    |
| `components/Room/ChatPane.vue`                     | 聊天 / 在线 / 公告                            |
| `components/Room/PlaylistPane.vue`                 | 播放列表 Tab                                  |
| `stores/modules/room.ts` 或扩展 `chat.ts`          | socket、role、playback_state                  |
| 详情页                                             | 点集 → 查房 → 确认创建 → `router.push` 放映室 |

播放器：复用 `AnimePlayer`；增加 props：`controlled`（观众 true 时禁用交互）、`onHostTimeUpdate`。

搜源：房主在房内复用 `PlaybackPanel` 抽屉逻辑；选定候选后 `set_source` + 本地开播。

---

## 9. 后端模块划分

| 模块                                       | 职责                            |
| ------------------------------------------ | ------------------------------- |
| `Group` entity 扩展                        | 见 §5                           |
| `ChatGateway`                              | join/control/leave/转让/销毁    |
| `RoomService`（建议新建，被 gateway 调用） | 创建/查询/更新播放状态/销毁事务 |
| `PlaybackService`                          | 不变；host 各自鉴权拉流         |

销毁时：删除 `group_message`、`group_user_map`、`group`（或 status=closed 软删；一期硬删更简单，与「不保留聊天」一致）。

---

## 10. 安全

- 所有 control 校验 host。
- stream URL 不广播 JWT；观众用自己的 token 拼 `?token=` 访问 `/api/playback/sessions/:id/stream`。
- session 归属：一期允许同房观众请求 host 已创建的 session 流（需扩展 stream 鉴权：同房成员可读），否则观众无法播。

**鉴权扩展（必须）：**

- `openStream`：除 session.user_id === 请求者外，若 session 绑定在某 `group_id` 且请求者在该房在线/为成员，则允许。
- 创建 session 时 host 传入可选 `group_id` 写入 `playback_session` 新字段。

---

## 11. 错误与边界

| 场景                          | 行为                                               |
| ----------------------------- | -------------------------------------------------- |
| 未登录点播放                  | 提示登录                                           |
| 创建取消                      | 不进房                                             |
| 非 host 发 control            | 403 事件，忽略                                     |
| 源失效                        | 房主重选源；广播新 state；观众提示「主机更换片源」 |
| 房主断线超时（如 30s 无重连） | 按离开处理转让/销毁                                |
| 观众缓冲慢                    | 允许短延迟；心跳再次对齐                           |
| 房间已销毁仍停留 UI           | 收到 `room:destroyed` 跳转详情                     |

---

## 12. 分步实现顺序（供 writing-plans）

1. **DB + RoomService**：扩展 group、唯一索引、创建/查询/销毁、session.group_id
2. **Gateway**：joinRoom / need_create / playback 事件 / 转让销毁
3. **Stream 鉴权**：同房可播 host session
4. **前端放映室页**：布局壳 + 进房确认流
5. **同步播放**：host 控制 + 观众跟随
6. **聊天侧栏**：迁入现有消息 UI + 在线头像
7. **播放列表/集数** + 房主搜源开播串联
8. **打磨**：心跳、断线、公告编辑

---

## 13. 成功标准

- 用户 A 创建某番 `season_id=0` 放映室并开播第 1 话；用户 B 进入后自动同集同进度（误差 < 2s 可接受）。
- A 暂停/seek/切集，B 在 1s 内跟随。
- B 无法拖动进度或切集。
- A 离开且 B 仍在 → B 成为房主并可控制。
- 最后一人离开 → 房间销毁；再次进入需重新创建确认。
- 聊天消息房内实时可见。

---

## 14. 规格自检记录

- 无 TODO/待定占位；season_id 默认与来源已写明。
- 与「每番一厅」已改为「每季一厅」，与用户最新决策一致。
- 同房播流鉴权为明确必须项，避免实现时遗漏。
- 范围单规格可覆盖；实现拆 8 步。
