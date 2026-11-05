# 技能库（skills/）

工作区可复用的 AI 工作流，随主仓一起版本管理，与 [`../docs/`](../docs/) 同级。
旧的 `.claude/` 目录已移除（Claude Code 不再使用），skill 不要放回那里。

| 技能 | 何时用 | 关键约束 |
| --- | --- | --- |
| [`ship-code`](./ship-code/SKILL.md) | 提交代码 / push / 合入前 CR | anime-chat 单仓一次提交；anime-ai 单独提交；`.env*` 不提交 |
| [`docs-maintain`](./docs-maintain/SKILL.md) | 整理文档、更新进度、合并文档 | 同一事实只写一处；进度日期必须更新 |
| [`verify`](./verify/SKILL.md) | 改完代码验收 | 类型检查不够；UI 要真浏览器，后端要真启动 |
| [`ai-service`](./ai-service/SKILL.md) | 改 `anime-ai` / SSE / 工具 / RAG | 无状态；`mvn clean test`；SSE 三处同步 |
| [`deploy`](./deploy/SKILL.md) | 发布 / 回滚 / 生产排错 | 生产关闭 `synchronize`；健康检查失败先回滚 |

## 使用方式

- AI 助手按任务选择技能，**先读 SKILL.md 再动手**；技能只写流程与高频坑，
  具体契约链接到 `../docs/` 对应章节，不复制正文。
- 新增技能：一个目录一个 `SKILL.md`，frontmatter 的 `name` / `description`
  写清「什么时候触发」，正文写「怎么做 + 不要做什么」。
- 技能变更与代码一起提交，commit 用 `📝docs(skills)`。
