# anime-chat 文档（唯一入口）

> 单仓（`client/` 前端 + `server/` 后端 + `docs/`）的**全部工程文档**都在本目录。
> 工作区根目录不再保留第二份文档；独立仓 `anime-ai` 的仓级工作规则见
> [`../../anime-ai/AGENTS.md`](../../anime-ai/AGENTS.md)，AI 能力的工程总览仍看本目录
> [`AI.md`](./AI.md)。

## 文档地图

| 文档 | 内容 | 什么时候读 |
| --- | --- | --- |
| [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) | 项目概览、当前进度、任务看板、修复记录、Git Ship 流程 | 第一次进项目；想知道「做到哪了」 |
| [`COGNITION_SYNC.md`](./COGNITION_SYNC.md) | 前后端认知同步：响应信封、双 token、命名对齐、改动联动清单、验证与提交约定 | 改任何一端之前 |
| [`api-contract.md`](./api-contract.md) | 接口契约：响应信封、双 token 鉴权、用户/追番/放映室/点播/AI/埋点/管理端 | 改接口或调用接口 |
| [`playback-architecture.md`](./playback-architecture.md) | 播放架构：BT/磁力 → 站内播、qBittorrent、边下边播、HLS、字幕 | 改播放链路 |
| [`AI.md`](./AI.md) | AI 系统：调用链、SSE 协议、5 个工具、话题守卫、配额、RAG、评估、规划 | 改 AI 对话/检索 |
| [`admin-roadmap.md`](./admin-roadmap.md) | 管理员功能路线与设计依据（已完成 / 剩余） | 改管理端 |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | 生产部署手册：2C2G 环境、swap、MySQL 调参、qB、ffmpeg、Nginx、systemd、CI/CD、验收与排错 | 部署/运维 |
| [`schema.sql`](./schema.sql) | 全量表结构（生产建库依据，改实体后必须同步） | 改表 |
| [`ai-interview-pitch.md`](./ai-interview-pitch.md) | AI 部分面试稿（**个人材料，非工程文档，AI 助手不必读**） | 面试准备 |

仓级工作规则与代码导览：[`../client/AGENTS.md`](../client/AGENTS.md)、
[`../server/AGENTS.md`](../server/AGENTS.md)、[`../../anime-ai/AGENTS.md`](../../anime-ai/AGENTS.md)。

## 给 AI 的阅读顺序

不要通读全部文档，按任务选一条路径：

| 任务 | 先读 | 再读 |
| --- | --- | --- |
| 熟悉项目 / 不确定读什么 | 本文 → `PROJECT_MEMORY.md` §1–§2 | 对应仓的 `AGENTS.md` |
| 改前后端接口、字段、鉴权 | `COGNITION_SYNC.md` §2–§7 | `api-contract.md` 对应小节 |
| 改播放（流、边下边播、字幕） | `playback-architecture.md` | `COGNITION_SYNC.md` §5.2、`PROJECT_MEMORY.md` §4 |
| 改 AI（对话、工具、RAG） | `AI.md` | `api-contract.md` §4、`../../anime-ai/AGENTS.md` |
| 改管理端 | `admin-roadmap.md` | `api-contract.md` §7 |
| 部署 / 排错 | `DEPLOYMENT.md` | `PROJECT_MEMORY.md` §6 |
| 提交 / 验证 | `COGNITION_SYNC.md` §8–§9 | `PROJECT_MEMORY.md` §5 |


## 技能库

可复用的 AI 工作流在 [`../skills/`](../skills/)（与本文档同级），按任务选一个：
`ship-code`（提交）、`docs-maintain`（文档）、`verify`（验收）、`ai-service`（AI）、
`deploy`（发布）。技能只写流程，具体契约仍以本目录文档为准。

## 维护约定

- 改代码 / 接口 / 实体后，按 `COGNITION_SYNC.md` §7「改动联动清单」同步本文档目录。
- **改 TypeORM 实体必须同步 `schema.sql`**（生产关闭 `synchronize`，建库依赖它）。
- 推进任务或修完问题后，更新 `PROJECT_MEMORY.md` 的「任务看板」与「修复记录」。
- **重复内容一律用引用，不复制**：例如响应信封只在 `api-contract.md` §0 定义，
  双 token 字段只在 `api-contract.md` §1 定义，其他文档链接过去并只写该场景特有的结论。
- 新增文档前先问：能否并入现有文档的一节？本项目的目标是**少而准**，不是多而全。
- 提交沿用单仓约定：emoji 前缀 Angular 风格中文；`.env*` 不提交。
