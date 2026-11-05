---
name: ship-code
description: >
  AI_Teams 工作区提交流水线：CR → TS 校验 → build → commit → push。
  用户说「提交代码」「提交并 push」「前后端提交」时必须使用。
  仓库：anime-chat 单仓（client/ + server/ + docs/）一次提交；anime-ai 独立仓单独提交；禁止 Claude commit 元数据。
---

# AI_Teams 提交流水线

本文件是本工作区的完整规范；验证细节见 `docs/COGNITION_SYNC.md` §8–§9。
技能库位置：`anime-chat/skills/`（与 `docs/` 同级）。

## 仓库路径

| 仓 | 路径 | lint | type-check | build |
|----|------|------|------------|-------|
| 前端 | `anime-chat/client/` | `pnpm exec lint-staged`（或 `pnpm run eslint` + `pnpm run prettier`） | `pnpm type-check` | `pnpm run build-only` |
| 后端 | `anime-chat/server/` | `pnpm run lint` | `pnpm exec tsc --noEmit -p tsconfig.build.json` | `pnpm run build` |
| AI | `anime-ai/` | — | `mvn clean compile` | `mvn -B package -DskipTests` |

## 顺序

1. `git status` / `git diff` — 排除 `.env`、密钥、用户有意删除项
2. **CR** 阻断项必须先修
3. **eslint / prettier**（前端优先 lint-staged；hook 不可靠时显式跑）
4. type-check（exit 0）
5. build（exit 0）
6. `git add <paths>` → commit（emoji Angular 中文，无 Claude trailer）
7. `git push origin HEAD`
8. 汇报表格 + CR 摘要

## 本地约束

- 不擅自 `git restore` 用户删除的 images 等（见 memory `feedback-no-auto-restore`）
- 前端 `pnpm build` 若因 commitizen 配置失败，用 `type-check` + `build-only`
- **anime-chat 是单仓**：`client/`、`server/`、`docs/` 一条 commit、一次 push；`anime-ai` 单独一条
- 前端 husky：`chmod +x .husky/pre-commit .husky/commit-msg`；lint-staged 只处理暂存文件（`eslint --fix` / `prettier --write`，勿写死整仓 glob）
