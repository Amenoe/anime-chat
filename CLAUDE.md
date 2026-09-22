# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

anime-chat-client — Vue 3 frontend for an anime discussion platform with 「放映室」一起看 (socket.io) and online playback (Artplayer + hls.js). Backend repo: [anime-chat-server](https://github.com/Amenoe/anime-chat-server). The project uses Chinese for comments, commit messages, and UI text.

跨仓文档（在**工作区根目录** `docs/`，不属于本仓库，但改动前请先读）：

- `docs/PROJECT_MEMORY.md` — 公共记忆、任务看板、修复记录、Git Ship 流程
- `docs/api-contract.md` — 接口契约（含双 token 鉴权）
- `docs/COGNITION_SYNC.md` — 前后端认知同步（跨仓约定 + 易踩坑清单）
- `docs/schema.sql` / `docs/playback-architecture.md` — 表结构 / 播放架构

## Commands

```bash
pnpm dev              # Dev server at localhost:8012
pnpm build            # Type-check + production build (parallel)
pnpm build-only       # Vite build only (skip type-check)
pnpm type-check       # vue-tsc --noEmit
pnpm lint             # ESLint check
pnpm eslint           # ESLint with --fix on src/ and mock/
pnpm prettier         # Prettier format all files
pnpm commit           # Interactive commitizen commit
```

## Commit Convention

Emoji-prefixed Angular-style commits, enforced by commitlint + husky:

```
🌟feat(scope): subject
🐛fix(scope): subject
📝docs(scope): subject
💎style(scope): subject
🌠refactor(scope): subject
🚀perf(scope): subject
🚨test(scope): subject
📦build(scope): subject
👷ci(scope): subject
🔂revert(scope): subject
```

Scope and subject are both required. Pre-commit hook runs lint-staged (ESLint + Prettier).

## Tech Stack

Vue 3.5 (Composition API, `<script setup lang="ts">`) + TypeScript 5.8 + Vite 5.4 + Pinia + Vue Router 4 + Element Plus + socket.io-client + Less + pnpm
（图表：echarts 6，**仅管理看板用**，按需注册见 `src/utils/echarts.ts` + 独立分包见 `vite.config.ts`）

## Auto-Import System

Two unplugin plugins handle auto-imports — this is critical to understand:

- **unplugin-auto-import**: `ref`, `computed`, `watch`, `onMounted`, `useRoute`, `useRouter`, and all Vue/Vue Router composition APIs are available globally WITHOUT explicit imports. Type declarations in `src/plugin/auto-import.d.ts`.
- **unplugin-vue-components**: All Element Plus components (`ElButton`, `ElInput`, `ElNotification`, etc.) are auto-resolved WITHOUT explicit imports. Type declarations in `src/plugin/components.d.ts`.

When you see these used without imports in `.vue` files, it's intentional.

## Architecture

### Path Aliases (in vite.config.ts + tsconfig.json)

- `@` → `src/`
- `@apis` → `src/api/`
- `~styles` → `src/assets/css/`

### API Layer

Two axios instances:

- `src/common/request/index.ts` — project backend (auth/room/playback/media-source/user-anime). Request interceptor attaches Bearer token, response interceptor unwraps `response.data.data` and shows `ElNotification` on errors.
- `src/common/request/bangumi.ts` — Bangumi public API (`https://api.bgm.tv`). Response interceptor returns `response.data` directly (no envelope). Requires `User-Agent` header.

API modules in `src/api/` export typed functions: `home.ts` / `search.ts`（Bangumi）、`login.ts`（登录/刷新/登出/用户）、`room.ts`（放映室 HTTP）、`playback.ts`（播放会话/搜源）、`media-source.ts`（数据源订阅）、`user-anime.ts`（追番）、`admin.ts`（管理看板统计，**仅 root**）。

### Auth（双 token 静默刷新）

`src/common/request/axios-utils.ts` 是唯一实现刷新逻辑的地方，改动前务必理解：

- 后端 401 会带真实 HTTP 状态码，错误拦截器据此触发刷新
- `renewAccessToken()` **统一走 login store 的 `refreshAction()`**（动态 import 避免循环依赖），
  store ref 与 localStorage 一起更新；`refreshPromise` 把并发 401 合并成一次刷新
- 原请求带 `_authRetried` 标记，只重试一次，防死循环；刷新接口自身带 `skipAuthRefresh`
- 刷新失败 / 无 refreshToken → `handleUnauthorized()`：清 token + 跳登录提示（并发只提示一次）
- 主动登出走 store 的 `logoutAction()`：先调后端 `POST /auth/logout` 吊销 refreshToken，再清本地
- 改密会吊销全部会话（含本机），`User.vue` 用新密码静默重登，避免到期被登出

### State Management (Pinia)

Six stores in `src/stores/modules/`, all using Composition API style (`defineStore` with setup function):

- **login** — accessToken / refreshToken / userInfo，持久化 localStorage；`refreshAction` / `logoutAction`
- **home** — anime listing data, calendar (weekly broadcast), detail + episodes from Bangumi API
- **room** — 放映室：socket 连接、role（host/viewer）、playback_state、消息、在线成员
- **userAnime** — 追番（wish/watching/done）
- **ai** — AI 对话：会话列表、消息、流式状态；`reset()` 见下
- **route** — sidebar navigation list；**按 role 动态计算**（`computed`），root 才多出「管理看板」。
  ⚠️ 消费处必须包一层 `computed`（`App.vue` / `AppRouter.vue` 都是），
  直接 `const x = routeStore.routeList` 拿到的是**当时的数组快照**，登录/登出后不更新

⚠️ **`ai` store 是单例，登出必须调 `reset()`。** 不清空的话同一个标签页换账号登录后，
会把**上一个人的会话列表与消息**展示给新用户 —— 属于跨账号数据泄露，不是「没刷新」的体验问题。
登出后的 `reset()` 调用点见 `views/ai/Ai.vue` 里对 `isLogin` 的 watch。

> 旧纯聊天 `/chat` 路由、`Chat.vue` 与 `chat` store 已于 2026-08-17 下线，放映室统一走 `room`。

A custom `$reset` plugin in `src/stores/index.ts` snapshots initial state on creation (required because Composition API stores don't get `$reset` by default).

### Routing

HTML5 History mode, all routes lazy-loaded. No route guards — auth checks happen inside individual components.

放映室路由 `/room/:seasonId`（房间业务 key 为 `season_id`，勿与 `session_id` 混淆）。详情页点集 → 列房/创建确认 → 进房。

管理看板 `/admin`（`views/admin/Admin.vue`）。**刻意不加路由守卫**：权限判定在后端
（非 root 一律 403），前端隐藏入口只是体验；页面自身先查 role，非 root 展示
「仅管理员可访问」且**不发任何统计请求**。

页面用 `el-tabs` 分成两个分区：**数据看板**（埋点 + AI 使用率）与**用户管理**
（列表/筛选/封禁/改角色/重置密码/删号 + 操作日志）。

⚠️ 用户管理里最容易踩的两个坑：

- **`user.status` 是在线状态（0/1），不是封禁状态**。封禁看 `disabled_at`（非空即已封）。
  界面上「状态」列要显示的是 `disabled_at`，别拿 `status` 当封禁位 ——
  两者语义混了会把「用户离线」显示成「已封禁」。
- **对自己那一行的封禁/改角色/删除按钮必须 `:disabled`**（`isSelf(row)`），
  且处理函数里再挡一层。后端也会 400，但前端不该让管理员点了才知道。
  重置密码**允许对自己**（等价改密），只是文案要提示「将登出全部设备」。

删号确认框**先拉一次详情**把数据规模写进文案（N 个会话 / N 条消息 / N 条追番 / N 条埋点），
把「不可恢复」从形容词变成具体数字。文案刻意用纯文本单段（不用 `\n`，也**不要**开
`ElMessageBox` 的 `dangerouslyUseHTMLString` —— 那需要把用户昵称拼进 HTML，为了排版
引入注入口不值得）。

AI 助手 `/ai` 同样**不加路由守卫**，而是在页面内做门禁：未登录只渲染 `.ai-gate` 登录引导，
**不渲染对话区、不发任何 `/api/ai/*` 请求**（`onMounted` 里 `if (!isLogin) return`）。
后端本来就要求 JWT，所以这是体验与隐私问题而非安全问题（对话历史不该在未登录时可窥）。
`isLogin` 的 watch 负责登录后拉列表、登出后 `store.reset()`。

被封禁的账号打任何业务接口都会拿到 401，`axios-utils.ts` 的 `handleUnauthorized`
会**优先透出后端给的具体原因**（「账号已被禁用：<原因>」）。不这么做的话被封的人
只会看到「登录已过期」，于是反复重登、反复重试，完全不知道发生了什么。

### Layout

`App.vue` renders a fixed header (`AppHeader`), collapsible sidebar (`AppAsideBar`), and main content (`AppRouter`). `AppRouter` uses `<keep-alive include="Search">` and directional slide transitions. Sidebar auto-hides at ≤768px via resize listener.

### CSS

Less with CSS custom properties for theming (dark theme). Key variables: `--bg-color` (#1e1d2b), `--aside-bg-color` (#2f3042), `--box-bg-color` (#222433), `--primary-color` (rgba(104, 198, 189, 1)), `--font-color` (#fff), `--font-unactive-color`. `src/assets/css/util.less` is globally injected via Vite's Less preprocessor options. `src/assets/css/page.less` provides the shared `.page` class used by all page views. Element Plus style overrides live in `src/assets/css/app.less`.

⚠️ **`.page` 不是全局样式**：`page.less` 要在**每个 view 自己的 `<style scoped>` 里** `@import '~styles/page';`。
漏了的话 `height:100%` 与 `overflow-y:auto` 都不生效 —— 页面高度变成内容高度，
被父容器 `.app-container__main` 的 `overflow:hidden` 裁掉且**滚不动**，
而 type-check / build / lint **全部通过**。新页面最容易踩，务必真实浏览器量一次
`document.querySelector('.page').clientHeight` 与 `scrollHeight`。

### 图表（echarts）

**只在 `src/utils/echarts.ts` 注册图表类型与组件**（目前：Line/Bar + Grid/Legend/Tooltip + Canvas）。
忘记注册会 **运行时** 报 `Series xxx is not exists`，而类型检查是过的。
`AppChart.vue` 是唯一封装：`notMerge: true`（否则切天数后旧系列残留）+ `ResizeObserver`
（侧边栏折叠/窗口缩放都会改宽度，不 resize 会只画左半边）。

**配色一律走 `composables/useChartTheme.ts`，不要在组件里硬编码颜色。**
ECharts 画在 canvas 上读不到 CSS 变量，所以那份 composable 在运行时
`getComputedStyle` 读令牌（品牌色改了图表自动跟），并**用 `MutationObserver` 监听
`<html data-theme>`**。不能只听 `useTheme()` 的 `mode` ref —— CSS 令牌挂在
`[data-theme]` 选择器上，**DOM 才是唯一事实来源**，任何绕过 `useTheme` 改属性的路径
（首屏内联脚本、将来的设置页）都会让图表静默停在旧配色（实测：亮色下主色像素命中 0）。
验证方式是**采样 canvas 像素**统计目标主色的命中数，不要肉眼判断「差不多」。

### Design Language

Anime/二次元 style with consistent patterns: section headers use `border-left: 4px solid var(--primary-color)`, cards use `var(--aside-bg-color)` background with hover glow (`box-shadow: 0 0 12px rgba(104, 198, 189, 0.15)`), tags have subtle primary-color borders, and accent colors use `--primary-color`.

### 埋点（`utils/track.ts` + `v-track` 指令）

前端埋点只有两个入口，**不需要在业务代码里手写请求**：

```vue
<!-- 点击埋点（默认行为） -->
<el-button v-track="'ai.send'">发送</el-button>
<!-- 带属性；指令在**触发时**才读 binding.value，所以能拿到最新响应式值 -->
<div v-track="{ event: 'ai.card.click', props: { id: card.id } }">…</div>
<!-- 曝光埋点（IntersectionObserver，进入视口即上报） -->
<div v-track.view="'ai.welcome.view'">…</div>
<!-- 只上报一次 -->
<button v-track.once="'ai.send'">…</button>
```

非 DOM 事件（例如「流式结束」）直接调 `track(event, props?, target?)`。

约定与机制：

- **攒批上报**：攒够 20 条或每 5s 发一批，关闭/切后台时用 `fetch(keepalive)` 补发
  （不用 `sendBeacon` —— 它无法带 `Authorization`，登录用户会被记成匿名）。
- **绝不阻断业务**：所有上报失败静默吞掉。埋点丢一条可以接受，用户操作失败不可以。
- **不走 `common/request` 的 axios 实例**：那是业务请求层，会弹 `ElNotification`、
  401 还会触发 token 刷新重试 —— 这三件事对埋点全是错的。
- 页面浏览由 `router.afterEach` 统一上报 `page.view`，只记**路由名**不记完整 URL
  （后者会带业务 id，容易变成事实上的用户行为明细）。
- 事件名用点号分命名空间：`page.view` / `ai.*` / `search.*` / `admin.*`。
  后端事件（如 `ai.chat`）也进同一张 `track_event` 表 —— 前后端埋点共用一条查询路径。
- **中文名映射在 `src/constants/track-events.ts`**（`eventLabel(event, page)`）。
  看板不直接摆内部代号；`page.view` 的文案由 `page` 拼出（`Home` → 首页访问），
  所以是**函数**不是纯字典。表里没有的事件名**原样显示**而不是「未知事件」——
  这样新加埋点时会一眼看出缺映射。**加埋点要同步这张表。**
- 看板的「AI 使用率」依赖 `search.submit`（手动搜索次数）。它不是纯展示字段，
  **漏报会让指标静默失真**，改搜索页时务必一起验证。

⚠️ **不要把「是否计数」做成处理函数的参数，然后用 `@click="onSearch"` 绑定。**
踩过的坑：模板里写 `@click="onSearch"` 时 Vue 会把**事件对象**当第一个实参传进去，
所以 `onSearch(fromSortChange = false)` 里的 `fromSortChange` 拿到的是 `MouseEvent`（真值），
`search.submit` 被静默跳过 —— **看板上「手动搜索次数」永远 0、「AI 使用率」永远 100%，
而且完全不报错**。正解是拆成两个入口函数（`onSearch` 计数 / `runSearch` 不计数），
而不是在函数里加判断。教训：这类 bug 只有核对**数据库真实行**才暴露，界面上一切正常。

⚠️ **`v-track` 的点击监听注册在捕获阶段（capture），不要改成冒泡。**
踩过的坑：chip 上同时有 `@click="onSuggest"` 与 `v-track`。冒泡时 Vue 的处理器先执行，
它把 `streaming` 置真触发重渲染；Vue 在**微任务**里刷新，而 DOM 规范允许微任务检查点
插在「每个监听器调用之间」—— 于是重渲染卸载了元素、`unmounted` 摘掉了监听，
浏览器继续派发本次事件时已经没有它，**埋点静默丢失**。
捕获阶段在目标处理器之前执行，天然免疫，语义上也更对（先记「用户点了」再谈业务反应）。

## Environment Variables

Defined in `.env.development` / `.env.production`:

- `VITE_SERVE_URL` — backend server URL (dev: `localhost:3000`)
- `VITE_BASE_URL` — router base path
- `VITE_BASE_API` — API prefix (`/api`, proxied to backend in dev)
- `VITE_TIME_OUT` — request timeout (10000ms)

## No Tests

No test framework is configured and no test files exist. 改动后至少跑：

```bash
pnpm type-check && pnpm build-only && pnpm lint     # 必过
```

涉及进房/播放/选源等真实链路时，需额外用 headless Chrome 打真实页面验证（见
`docs/PROJECT_MEMORY.md` 修复记录里的验证方式），不要只凭类型检查就认为功能可用。
