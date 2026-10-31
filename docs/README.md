# anime-chat 共享文档

单仓（`client/` 前端 / `server/` 后端）的公共文档，位于仓库根目录 `docs/`。
另有独立仓库 `anime-ai`（AI 服务）。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | 生产部署手册：2C2G/宝塔环境、swap、MySQL 调参、qB、ffmpeg、Nginx、systemd、验收与排错 |
| [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) | 项目概览、当前进度、任务看板、修复记录、文档地图、Git Ship 流程 |
| [`COGNITION_SYNC.md`](./COGNITION_SYNC.md) | **前后端认知同步**：跨仓契约、命名对齐、改动联动清单、验证与提交约定 |
| [`api-contract.md`](./api-contract.md) | 接口契约：统一响应信封、双 token 鉴权、用户 / 追番接口 |
| [`playback-architecture.md`](./playback-architecture.md) | 播放架构：BT/磁力 → 站内播、qBittorrent 部署与限制 |
| [`schema.sql`](./schema.sql) | 全量表结构（生产建库依据） |

AI 助手工作规则与代码导览见 `../client/AGENTS.md`（前端）、`../server/AGENTS.md`（后端）、`anime-ai/AGENTS.md`（独立 AI 服务）。

## 维护约定

- 改代码 / 接口 / 实体后，按 `COGNITION_SYNC.md` §7「改动联动清单」同步本目录
- **改 TypeORM 实体必须同步 `schema.sql`**（生产关闭 `synchronize`，建库依赖它）
- 推进任务或修完问题后，更新 `PROJECT_MEMORY.md` 的「任务看板」与「修复记录」
- 提交沿用两仓约定：emoji 前缀 Angular 风格中文 commit
