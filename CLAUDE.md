# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

anime-chat-client — Vue 3 frontend for an anime discussion platform with 「放映室」一起看 (socket.io) and online playback (Artplayer + hls.js). Backend repo: [anime-chat-server](https://github.com/Amenoe/anime-chat-server). The project uses Chinese for comments, commit messages, and UI text. 公共记忆与任务看板见根目录 `docs/PROJECT_MEMORY.md`。

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

API modules in `src/api/` export typed functions: `home.ts` / `search.ts`（Bangumi）、`login.ts`、`room.ts`（放映室 HTTP）、`playback.ts`（播放会话/搜源）、`media-source.ts`（数据源订阅）、`user-anime.ts`（追番）。

### State Management (Pinia)

Six stores in `src/stores/modules/`, all using Composition API style (`defineStore` with setup function):

- **login** — token + userInfo, persisted to localStorage
- **home** — anime listing data, calendar (weekly broadcast), detail + episodes from Bangumi API
- **chat** — legacy text chat (socket.io)；放映室统一走 room store
- **room** — 放映室：socket 连接、role（host/viewer）、playback_state、消息、在线成员
- **userAnime** — 追番（wish/watching/done）
- **route** — static sidebar navigation list

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

No test framework is configured and no test files exist.
