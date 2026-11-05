# AI 系统（对话助手 + 语义检索）

> 这是 AI 能力的**唯一工程入口**。合并了原 `ai-chat-tech-stack.md`（技术栈方案）、
> `ai-rag-practice-roadmap.md`（RAG 路线与实验）、`danmaku-subtitle-rag-plan.md`（台词/弹幕规划）——
> 那三份里的「待确认方案」「已完成的里程碑记录」已被实现取代，删掉以免读错。
>
> - 接口契约（请求/响应字段、错误码）：[`api-contract.md`](./api-contract.md) §4
> - 验证证据与踩坑过程（按日期）：[`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) §4
> - 面试讲法（非工程文档，AI 助手不用读）：[`ai-interview-pitch.md`](./ai-interview-pitch.md)
> - 本仓工作规则：[`anime-ai/AGENTS.md`](../../anime-ai/AGENTS.md)
>
> 状态：对话 MVP、RAG M2、系列级知识、AI 会话审阅均已上线（AI 侧 2026-10-23 收尾）。
> 未做：台词 RAG、弹幕库、M6 Workflow。

---

## 1. 定位与调用链

```
anime-chat (Vue, 8012)
   │  POST /api/ai/chat  (SSE)
   ▼
anime-chat/server (NestJS, 3000)   ← 鉴权 / 配额 / 会话落库 / 埋点 / 转发
   │  POST /internal/ai/chat  (SSE, X-Internal-Token)
   ▼
anime-ai (Spring Boot 4.0.8 + Java 21 + LangChain4j 1.20.0, 8013)
   ├── DeepSeek           对话模型（deepseek-flash）
   ├── Bangumi API        榜单 / 标题检索 / 详情
   ├── Qdrant (6333)      anime_knowledge 向量集合（M2）
   └── TMDB               分集简介（系列级知识）
```

**边界（改代码前先确认没越界）**：

- `anime-ai` 只做**检索与模型编排**，不碰用户、房间、播放等业务数据。
- `anime-chat/server` 只做**鉴权、配额、会话、转发**，不写检索逻辑。
- 会话历史**只有一个权威来源**：server 的 MySQL（`ai_conversation` / `ai_message`）。
  `anime-ai` 每次请求临时构造 `MessageWindowChatMemory`，**不要做成单例 bean**，
  否则会出现「服务重启后模型忘了、界面还显示着历史」。

### 命令

| 动作 | 命令 | 说明 |
| --- | --- | --- |
| 启动 AI 服务 | `mvn spring-boot:run` | 读项目根 `.env`，监听 8013 |
| 编译（必须带 clean） | `mvn clean compile` | 不带 clean 会跳过增量编译，把编译失败伪装成通过 |
| 测试 | `mvn test` | `BangumiClientTest` 打真实 Bangumi，需联网 |
| 启动 Qdrant | `docker compose -f docker-compose.rag.yml up -d` | 集合 `anime_knowledge` |
| 导入语料 | `POST /internal/knowledge/ingest {"source":"bangumi","limit":3000}` | 幂等，按内容 hash 跳过未变项 |
| 纯检索自检 | `POST /internal/retrieve {"query":"时间循环 悬疑","topK":5}` | 不调用 LLM |
| 评估 | `python3 eval/run_eval.py` | 见 `anime-ai/eval/README.md` |

Maven 不在 PATH 时：`export PATH="$PATH:/Users/rain/Java/apache-maven-3.9.9/bin"`。

---

## 2. 当前实现

### 2.1 组件

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 前端 | `client/src/views/ai/Ai.vue`、`stores/modules/ai.ts`、`api/ai.ts` | 手写 `fetch` + `ReadableStream` 消费 SSE（不走 axios）；消息列表、番剧卡片、工具轨迹 |
| 网关 | `server/src/ai/` | `@Res()` 直写 SSE（绕过全局信封）、配额、会话 CRUD、`ai.chat` 埋点、上游不可达 503 并退回配额 |
| AI 服务 | `anime-ai/src/main/java/com/animeai/` | `ChatService`（编排）、`AnimeTools`（5 个工具）、`KnowledgeService`（RAG）、`TopicScopeGuard`、`TmdbClient` / `SeriesKnowledge` |
| 数据 | MySQL（会话/配额/埋点）、Qdrant（向量） | 会话与配额在 server；向量在 Qdrant |

### 2.2 SSE 协议（前后端契约）

事件块以 `\n\n` 结尾，`data` 恒为**单行 JSON**，`data:` 后**没有空格**（前端要兼容 `data:x` 与 `data: x`）。

```
event:text-delta    data:{"text":"..."}
event:tool-call     data:{"name":"browse_anime","args":{...}}
event:tool-result   data:{"name":"browse_anime","failed":false,"subjects":[{"id":…,"nameCn":…}]}
event:usage         data:{"promptTokens":…,"completionTokens":…}
event:error         data:{"message":"..."}
event:done          data:{"conversationId":"...","finishReason":"STOP","model":"deepseek-flash"}
```

- **改事件名/字段要三处同步**：本文件、`anime-ai` 的 `SseEvent`、前端解析器。
- 前端遇到未知事件**忽略而不报错**，新增事件才向后兼容。
- 服务端 `finally` 必须发 `done` 或 `error` 并 `res.end()`，否则前端流永远挂着。
- `X-Conversation-Id` 响应头只在新建会话时由前端读取，否则无法续聊。

### 2.3 工具（5 个）

| 工具 | 数据源 | 用途 |
| --- | --- | --- |
| `browse_anime(year?, month?, sort?)` | `GET /v0/subjects?type=2&sort=rank` | **推荐主力**：榜单浏览（实测质量高：攻壳 9.2、星际牛仔 9.1、命运石之门 8.8） |
| `search_anime(keyword, …)` | `POST /v0/search/subjects` | **只用于用户说出作品名**；`keyword` 必填非空，空串兜底 |
| `search_knowledge(query, topK?, filters?)` | Qdrant `anime_knowledge` | 模糊回忆（「红发剑士 结局很虐」）；两级降级见 §2.6 |
| `series_outline(subjectId, season?)` | TMDB | 「前两季讲了什么」；按季遍历 + token 预算 |
| `find_character_episodes(subjectId, character)` | TMDB | 「某角色第几集出现」；字面匹配译名变体 |

**模型不产生番剧事实**：回复里的番剧必须来自工具返回的 `subject_id`，前端按 id 渲染卡片。
这是从根上消除番名幻觉的设计，不要为了「答得快」绕过。

> ⚠️ `POST /v0/search/subjects` 的 `keyword` 是**标题字面匹配**，不是语义/标签检索。
> 实测 `keyword=科幻` 只命中 4 部标题含「科幻」的条目；`keyword=动画 + tag=[科幻]`
> 的 top 结果里混着「憨豆先生动画版」。**按题材发现必须走 `browse_anime`**，用
> `search_anime` 建语料会让索引严重偏斜。这条实测推翻了早期「结构化过滤够用」的假设，
> 也正是上向量检索的理由。

### 2.4 话题范围守卫（`TopicScopeGuard`）

在**调用模型之前**判定本轮输入是否动漫话题，越界直接回绝，0 token。

- **fail-open**：拒答需要正面证据（命中越界词**且**无动漫信号），放行不需要。
  误伤正常提问（用户直接走掉）远比漏放一次跑题严重 —— 这是刻意的，不是没调好。
- 只看**本轮输入**，不看 history（否则任何跑题都能靠上一轮混过去）。
- 不做按长度豁免（短句也可能明确越界）。
- 拒答走**正常 SSE**：HTTP 200、`event:text-delta` 一条完整文案、
  `finishReason=SCOPE_REJECTED`、`model=null`、token 全 0。**不是 `error`**，
  因此看板错误率不会被污染。
- 与系统提示词**分层**：守卫保守漏掉的（如「翻译一下命运石之门」）由提示词礼貌拒答。
- 纯静态类、无 Spring 依赖；改词表先跑 `TopicScopeGuardTest`（71 项，不联网）。

### 2.5 配额与成本

DeepSeek 按 token 计费，**限额是硬需求**：

| 闸门 | 机制 | 默认值 |
| --- | --- | --- |
| 单次上限 | `maxOutputTokens` + `maxToolRounds` | 2048 tokens / 5 轮 |
| 每日配额 | `ai_usage` 按 `(user_id, 本地日期)` 原子自增 | 50 次/天/人（`AI_DAILY_QUOTA`） |
| 突发限流 | `@nestjs/throttler`（可加） | 5 次/分钟 |
| 单次总时限 | SSE 总时限 | 60s（emitter 120s 留余量） |

- **请求开始前就 +1**：中途断开也扣，否则断开重连可绕过配额。唯一例外是上游不可达时退回。
- 并发下可能略超扣，是**故意 fail-closed**：宁可少给几次。
- 成本量级：`deepseek-flash` 一轮约 ¥0.006（低峰、无缓存），`v4-pro` 约 4 倍。
  embedding 极便宜（3000 条约 ¥0.4），**真正贵的是对话模型**，所以配额必须一开始就做。

### 2.6 网关（NestJS）要点

- SSE 用 `@Res()` 直写，**不能用 `@Sse()`**（全局 `TransformInterceptor` 会包信封）。
- 转发**原样透传**上游事件块（仅统一换行后按 `\n\n` 分块）；曾重新拼装成 `event: ${name}`，
  导致同一协议出现两种线格式。
- 配额/上游错误必须发生在**写 SSE 头之前**，否则拿不到真实状态码（429 / 503）。
- `search_knowledge` 有**两级降级**：kill switch（`ai.retrieval.enabled=false`）+ 异常兜底，
  Qdrant 抖动不再让对话 500。检索策略/开关走配置 `ai.retrieval.strategy|enabled`。
- 工具失败时**不要**把原始异常塞回模型（模型看不懂 nginx 500 HTML 会反复重试）：
  `ToolExecutionErrorHandler` 返回可照做的中文提示（说清坏了、要求停止重试、禁止编造）。
- 未登录不渲染对话区、不发任何 `/api/ai/*`；ai store 登出必须 `reset()`
  （单例 store 会把上一个人的会话展示给下一个人）。

---

## 3. RAG（M2，已验收）

### 3.1 语料与切分

- 语料：Bangumi 排名前 **3000** 部动画（可从 Bangumi 分页拉，或读本地 `anime` 表）。
- **1 部番 = 1 个向量点，不做 chunking**：简介只有 50–300 字，本身是完整语义单元；
  硬切会打散语义，且 top-k 被同一部番的碎片占满、降低多样性。
- 文档表示：`[标题][类型][标签][年份][评分][排名][简介]` 拼接成检索文本。
  字段顺序/是否含英文名/标签权重都是可调的实验变量。
- 增量：`content_hash = md5(拼接文本)`，point id = `subject_id`；hash 未变跳过，
  重复导入返回 `upserted=0`（幂等）。删除的条目要显式清理。

### 3.2 Embedding 与 Qdrant 集合

- **DeepSeek 没有 embedding 接口**，向量化用第二家：SiliconFlow **BGE-M3**，**1024 维**，Cosine。
- 集合 `anime_knowledge`；payload：`subject_id`（回链前端 + 评估比对）、`name/name_cn`、
  `tags[]`、`meta_tags[]`、`year`、`rating`、`rank`、`text`、`content_hash`。
- `subject_id` 必须建 payload 索引 —— 它是「检索结果 → 前端卡片」的唯一桥梁。
- 过滤器走 Qdrant **pre-filter**（`yearFrom` / `minRating` / `metaTags`），不是召回后再过滤。

### 3.3 检索与生成拆成两个接口

这是评估能成立的前提：

```
POST /internal/retrieve   ← 纯检索，不碰 LLM
{ "query": "...", "topK": 10, "filters": {...} }
→ { "hits": [ { "subject_id": 123, "score": 0.83, "text": "...", "payload": {...} } ] }

POST /internal/ai/chat    ← 检索结果塞进上下文后生成
```

如果糅在一个接口里，就永远说不清「答得不好」是检索没找到还是模型不会用。
M3 的评估脚本**只调 `/internal/retrieve`**，不烧对话 token、不受生成质量干扰、可复现。

### 3.4 检索策略与对照实验（2026-10-22）

`--strategy` 是请求参数，同一份语料可一次跑完对比：

| 策略 | Hit Rate@10 | MRR | 说明 |
| --- | --- | --- | --- |
| `vector`（原状） | 91.7% | 0.6285 | 纯向量 |
| **`hybrid`（默认）** | **100%** | **0.8056** | 多召回 3 倍候选，查询词命中 `name/tags/meta_tags` 加分重排（上限 0.08） |
| `rrf` | 75.0% ↓ | 0.5397 ↓ | 查询分解 + RRF，被数据否掉 |
| `hybrid-rrf` | 100% | 0.7341 | 不如纯 hybrid |

`hybrid` 把唯一的真失败 C2「催泪 家族 治愈」从**未命中 → rank 1**。

### 3.5 评估

- golden set **12 条 / 4 类**（作品名、概念/剧情、题材组合、同义桥接）。
  分类是因为平均值会掩盖问题：作品名查询几乎就是查表，会把总分拉高。
- 指标：**Hit Rate@10**（找没找到）+ **MRR**（排得够不够靠前）；台词场景才需要时间点误差。
- 脚本在 `anime-ai/eval/`：`run_eval.py`（检索）、`verify_ingest.py`（幂等/增量）、
  `check_tool_routing.py`（对话级工具路由）。数字与复现命令见 `anime-ai/eval/README.md`。
- 冷启动 3000 条（含 Bangumi 分页限速 1 req/s）实测 **3 分 42 秒**。

### 3.6 三个反直觉结论（比正结果更值得记）

1. **查询分解 + RRF 比不做还差**（91.7% → 75%）。「多词查询被强特征词主导」的诊断是对的，
   但 RRF 给每个子查询同等投票权，低质量那一路（「家族」的 top10 全是家族题材噪音）
   反而污染了融合结果。**诊断对，药方错。**
2. **语料「去噪」让 MRR 下降**（0.8056 → 0.6974）。去掉 tags 里 9.4% 的年份噪声、
   给 6.1% 重复的 `meta_tags` 去重，看起来是修数据质量，实测更差 ——
   **重复其实意外起了词权重加倍的作用**。已回滚（Qdrant 快照恢复，未重新 embedding）。
   → **「看起来是 bug 的数据特征」不一定该修，它可能在补偿别处的不足。**
3. **尺子本身错过**：第一版 golden set 每条只写一个期望 id，「时间循环 悬疑」实际 rank=1
   命中《古诺希亚》（确凿的时间循环题材），却被判失败；修正后基线 66.7% → 91.7%。
   反向也要防：把 `expect` 扩到 top10 全算对就等于自证，边缘相关的不收。
   → **先校准尺子，再量东西。**

---

## 4. 系列级知识（TMDB）

回答「第一季讲了什么」「某角色第几集出现」用 **TMDB 分集简介**，不是 Bangumi，也不是 RAG。

- **为什么换数据源**：Bangumi `episodes.desc` 覆盖率 **17%**（《无职转生》第一季 0%），
  TMDB 同作品 S1 23/23、S2 24/24，且中文、带角色名。
- **为什么不用向量检索**：这是「按季遍历 + 按集匹配」的结构化查询；角色名只要字面命中，
  用 RAG 既多花 embedding 又答不准（「艾莉丝」与「爱丽丝」并存，同音字表更准）。
- **译名变体必须处理**：同一季里两种译名并存，不处理会漏集。
- **TMDB 合规**：缓存 **24h TTL**（条款上限六个月，**别改成永久缓存**）、429 退避、
  Bearer 不走 URL、应用内保留署名。
- ⚠️ **「简介提到」≠「画面出场」**：工具输出与提示词都要求说明依据，不要断言只在这些集出场；
  一集都没匹配到时如实说「简介可能没写」。
- `series_outline` 有 **6000 字预算**与 `season` 参数；有人抱怨「信息不全」时先看是不是撞预算。

---

## 5. 关键决策与坑（速查）

| 决策/坑 | 结论 | 详情 |
| --- | --- | --- |
| 无状态服务 | 记忆由 server MySQL 持有，按请求构造，不做单例 | `anime-ai/AGENTS.md` |
| 记忆窗口 | 工具往返占 3 槽；窗口 = `history + 1 + 2 * MAX_TOOL_ROUNDS` | `PROJECT_MEMORY.md` §4（2026-09-21） |
| Jackson 2/3 并存 | 自有序列化走 `support/Json.MAPPER`（Jackson 2），不注入 `ObjectMapper` | `anime-ai/AGENTS.md` |
| SSE 线格式 | 原样透传，不重新拼装 | `PROJECT_MEMORY.md` §4（2026-09-21） |
| 内部令牌 | 拦截器罩住 `/internal/**`，新增端点默认安全 | `PROJECT_MEMORY.md` §4（2026-10-14） |
| 工具错误处理 | 返回可执行的中文提示，禁止模型重试/编造 | `PROJECT_MEMORY.md` §4（2026-10-23） |
| 语料源 0 条 | 报 400，不要伪装成「幂等跳过」 | `PROJECT_MEMORY.md` §4（2026-10-14） |
| 前端卡片 | 默认只展示 6 张 + 展开；不改工具返回条数 | `PROJECT_MEMORY.md` §4（2026-09-21） |
| Spring Boot 4 配置 | `server.error.*` → `spring.web.error.*`，旧名静默不生效 | `PROJECT_MEMORY.md` §4（2026-10-14） |

---

## 6. 规划与下一步

### 已取消 / 已调整

- ~~M5 站内语料 + 权限隔离~~（2026-10-23 决定不做）。
- ~~台词 RAG 优先~~：TMDB 分集简介已能回答「前两季讲什么」「角色第几集出现」，
  台词 RAG 下调为「只在需要秒级定位时才做」。
- M6 LangGraph4j Workflow（澄清 → 检索 → 推荐 → 确认 → 建房）**未开始**。

### 下一步（按性价比）

1. **显式重复 `meta_tags` 做 term weighting** —— 负结果② 直接指向的方向，
   改一行 + 重导约 3.7 分钟，看能否超过 MRR 0.8056。
2. 扩充 golden set（现 12 条，C2/S1 单点样本对结论影响偏大）。
3. 台词 RAG（仅当确需「第几集第几秒」）：用户上传字幕 → 语义切分（句号/1.5s 静默，
   15–80 字）→ BM25 + 向量 + RRF → `search_subtitles`，元数据带
   `(subject_id, episode, start_ms, end_ms)`；字幕原文不进 MySQL。
   注意：番剧检索上 RRF 失败，是因为子查询质量不均；台词场景 BM25 与向量是**正交召回源**，
   才是 RRF 的本意场景。数据来源只做用户上传（版权）。
4. 弹幕库（先统计、不做检索）：密度曲线 / 高频词 / 情绪曲线；时间轴只做相对进度，
   避免片源错位。语义检索前先量化「有效弹幕」占比。

---

## 7. 改动指南

- 改 **SSE 事件/字段**：本文件 §2.2 + `anime-ai/SseEvent` + `client` 解析器 + `api-contract.md` §4。
- 改 **工具**：`anime-ai` 的 `AnimeTools` + 系统提示词；先跑 `BangumiClientTest` 确认真实接口行为；
  工具返回值要裁剪（`id/name/name_cn/cover/rating/rank/date/tags/summary`），否则打爆上下文。
- 改 **检索**：`KnowledgeService` / `QdrantClient`；策略默认 `hybrid`，改默认值要重跑 `run_eval.py`。
- 改 **配额/会话**：`server/src/ai/`；错误必须在写 SSE 头之前。
- 改 **守卫**：`TopicScopeGuard` + 单测；保持 fail-open，收紧前先想误伤。
- 所有 AI 相关改动完成后：`mvn clean test`（anime-ai）+ server 的
  `tsc --noEmit && pnpm run build` + 前端 `type-check && build-only`；
  涉及对话链路时用真实 key 跑一遍（假 key 只能验链路，验不了行为）。
