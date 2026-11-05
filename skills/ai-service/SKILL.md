---
name: ai-service
description: >
  改 anime-ai（Java / Spring Boot / LangChain4j）或 AI 对话链路时使用。覆盖服务边界、
  SSE 协议、工具、记忆窗口、话题守卫、RAG 评估与 TMDB 合规。工程总览见 docs/AI.md。
---

# anime-ai 开发

## 边界

- `anime-ai` 只做**检索与模型编排**，不碰用户、房间、播放；会话历史由
  `anime-chat/server` 的 MySQL 持有，本服务**无状态**。
- 网关（鉴权/配额/会话/SSE 转发）在 `anime-chat/server/src/ai/`，不写检索逻辑。
- 完整架构见 `docs/AI.md`；仓级规则见 `anime-ai/AGENTS.md`（工作区同级独立仓）。

## 常用命令

```bash
cd anime-ai
mvn spring-boot:run        # 8013
mvn clean compile          # 必须带 clean
mvn clean test             # 含 TopicScopeGuard 纯函数单测
docker compose -f docker-compose.rag.yml up -d   # Qdrant
```

## 改 SSE：三处同步

1. 本文档对应的 `docs/AI.md` §2.2
2. `anime-ai/src/main/java/com/animeai/chat/SseEvent.java`
3. `anime-chat/client` 的 SSE 解析器（`api/ai.ts` / `stores/modules/ai.ts`）

约束：`data:` 后无空格、单行 JSON、`finally` 必发 `done`/`error` 并 `end()`、
前端忽略未知事件。网关**原样透传**，不要重新拼装事件块。

## 两个高频坑

- **记忆窗口**：一次工具往返占 3 槽（user / ai(toolCall) / toolResult）。
  窗口 = `history.size() + 1 + 2 * MAX_TOOL_ROUNDS`，与 `maxToolCallingRoundTrips` 成对。
  写小了会出现「工具调用后模型重新打招呼」。
- **话题守卫**：fail-open，拒答需要正面证据；拒答走正常 SSE（HTTP 200、
  `finishReason=SCOPE_REJECTED`、`model=null`、token 0），不是 `error`。
  改词表先跑 `TopicScopeGuardTest`，收紧前先想误伤。

## 改检索 / RAG

- 默认策略 `hybrid`（标签混合打分），改默认值必须重跑 `eval/run_eval.py`。
- **不要重犯已否掉的改动**：查询分解 + RRF（75%，更差）、语料去重（MRR 0.8056→0.6974）。
  原因见 `docs/AI.md` §3.6。
- 检索与生成分离：评估只打 `/internal/retrieve`，不烧对话 token。
- 语料源返回 0 条要报错，不要伪装成「幂等跳过」。

## TMDB（系列级知识）

- 分集简介用 TMDB，不用 Bangumi（覆盖率 17% → 100%）。
- 缓存 24h（条款上限六个月），429 退避，Bearer 不走 URL，应用内署名。
- 「简介提到」≠「画面出场」，提示词与工具输出都要说明依据。

## 提交

`anime-ai` 是**独立仓**，在 `anime-ai/` 内单独 commit / push；不要和 anime-chat 混在一起。
