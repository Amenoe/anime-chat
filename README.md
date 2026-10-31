# 动漫放映室（anime-chat）

番剧浏览、追番、「放映室」一起看与私人点播室。**单仓结构**，三个子项目：

| 目录 | 内容 | 技术栈 | 启动 |
| --- | --- | --- | --- |
| `client/` | 前端 | Vue 3 + Vite + Pinia + Element Plus + Artplayer/hls.js | `pnpm --dir client dev`（8012） |
| `server/` | 后端 | NestJS + TypeORM + MySQL + MinIO + Socket.IO + qBittorrent | `pnpm --dir server start:dev`（3000） |
| `docs/` | 跨仓文档 | 架构、接口契约、播放方案、任务看板 | — |

AI 对话能力在**独立仓库** `anime-ai`（Spring Boot + LangChain4j）里，通过 HTTP（`AI_SERVICE_URL`）接入，不并入本仓。

## 快速开始

```bash
pnpm --dir client install
pnpm --dir server install

# 终端 1：后端（localhost:3000）
pnpm --dir server start:dev

# 终端 2：前端（localhost:8012，/api 代理到 3000）
pnpm --dir client dev
```

环境变量见各自目录的 `.env.development`（都不入库）。qBittorrent 用
`server/docker-compose.playback.yml` 启动，配置项见 `docs/playback-architecture.md`。

## 文档

- [项目记忆与任务看板](docs/PROJECT_MEMORY.md)
- [接口契约](docs/api-contract.md)
- [前后端认知同步](docs/COGNITION_SYNC.md)
- [播放架构（BT / HLS / 字幕）](docs/playback-architecture.md)

## 提交约定

Emoji + Angular 风格：`🌟feat(scope): subject`。前端在 `client/` 下用 husky + lint-staged，
仓库级 `core.hooksPath` 指向 `client/.husky` —— 新克隆后执行一次：

```bash
git config core.hooksPath client/.husky
```

## 版本

`v1.0.0`：首个单仓版本（合并 client / server / docs）。
