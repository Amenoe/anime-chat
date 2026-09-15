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

API modules in `src/api/` export typed functions: `home.ts` / `search.ts`（Bangumi）、`login.ts`（登录/刷新/登出/用户）、`room.ts`（放映室 HTTP）、`playback.ts`（播放会话/搜源）、`media-source.ts`（数据源订阅）、`user-anime.ts`（追番）。

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

Five stores in `src/stores/modules/`, all using Composition API style (`defineStore` with setup function):

- **login** — accessToken / refreshToken / userInfo，持久化 localStorage；`refreshAction` / `logoutAction`
- **home** — anime listing data, calendar (weekly broadcast), detail + episodes from Bangumi API
- **room** — 放映室：socket 连接、role（host/viewer）、playback_state、消息、在线成员
- **userAnime** — 追番（wish/watching/done）
- **route** — static sidebar navigation list

> 旧纯聊天 `/chat` 路由、`Chat.vue` 与 `chat` store 已于 2026-08-17 下线，放映室统一走 `room`。

A custom `$reset` plugin in `src/stores/index.ts` snapshots initial state on creation (required because Composition API stores don't get `$reset` by default).

### Routing

HTML5 History mode, all routes lazy-loaded. No route guards — auth checks happen inside individual components.

放映室路由 `/room/:seasonId`（房间业务 key 为 `season_id`，勿与 `session_id` 混淆）。详情页点集 → 列房/创建确认 → 进房。

### Layout

`App.vue` renders a fixed header (`AppHeader`), collapsible sidebar (`AppAsideBar`), and main content (`AppRouter`). `AppRouter` uses `<keep-alive include="Search">` and directional slide transitions. Sidebar auto-hides at ≤768px via resize listener.

### CSS

Less with CSS custom properties for theming (dark theme). Key variables: `--bg-color` (#1e1d2b), `--aside-bg-color` (#2f3042), `--box-bg-color` (#222433), `--primary-color` (rgba(104, 198, 189, 1)), `--font-color` (#fff), `--font-unactive-color`. `src/assets/css/util.less` is globally injected via Vite's Less preprocessor options. `src/assets/css/page.less` provides the shared `.page` class used by all page views. Element Plus style overrides live in `src/assets/css/app.less`.

### Design Language

Anime/二次元 style with consistent patterns: section headers use `border-left: 4px solid var(--primary-color)`, cards use `var(--aside-bg-color)` background with hover glow (`box-shadow: 0 0 12px rgba(104, 198, 189, 0.15)`), tags have subtle primary-color borders, and accent colors use `--primary-color`.

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
