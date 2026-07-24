# 放映室（一起看）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将现有每番聊天室升级为放映室：左播放右聊天、房主强同步、按随机 `season_id` 多厅、绑定集数内容。

**架构：** 扩展 `group` 表与 Socket.IO Gateway；HTTP 提供房间列表/创建；播放会话增加 `group_id` 并允许同房成员拉流。前端新增 `/room/:seasonId` 布局，详情页点集走「列房 / 创建确认」后进房。

**技术栈：** NestJS + TypeORM 0.2 + Socket.IO；Vue3 + Pinia + Element Plus + Artplayer；仓库 `anime-chat-server` + `anime-chat`。

**规格：** `docs/superpowers/specs/2026-07-25-screening-room-design.md`

**ID 铁律（全程遵守）：**

| 名称                          | 含义                        |
| ----------------------------- | --------------------------- |
| `season_id`                   | 房间业务 key（随机 UNIQUE） |
| `group_id`                    | 表内部 PK                   |
| `episode_id` / `episode_sort` | 集内容，非房间 id           |
| `playback_session_id`         | Nest 播放会话，非放映室 id  |

**验证约定：** 前后端均无完善单测套件。每任务以 `tsc` / `vue-tsc` / `nest build` / `build-only` 及手测清单代替「写失败测试」步骤；若后续补测可在同目录加 jest e2e。

---

## 文件结构（将创建 / 修改）

### 后端 `anime-chat-server`

| 文件                                               | 职责                                       |
| -------------------------------------------------- | ------------------------------------------ |
| `src/group/entities/group.entity.ts`               | 扩展放映室字段                             |
| `src/playback/entities/playback-session.entity.ts` | 增加 `group_id`                            |
| `src/room/room.service.ts`                         | 创建/列表/销毁/转让/播放状态               |
| `src/room/room.controller.ts`                      | HTTP API                                   |
| `src/room/room.module.ts`                          | 模块装配                                   |
| `src/room/dto/*.ts`                                | 创建/查询 DTO                              |
| `src/chat/chat.gateway.ts`                         | `joinRoom` / `playback:control` / 离开转让 |
| `src/chat/dto/chat.dto.ts`                         | 扩展 payload 类型                          |
| `src/chat/chat.module.ts`                          | 注入 RoomService                           |
| `src/playback/playback.service.ts`                 | 同房鉴权 openStream                        |
| `src/app.module.ts`                                | 注册 RoomModule                            |
| `src/utils/id.ts`（新建）                          | 生成 `season_id`                           |

### 前端 `anime-chat`

| 文件                                    | 职责                                          |
| --------------------------------------- | --------------------------------------------- |
| `src/api/room.ts`                       | 房间 HTTP                                     |
| `src/stores/modules/room.ts`            | socket、role、playback_state                  |
| `src/views/room/Room.vue`               | 放映室页布局                                  |
| `src/components/Room/PlayerPane.vue`    | 播放器 + 集数 + 同步                          |
| `src/components/Room/ChatPane.vue`      | 聊天侧栏                                      |
| `src/components/Room/PlaylistPane.vue`  | 播放列表 Tab                                  |
| `src/components/Player/AnimePlayer.vue` | `controlled` / host 进度回调                  |
| `src/router/index.ts`                   | `/room/:seasonId`                             |
| `src/views/detail/Detail.vue`           | 点集 → 列房/创建 → 进房                       |
| `src/stores/modules/chat.ts`            | 兼容或委托给 room store（可逐步废弃进房逻辑） |

---

### 任务 1：后端 Group 实体扩展 + season_id 生成

**文件：**

- 修改：`anime-chat-server/src/group/entities/group.entity.ts`
- 创建：`anime-chat-server/src/utils/id.ts`
- 修改：`anime-chat-server/src/playback/entities/playback-session.entity.ts`

- [ ] **步骤 1：实现 `generateSeasonId`**

```typescript
// src/utils/id.ts
import { randomBytes } from 'crypto'

/** 放映室业务 key，字段名固定 season_id */
export function generateSeasonId(length = 16): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
}
```

- [ ] **步骤 2：扩展 Group 实体**

在 `group.entity.ts` 增加（与规格 §5.1 一致）：

```typescript
@Column({ type: 'varchar', length: 32, unique: true })
season_id: string;

@Column({ type: 'varchar', length: 36, default: '' })
host_user_id: string;

@Column({ type: 'tinyint', default: 1 })
is_public: number;

@Column({ type: 'int', nullable: true })
episode_id: number | null;

@Column({ type: 'float', nullable: true })
episode_sort: number | null;

@Column({ type: 'varchar', length: 16, default: 'idle' })
playback_status: string; // idle | playing | paused

@Column({ type: 'float', nullable: true })
playback_episode_sort: number | null;

@Column({ type: 'int', nullable: true })
playback_episode_id: number | null;

@Column({ type: 'varchar', length: 36, default: '' })
playback_session_id: string;

@Column({ type: 'text', nullable: true })
playback_stream_url: string | null;

@Column({ type: 'float', default: 0 })
playback_position: number;

@Column({ type: 'datetime', nullable: true })
playback_updated_at: Date | null;

@Column({ type: 'varchar', length: 512, default: '' })
playback_title: string;
```

注意：开发环境 `synchronize: true` 会自动改表；若本地有旧 group 数据，可能需清空 `group` / `group_message` / `group_user_map` 或手工补 `season_id` 默认值，避免 UNIQUE 冲突。

- [ ] **步骤 3：PlaybackSession 增加 group_id**

```typescript
@Column({ type: 'varchar', length: 36, default: '' })
group_id: string;
```

- [ ] **步骤 4：类型检查**

```bash
cd anime-chat-server && pnpm exec tsc --noEmit -p tsconfig.build.json
```

预期：EXIT 0

- [ ] **步骤 5：Commit（后端）**

```bash
cd anime-chat-server
git add src/group/entities/group.entity.ts src/playback/entities/playback-session.entity.ts src/utils/id.ts
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): 扩展 group 放映室字段与 season_id 生成

- season_id 为随机房间 key；episode_* 仅内容绑定
- playback_session 增加 group_id 供同房鉴权
EOF
)"
```

---

### 任务 2：RoomService + HTTP API

**文件：**

- 创建：`anime-chat-server/src/room/room.service.ts`
- 创建：`anime-chat-server/src/room/room.controller.ts`
- 创建：`anime-chat-server/src/room/room.module.ts`
- 创建：`anime-chat-server/src/room/dto/create-room.dto.ts`
- 修改：`anime-chat-server/src/app.module.ts`

- [ ] **步骤 1：CreateRoomDto**

```typescript
// src/room/dto/create-room.dto.ts
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator'

export class CreateRoomDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  anime_id: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  episode_id?: number

  @IsOptional()
  @Type(() => Number)
  episode_sort?: number

  @IsOptional()
  @IsString()
  @MinLength(1)
  group_name?: string
}
```

- [ ] **步骤 2：RoomService 核心方法**

实现至少：

```typescript
// 伪代码签名——实现时写完整逻辑
createRoom(userId: string, dto: CreateRoomDto): Promise<Group>
listByAnime(animeId: number, episodeSort?: number): Promise<Group[]>
findBySeasonId(seasonId: string): Promise<Group | null>
toPlaybackState(group: Group): PlaybackStateView
updatePlayback(groupId: string, hostUserId: string, patch: Partial<...>): Promise<Group>
transferHost(groupId: string, newHostUserId: string): Promise<Group>
destroyRoom(groupId: string): Promise<void> // 删 message + map + group
```

`createRoom` 必须：

1. `season_id = generateSeasonId()`
2. `host_user_id = userId`，`user_id = userId`
3. 写入 `episode_id` / `episode_sort`，并初始化 `playback_episode_*` 与 `playback_status='idle'`
4. `group_name` 默认 `` `${name} 第 ${sort} 话` `` 或 `番剧 #${anime_id}`

- [ ] **步骤 3：Controller**

```typescript
@Controller('rooms')
@UseGuards(AuthGuard('jwt'))
export class RoomController {
  @Get() // ?anime_id=&episode_sort=
  list(...)

  @Post()
  create(@Req() req, @Body() dto: CreateRoomDto)

  @Get('by-key/:seasonId')
  getByKey(@Param('seasonId') seasonId: string)
}
```

- [ ] **步骤 4：注册 RoomModule，构建**

```bash
cd anime-chat-server && pnpm exec tsc --noEmit -p tsconfig.build.json && pnpm run build
```

预期：EXIT 0

- [ ] **步骤 5：手测 HTTP**

```bash
# 登录拿 token 后
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"anime_id":1,"episode_sort":3}' http://127.0.0.1:3000/api/rooms
# 期望 data.season_id 为 16 位 hex，host 为当前用户
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3000/api/rooms?anime_id=1"
```

- [ ] **步骤 6：Commit**

```bash
git add src/room src/app.module.ts
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): 放映室 HTTP 创建与列表

- POST /api/rooms 生成 season_id 并绑定集数
- GET /api/rooms 按 anime 列表；by-key 查详情
EOF
)"
```

---

### 任务 3：Gateway 进房 / 播放控制 / 转让销毁

**文件：**

- 修改：`anime-chat-server/src/chat/chat.gateway.ts`
- 修改：`anime-chat-server/src/chat/dto/chat.dto.ts`
- 修改：`anime-chat-server/src/chat/chat.module.ts`

- [ ] **步骤 1：扩展 socket meta**

```typescript
type SocketMeta = {
  userId: string | null
  groupId: string | null
  seasonId: string | null
  joinedAt: number
}
```

- [ ] **步骤 2：实现 `joinRoom`**

客户端 payload：

```typescript
{
  season_id?: string
  create?: boolean
  anime_id?: number
  episode_id?: number
  episode_sort?: number
  group_name?: string
}
```

逻辑：

1. 有 `season_id` → `findBySeasonId`，不存在则 emit 错误。
2. `create: true` → `RoomService.createRoom`。
3. `client.join(group.group_id)`（Socket 房间用 `group_id`）。
4. 回包 `joinRoom`：`{ group, role, playback_state, recent_messages, online_users }`。
5. 广播在线人数/用户列表。

保留旧 `addGroup`：映射为 `create: true, anime_id, season 自动新建` 或文档注明废弃；新前端只用 `joinRoom`。

- [ ] **步骤 3：实现 `playback:control`**

仅当 `meta.userId === group.host_user_id` 时接受。  
`action`：`play` | `pause` | `seek` | `switch_episode` | `set_source` | `heartbeat`。  
更新 DB 后 `server.to(group_id).emit('playback:state', state)`。  
`heartbeat` / 高频 `seek`：DB 写入节流 2s，广播可不节流或 1s 节流。

- [ ] **步骤 4：disconnect / leaveRoom**

1. 从 room leave。
2. 若是 host 且房间内仍有 socket → 选 `joinedAt` 最早的其他用户 `transferHost`，emit `host:changed`。
3. 若房间内 0 人 → `destroyRoom`，若仍有客户端则无需发（已空）；可选对最后离开者 emit `room:destroyed`。

- [ ] **步骤 5：构建 + 手测双客户端**

两个浏览器（或两个 token）join 同一 `season_id`；host 发 pause，viewer 应收到 `playback:state`。

- [ ] **步骤 6：Commit**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): Socket 进房与播放强同步、房主转让

- joinRoom / playback:control / playback:state
- 房主离开转让或空房销毁
EOF
)"
```

---

### 任务 4：同房播放会话鉴权

**文件：**

- 修改：`anime-chat-server/src/playback/playback.service.ts`
- 修改：`anime-chat-server/src/playback/dto/create-playback.dto.ts`（及 stream dto）
- 修改：创建 session 的 service 方法，接受可选 `group_id`

- [ ] **步骤 1：创建 session 支持 group_id**

DTO 增加可选：

```typescript
@IsOptional()
@IsString()
groupId?: string;
```

`create` / `createFromStream` 写入 `session.group_id`。

- [ ] **步骤 2：openStream 鉴权**

```typescript
// 伪逻辑
if (session.user_id === userId) allow;
else if (session.group_id) {
  const g = await groupRepo.findOne({ where: { group_id: session.group_id } });
  // 请求者是 host 或 曾在 map 中，或：简化为 group 存在且 session.group_id 匹配且
  // 当前 socket 在线过难查 → 一期：group 存在且 is_public 且 bangumi 匹配
  // 更严：GroupUserMap 有记录 或 host
  allow if member;
}
else deny;
```

推荐一期规则：

1. `session.user_id === userId`，或
2. `session.group_id` 非空，且存在 `GroupUserMap(group_id, userId)` 或 `group.host_user_id === userId`。

进房时确保写入 `GroupUserMap`。

- [ ] **步骤 3：tsc + build**

- [ ] **步骤 4：Commit**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(playback): 同房成员可拉 host 播放流

- session.group_id；openStream 成员鉴权
EOF
)"
```

---

### 任务 5：前端 room API + store

**文件：**

- 创建：`anime-chat/src/api/room.ts`
- 创建：`anime-chat/src/stores/modules/room.ts`

- [ ] **步骤 1：room API**

```typescript
// listRooms({ anime_id, episode_sort? })
// createRoom({ anime_id, episode_id?, episode_sort?, group_name? })
// getRoomByKey(seasonId)
```

- [ ] **步骤 2：room store**

状态：`seasonId`, `group`, `role: 'host'|'viewer'`, `playbackState`, `messages`, `onlineUsers`, `connected`, `joining`。

方法：

- `connectSocket(userId)`
- `joinRoom({ seasonId })` / `createAndJoin(dto)`
- `sendMessage(text)`
- `sendControl(action, payload)`（仅 host UI 调用）
- `leaveRoom()`
- 监听 `playback:state` / `host:changed` / `room:destroyed` / `groupMessage` / 在线列表

Socket 复用与 `chat.ts` 相同的 `socketBaseUrl()` 与 token/user_id query。

- [ ] **步骤 3：vue-tsc**

```bash
cd anime-chat && pnpm type-check
```

- [ ] **步骤 4：Commit（前端）**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): 放映室 API 与 Pinia store

- 进房/创建、playback 状态与聊天事件
EOF
)"
```

---

### 任务 6：放映室页面布局

**文件：**

- 创建：`anime-chat/src/views/room/Room.vue`
- 创建：`anime-chat/src/components/Room/PlayerPane.vue`
- 创建：`anime-chat/src/components/Room/ChatPane.vue`
- 创建：`anime-chat/src/components/Room/PlaylistPane.vue`
- 修改：`anime-chat/src/router/index.ts`

- [ ] **步骤 1：路由**

```typescript
{
  path: '/room/:seasonId',
  name: 'Room',
  component: () => import('@/views/room/Room.vue'),
}
```

- [ ] **步骤 2：Room.vue 壳**

左 `PlayerPane`（约 flex 1），右宽 320–380px：Tab「聊天」/「播放列表」。  
`onMounted`：`joinRoom(route.params.seasonId)`；`onBeforeUnmount`：`leaveRoom()`。  
监听 `room:destroyed` → 通知并 `router.replace('/detail/'+animeId)`。

- [ ] **步骤 3：ChatPane**

从现有 `Chat.vue` 抽消息列表 + 输入；顶部在线头像、公告、复制链接按钮（`location.origin + base + '/room/' + seasonId`）。

- [ ] **步骤 4：PlaylistPane**

展示当前番集数列表（可用 homeStore.episodes 或进房时带的 anime_id 再拉详情）；高亮 `playback_episode_sort`；host 点击 → `switch_episode`。

- [ ] **步骤 5：type-check + build-only**

- [ ] **步骤 6：Commit**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): 放映室左右分栏页面与路由

- /room/:seasonId；聊天与播放列表 Tab
EOF
)"
```

---

### 任务 7：播放器强同步 + 房主搜源

**文件：**

- 修改：`anime-chat/src/components/Player/AnimePlayer.vue`
- 修改：`anime-chat/src/components/Room/PlayerPane.vue`
- 复用：`PlaybackPanel` 搜源抽屉（房主）

- [ ] **步骤 1：AnimePlayer 增强**

Props：

```typescript
controlled?: boolean // 观众 true：禁用交互
```

实现要点：

- `controlled` 时对 video 监听并阻止 seek（或 `player.controls = false` / 覆盖进度条 pointer-events）。
- expose 或 emit：`timeupdate(currentTime)`、`play`/`pause`（仅 host 向外发 control）。
- 方法：`seekTo(t)`、`setPaused(p)` 供 store 驱动观众对齐。

- [ ] **步骤 2：PlayerPane 同步逻辑**

- 监听 `playbackState`：若 `session_id`/`stream_url` 变化 → 用本地 token 拼 stream URL 设给播放器。
- playing：`target = position + (Date.now()-server_time)/1000`；若 `|video.currentTime - target| > 1.5` 则 seek。
- host：`timeupdate` 每 5–10s `sendControl('heartbeat', { position })`；pause/play/seek 立即 control。
- 观众：不发送 control。

- [ ] **步骤 3：房主搜源**

房主打开抽屉（复用 `PlaybackPanel` 的 search 逻辑或抽 composable）；选定候选后：

1. `createStreamPlaybackSession` / `createPlaybackSession`，body 带 `groupId: group.group_id`
2. `sendControl('set_source', { session_id, stream_url, episode_sort, title })`

- [ ] **步骤 4：手测**

Host 开播 → Viewer 进入同 `season_id` 应自动出画；Host 暂停 Viewer 停。

- [ ] **步骤 5：Commit**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(room): 播放器强同步与房主搜源开播

- 观众只读跟随；host heartbeat / set_source
EOF
)"
```

---

### 任务 8：详情页入口串联

**文件：**

- 修改：`anime-chat/src/views/detail/Detail.vue`

- [ ] **步骤 1：替换点集逻辑**

原：`playbackRef.playEpisode(sort)` 仅本机搜源。  
新：

1. 未登录 → 提示登录。
2. `listRooms({ anime_id })`。
3. 有房 → `ElMessageBox` / 自定义对话框：列出房间（名、当前集、可选人数）+「进入」/「仍要新建」。
4. 无房 → 确认「是否创建放映室？」。
5. 创建：`createRoom({ anime_id, episode_id, episode_sort })` → `router.push('/room/' + season_id)`。
6. 进入已有：`router.push('/room/' + season_id)`。

进房后由 Room 页 host 再搜源；若希望「创建后自动带上集数打开搜源」，可用 query `?autosearch=1&episode_sort=3`。

- [ ] **步骤 2：旧「进入聊天室」按钮**

改为「进入放映室」：同样走列房/创建（可不带 episode，episode_sort 空）。

- [ ] **步骤 3：type-check + build-only**

- [ ] **步骤 4：Commit**

```bash
git commit --no-gpg-sign -m "$(cat <<'EOF'
🌟feat(detail): 点集进入放映室创建/加入流程

- 列房提示、创建确认、跳转 /room/:seasonId
EOF
)"
```

---

### 任务 9：联调验收与文档

- [ ] **步骤 1：按规格 §13 成功标准手测清单**

1. 同 anime 创建两个 `season_id` 不同的房。
2. 链接 `/room/:seasonId` 进对房。
3. 列表展示「第 n 话」。
4. A 开播 B 跟随；暂停/seek/切集同步。
5. B 无法拖进度。
6. A 离开 B 变 host。
7. 最后一人离开后 by-key 404 / 列表消失。
8. 聊天实时。

- [ ] **步骤 2：更新 README 简短说明放映室入口**

- [ ] **步骤 3：前后端分别 `pnpm run build` / `build-only` 全绿**

- [ ] **步骤 4：用户说「提交代码」时走 ship-code 推送**

---

## 规格覆盖自检

| 规格章节               | 任务                 |
| ---------------------- | -------------------- |
| season_id 随机 key     | 1, 2                 |
| episode_id / sort 绑定 | 1, 2, 8              |
| 多厅                   | 2, 8                 |
| 强同步                 | 3, 7                 |
| 转让/销毁              | 3                    |
| 同房拉流               | 4                    |
| 左播右聊 UI            | 6                    |
| 入口确认               | 8                    |
| 不保留纯聊天           | 6（Room 页始终双栏） |

## 类型命名一致性

- 房间 key：始终 `season_id` / `seasonId`
- 播放会话：`playback_session_id` / `session_id`（仅 playback 域）
- 集：`episode_id` + `episode_sort` / `playback_episode_*`
- Socket 房间 join：实现统一用 `group.group_id`
