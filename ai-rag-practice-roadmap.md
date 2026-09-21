# AI 岗位能力对齐 · 知识库 / RAG / LangChain / Workflow 实践路线

> 状态：路线待确认（2026-09-20）
> 姊妹文档：`ai-chat-tech-stack.md`（AI 对话工具技术栈，本路线在其之上叠加）
> 适用仓库：`anime-chat` / `anime-chat-server` / 新增 `anime-ai`（Python AI 服务）

---

## 0. 前提：目标变了，上一轮结论要改

`ai-chat-tech-stack.md` §4.4 里我给的结论是「**MVP 不引向量库**，走 Bangumi 结构化过滤」。
那条建议的优化目标是**尽快出可用功能、少维护**，在那个前提下是对的。

但你现在说的目标是**对齐 JD、积累 RAG / 知识库 / LangChain / Workflow 的实践**。
优化目标一变，结论必须反过来：

| 维度 | 上一轮（功能优先） | 这一轮（能力优先） |
| --- | --- | --- |
| 向量库 | 不引，Bangumi 过滤够了 | **必须引**，否则没有 RAG 可讲 |
| LangChain | 不引，AI SDK 足够 | **必须引**，JD 点名了 |
| 多跳/Workflow | 单轮工具调用即可 | **必须做**状态机，否则没有 workflow 可讲 |
| 评估 | 能跑就行 | **必须有指标**，否则无法证明优化有效 |

两者不冲突，可以共存：**结构化过滤解决「找番」，RAG 解决「找番之外的问题」**。
下面第 2 节会把这条界线划清楚——这是整份文档最关键的部分。

---

## 1. JD 关键词 → 本项目落点映射

先说个残酷事实：**堆关键词会被问穿**。面试官对「我用 LangChain 做了 RAG」的标准追问是
「为什么用 LangChain 而不是直接调 API？它帮你解决了什么？」答不上来比不写更糟。

所以下表每一行都要有**真实问题 → 选型 → 验证证据**的因果链：

| JD 关键词 | 面试官真正在问 | 本项目落点 | 可交付的证据 |
| --- | --- | --- | --- |
| 知识库构建 | 文档怎么解析、怎么切、怎么更新、语料多大 | 番剧资料 + 章节 + 站内聊天记录 +（进阶）字幕的入库管道 | 入库报告：语料规模、切分策略对比、增量更新机制 |
| RAG 系统开发 | chunk 怎么定、召回率多少、怎么防幻觉 | 台词检索 / 站内记录检索 / 多跳关系检索 | **RAG 优化报告**：不同策略的 Hit Rate@k / MRR 对比表 |
| LangChain | 每个组件解决了什么问题 | Loader / Splitter / VectorStore / Retriever / Reranker / Agent | 组件级设计说明（为什么自研 Splitter、为什么换 Retriever） |
| Workflow / Agent | 多步怎么编排、失败怎么退、人在哪一步 | 「澄清 → 检索 → 推荐 → 确认 → 建房」状态机 | LangGraph 状态图 + 失败分支与重试策略 |
| RAG 评估 | 你怎么知道变好了 | golden set + ragas 指标 | 指标表格 + 消融实验（去掉 rerank 掉多少） |
| 向量库运维 | 选型理由、索引参数、性能 | Qdrant（或 pgvector）+ 索引调参 | 选型对比 + HNSW 参数对召回/延迟的影响 |

---

## 2. 关键判断：哪些 RAG 是真需求，哪些是练手

**这一节决定项目有没有说服力。** 在动漫域无脑套 RAG 会立刻暴露问题：

### ❌ 伪需求（做了会被质疑）

| 场景 | 为什么是伪需求 |
| --- | --- |
| 「2023 年 8 分以上的原创番」→ 向量检索 | Bangumi API 一个结构化查询就出结果。面试官会问「为什么不用 API？」 |
| 「《XXX》的评分是多少」→ RAG | 同上，而且向量检索数字极易出错 |
| 「推荐热门番」→ RAG | 按 `heat` 排序即可，与语义无关 |

### ✅ 真需求（API 查不到，RAG 有不可替代性）

| 场景 | 为什么必须 RAG | 语料 |
| --- | --- | --- |
| **台词定位**：「这季里主角说‘我不想再逃了’是在第几集」 | 台词不在任何结构化 API 里 | 字幕（需自产，见 §4） |
| **模糊回忆**：「想不起名字，主角是红发剑士，结局很虐」 | 需在简介/标签上做语义匹配，关键词匹配失效 | `anime.description` + Bangumi summary |
| **站内记忆**：「我们房上周聊过的那部番叫什么」 | 专有数据，外部无 | `group_message` |
| **多跳关系**：「有哪些作品和《X》是同一个系列构成，且评分 ≥ 8」 | 需 subject → persons → persons/{id}/subjects 跨表跳转 | Bangumi 关联/人员接口 |
| **长文综合**：「把这三部作品的设定差异总结一下」 | 需跨条目检索 + 长上下文综合 | 多条 summary |

> **写法建议**：在项目文档里明确写出「找番走结构化 API，知识库解决 API 覆盖不到的问题」。
> 这句话本身就是加分项——说明你懂得**什么时候不该用 RAG**，这是中级和初级的分水岭。

---

## 3. 架构选择：Python / Java / TypeScript 三选一

> **先纠正一个常见误解**：本项目后端是 **NestJS（TypeScript）**，不是 Python。
> 所以「用 Java 代替 Python」这个说法不准确 —— 无论选 Python 还是 Java，
> 都是**引入第二种语言、第三个运行时**，边际成本一样。真正的问题是：
> **AI 服务用哪种语言写**，而这个答案取决于你要投哪类岗位、以及你已有什么底子。

| | A. Python 服务 | B. Java 服务 | C. LangChain.js 留在 NestJS |
| --- | --- | --- | --- |
| 框架 | FastAPI + LangChain/LangGraph | Spring Boot + Spring AI 2.0.1 / LangChain4j 1.20.0 | NestJS + LangChain.js |
| 对齐 JD | ✅ RAG/知识库/算法岗几乎硬性要求 | ⚠️ 多为「Java 后端 + AI 应用」，AI 是加分项 | ❌ JD 少见 |
| Workflow 编排 | ✅ `langgraph@1.2.11` | ✅ `langgraph4j@1.9.0`（36 模块，含 mysql/redis/postgres checkpointer、studio 可视化、agent-handoff） | ✅ `@langchain/langgraph@1.4.16` |
| **评估（RAGAS 对等）** | ✅ `ragas@0.4.3` | ❌ **无**（LangChain4j 无 evaluation 模块；Spring AI 272 模块亦无）需自研 | ❌ 需自研 |
| 本地中文 embedding | ✅ BGE-M3 / bge-large-zh（`FlagEmbedding`） | ⚠️ 仅 `bge-small-zh`（512 维），无 BGE-M3；要 M3 得走远程 API 或 DJL 自导 ONNX | ❌ 基本只能调 API |
| 本地 reranker | ✅ `bge-reranker-v2-m3` | ⚠️ `langchain4j-onnx-scoring` 有，但要自备 ONNX 模型 | ❌ |
| 文档解析 | ✅ `unstructured@0.27.6` | ✅ **Tika 4.0.0**（企业场景其实最强） | ❌ 弱 |
| 向量库 | ✅ qdrant-client 1.19.1 | ✅ Qdrant client 1.19.0 / Spring AI 原生 starter | ✅ @langchain/qdrant |
| ASR 自产字幕 | ✅ `faster-whisper` 一行装 | ❌ DJL 手搓，性价比低 | ❌ |
| 与现有栈摩擦 | 中（新语言 + 新运行时） | 中（新语言 + 新运行时） | ✅ 最低（同语言同仓） |
| 适合谁 | 无名语言包袱、目标 AI 岗 | **已有 Java 后端经验**、目标传统企业/银行 | 只想快速出东西、暂不求职 |

### 结论

- **有 Java 后端基础 → 选 B（Java）**。复用已有杠杆，且避开从零学 Python；
  LangChain4j 1.20.0 + LangGraph4j 1.9.0 做「知识库 + RAG + Workflow」完全够用，
  文档解析（Tika 4.0）甚至强于 Python。**代价是评估体系要自己写**（对策见 §3.5）。
- **没有 Java 基础 → 选 A（Python）**。学 Java AI 和学 Python AI 投入相当，
  但 Python 更贴目标 JD，且阶段 7 的评估能直接用 ragas，本地模型生态完整。
- **确定目标是 Java 岗位 → 必须同时补 Java 后端深度**（Spring Cloud / 微服务 / JVM），
  只写 LangChain4j 不足以支撑「Java 岗」的面试。

**如果你 Python / Java 都是零基础**，建议先用 C 走完阶段 1–2 建立 RAG 概念
（切分、召回、重排是通用的，语言只是壳），再决定迁 A 还是 B。
**不要**为了「看起来对口」硬上陌生语言然后卡在环境上三周。

### 目标架构

```
anime-chat (Vue)
   │  POST /api/ai/chat  SSE
   ▼
anime-chat-server (NestJS)          ← 鉴权 / 配额 / 会话 / 业务上下文
   │  POST /internal/ai/chat  SSE（内网 + 服务间 token）
   ▼
anime-ai（已选定 Java 路线）
   Spring Boot 4.0.5 + LangChain4j 1.20.0
   ├── Embedding：远程 BGE-M3（主）+ 本地 bge-small-zh（对照/离线）
   ├── Qdrant（向量；M4 加稀疏向量做混合检索）
   ├── MySQL（读 anime / user_anime / group_message）
   ├── Bangumi API（语料同步 + 工具调用）
   └── 离线评估：Python ragas 脚本（旁路，不在请求链路）

   （未选）FastAPI + LangChain/LangGraph ── BGE-M3 + bge-reranker-v2-m3 + ragas
```

NestJS 只做「鉴权 + 配额 + 转发 + 把当前用户上下文带给 AI 服务」，
**不碰检索逻辑**——这条边界要守住，否则又变回单体。

### 3.5 落地计划（2026-09-20 已定：走 Java）

**决策依据**：
- 本机已有 **Java 25.0.4 LTS + Maven 3.9.9**（`/usr/libexec/java_home` 另装 17/21/11）；
- 有 Java 后端经验 → 复用已有杠杆，只需学 AI/RAG 层，不必同时学新语言；
- 暂无明确目标岗位 → 优化目标是「**先做出东西**」，而不是 JD 对齐。

> 这不是死路：RAG 的概念（切分 / 召回 / 重排 / 评估 / 编排）与语言无关，
> 日后若要转 Python 岗，换的是库不是思路，迁移成本主要在 API 语法。

**技术选型**

| 项 | 选择 | 版本 | 说明 |
| --- | --- | --- | --- |
| 宿主 | Spring Boot | **4.0.5** | `langchain4j-spring-boot4-starter:1.20.0-beta30` 编译依赖 Boot **4.0.5**。4.1.1 大概率兼容但非其编译基线，**建议对齐 4.0.5** |
| AI 框架（**已选**） | **LangChain4j** | **1.20.0** + beta **1.20.0-beta30** | 概念与 Python LangChain 近乎 1:1（`EmbeddingStore`/`ContentRetriever`/`RetrievalAugmentor`/`AiServices`），**概念迁移到 Python 最省力**；独有 `bge-small-zh` 本地 embedding 与 `onnx-scoring` 重排 |
| AI 框架（未选） | Spring AI | 2.0.1 | GA、Spring 原生、Advisor 接线短，但需 Boot 4.1.1 且概念不与 LangChain 对应 |
| Workflow | LangGraph4j | **1.9.0** | 有 `langgraph4j-langchain4j` 集成模块；`mysql-saver` 可持久化状态；`studio-springboot` 可视化 |
| 向量库 | Qdrant | client **1.19.0** | 容器写法复用 `docker-compose.playback.yml` |
| 向量库接入 | `langchain4j-qdrant` | 1.20.0-beta30 | ⚠️ beta 线 |
| Embedding | **远程 API**（主）+ 本地 ONNX（对照） | — | Java 无 BGE-M3 本地实现；见 §3.6 |
| 评估 | **Python 旁路脚本** | ragas 0.4.3 | 见下 |

> **版本管理提醒（已核实）**：`langchain4j-bom:1.20.0` 内部用两个属性分别管版本 ——
> `langchain4j.stable.version = 1.20.0`、`langchain4j.beta.version = 1.20.0-beta30`。
> 所以**只需 import 一个 BOM**，GA 与 beta 模块会自动对齐，不必手动逐个 pin。
> 但要知道：**Qdrant 接入、Spring starter、本地 embedding、ONNX 重排、Tika 解析器全在 beta 线上**，
> 只有核心与 `langchain4j-open-ai` 是 GA。API 可能在小版本间变动，升级时留意 changelog。


**关键设计：评估走 Python 旁路，不进服务**

Java 的最大缺口是没有 ragas 对等物（§6 已核实）。但**评估是离线批处理，不在服务链路里**——
所以不需要为此把整个服务改成 Python：

```
golden set (JSON: 问题 + 期望 subject_id)
        │
        ├─→ 调 Java 服务的 /internal/retrieve（只返回检索结果，不生成）
        │        └─ 输出 results.json
        │
        └─→ Python 脚本（约 100 行）：读 results.json → ragas 算
             Hit Rate@k / MRR / Context Precision / Faithfulness → 生成对比报告
```

这样：**服务用 Java（复用你的强项），评估用 Python（补上生态缺口）**，
而且这个「离线评估旁路」本身是标准工程实践，面试时也好讲。

**里程碑（每个都能独立交付）**

| # | 交付 | 技术 | 验收 |
| --- | --- | --- | --- |
| **M1** | 链路打通（不含 RAG） | Boot 4.0.5 + LangChain4j；`POST /internal/ai/chat` SSE；一个 `search_anime` 工具；NestJS 转发 + 配额；前端手写 SSE 消费 | 前端能流式显示回答，工具调用返回番剧卡片 |
| **M2** | 最简 RAG | Qdrant 容器；批量导番剧语料；`search_knowledge` 工具 | 「想不起名字，主角是红发剑士」能召回候选 |
| **M3** | 评估旁路 | golden set 80 条 + Python ragas 脚本 | 产出第一份 Hit Rate@k 基线数字 |
| **M4** | 混合检索 + rerank | BM25（Lucene/Tika）+ 向量 + RRF 融合；`onnx-scoring` 或远程 rerank | 对比 M3 基线，指标提升且报告里有延迟代价 |
| **M5** | 站内语料 + 权限隔离 | 导 `group_message`；按 `group_id` 强制 pre-filter | 「我们房上周聊的那部番」可答，且跨群检索不到 |
| **M6** | LangGraph4j Workflow | 澄清 → 检索 → 推荐 → 确认 → 建房；`interrupt` 等用户确认 | 推荐结果一键开放映室 |

> 建议先做 **M1 → M2 → M3**：到 M3 就有「能演示 + 有数字」的最小闭环，
> 比先把所有功能做完再想评估要好得多。

### 3.6 M2 详细设计：最简 RAG（开工前定稿）

#### ① 先定一个反直觉的结论：M2 **不做** chunking

番剧简介的真实长度是 **50–300 字**（一条 = 一个完整语义单元）。硬切会同时坏事：
- 破坏语义完整性（「主角是……结局……」，切开后两半都不完整）
- top-k 被同一部番的多个碎片占满，**降低结果多样性**

所以 M2 是 **1 条番剧 = 1 个向量点**。

**那 chunking 在哪练？** → M5（放映室聊天记录）与字幕（长文本）。那时才有真实的切分取舍
（按句 / 按时间窗 / 按语义段）。**不要为了「练 RAG」在短文本上硬造 chunking**，那是负收益。

替代练习：**文档表示（document representation）** —— 把结构化字段拼成可检索文本，这一步在真实
RAG 里同样关键，且 M2 可以做成实验：

```
[标题] 命运石之门 / Steins;Gate
[类型] TV
[标签] 科幻、悬疑、时间旅行、galgame 改
[年份] 2011     [评分] 9.3     [排名] #2
[简介] 主人公冈部伦太郎是……
```

字段顺序、是否含英文名、标签权重 —— 这几个模板在 M3 评估里可以直接对比出高低。

#### ② Embedding 选型（Java 无 BGE-M3 本地实现）

**⚠️ 重要前提：DeepSeek 没有 embedding 接口。** 对话用 DeepSeek，向量化必须另找一家。

| 方案 | 维度 | 成本 | 接入方式 | 说明 |
| --- | --- | --- | --- | --- |
| **SiliconFlow BGE-M3**（M2 主选） | 1024 | 低 | OpenAI 兼容 → `langchain4j-open-ai` | 中文强、维度适中 |
| 阿里 `text-embedding-v3` | 1024（可调） | 低 | DashScope | 与阿里云同机延迟低 |
| 智谱 `embedding-3` | 2048 | 低 | 自有 SDK | 维度偏高 |
| **本地 `bge-small-zh-v1.5`**（对照） | 512 | 0 | `langchain4j-embeddings-bge-small-zh-v15-q` | 零成本、无 key、可离线；质量低一档 |

**建议主选 BGE-M3，同时把本地 512 维跑通** —— 这直接构成 M3 的第一个消融实验
（本地 512 vs 远程 1024，差多少分、省多少钱）。

#### ③ Qdrant 集合设计

```
collection: anime_knowledge
  vectors: { size: 1024, distance: Cosine }        # BGE-M3；换本地模型则 512
  payload:
    subject_id    integer    ← 回链到 /detail/:anime_id 的钥匙
    name / name_cn text
    tags          keyword[]  ← pre-filter
    meta_tags     keyword[]  ← TV/WEB/OVA/原创/漫画改…
    year          integer    ← pre-filter
    rating        float      ← pre-filter
    rank          integer
    text          text       ← 拼接后的检索文本（引用溯源用）
    content_hash  keyword    ← 增量导入判重
  payload_index: subject_id, year, rating, tags, content_hash
```

**要点**：`subject_id` 必须进 payload 且建索引 —— 它是「检索结果 → 前端卡片」的唯一桥梁，
也是 M3 评估算 Hit Rate 的比对依据。

#### ④ 语料获取管道

| 步骤 | 做法 |
| --- | --- |
| 数据源 | ① 本地 MySQL `anime` 表（已有 `description`，先看条数与质量）② Bangumi `/v0/subjects?type=2&sort=rank` 分页补拉 |
| M2 规模 | **先 3000 条**（足够做检索实验；embedding 成本约几毛钱，跑得也快） |
| 限流 | Bangumi 需 `User-Agent`，**串行 + 1 req/s**，别并发打 |
| 读取方式 | M2 让 Java 只读直连 MySQL（少一跳）；M5 再考虑收敛成 NestJS 内部接口 |
| 幂等 | `content_hash = md5(拼接文本)`；Qdrant 用 `subject_id` 做 point id，hash 未变则跳过 |
| 增量 | 重跑只 embed 变化的条目；删除的条目要显式清理 |

#### ⑤ 检索接口设计 ← **M2 最关键的一条**

**必须把「检索」和「生成」拆成两个接口。** 否则 M3 的离线评估无法进行：

```
POST /internal/retrieve                       ← 纯检索，不碰 LLM
{ "query": "...", "topK": 10,
  "filters": { "yearFrom": 2015, "minRating": 7.5, "metaTags": ["TV"] } }
→
{ "hits": [ { "subject_id": 123, "score": 0.83, "text": "...", "payload": {...} } ] }
```

- M3 的 Python 脚本**只调这个接口**即可算 Hit Rate@k / MRR，完全不依赖 LLM 生成
- 「生成」走 M1 已建好的 `/internal/ai/chat`，把 retrieve 的结果塞进上下文
- 过滤器走 Qdrant **pre-filter**（不是取回后再过滤 —— 后者会让无权限/不匹配的点占满 top-k）

#### ⑥ M2 验收标准（可测）

1. Qdrant 中 ≥ 3000 条向量，payload 字段与索引齐全
2. `POST /internal/retrieve` 对 10 条手写查询结果合理，例如：
   - 「想不起名字，主角是红发剑士，结局很虐」→ 至少 1 条相关命中
   - 「时间循环 悬疑」→ 《命运石之门》类进 top5
3. **幂等**：重复跑导入不产生重复点
4. **增量**：改一条简介后重跑，只更新该条
5. 记录冷启动耗时与 embedding 实际花费

#### ⑦ M2 明确不做（划界，防止范围蔓延）

- ❌ chunking（留 M5，短文本上做是负收益）
- ❌ 混合检索 / BM25（M4）
- ❌ rerank（M4）
- ❌ 接 LLM 生成（M1 已接，M2 只做检索）
- ❌ 字幕/群聊语料（M5）

---

## 4. 语料盘点（本项目的真实语料）

| 语料 | 来源 | 规模（估） | 获取难度 | 适合练什么 |
| --- | --- | --- | --- | --- |
| 番剧简介 + 标签 | Bangumi `/v0/search/subjects`、`/v0/subjects` 批量拉取；本地已有 `anime.description` | 数千～数万条 | ⭐ 容易 | 切分、embedding、混合检索 |
| 章节标题/简介 | `/v0/episodes`、本地 `anime_ep` | 每部 12–50 条 | ⭐ 容易 | 层级切分（父-子 chunk） |
| 制作人员 / 角色 | `/v0/subjects/{id}/persons`、`/characters` | 每部 10–50 条 | ⭐⭐ | **多跳检索**（人 → 作品） |
| 关联条目 | `/v0/subjects/{id}/subjects` | 每部 5–20 条 | ⭐ 容易 | 图式扩展召回 |
| **字幕（台词）** | ⚠️ **项目里目前没有**，见下方 | 每季 12 集 × 300+ 行 | ⭐⭐⭐ | 自定义 Loader/Splitter、时间轴元数据 |
| **站内聊天记录** | `group_message` 表（`group_id`/`user_id`/`message`/`time`） | 取决于使用量 | ⭐ 已有 | **权限隔离检索**、增量索引、去重 |
| 追番行为 | `user_anime`（wish/watching/done） | 每用户数十条 | ⭐ 已有 | 个性化召回、用户画像 |

### 字幕从哪来（三个选项，按推荐度）

1. **ASR 自产（推荐）**：用 `faster-whisper` 或 阿里 Paraformer 从播放的音频生成字幕。
   完全自给自足、不碰版权，且顺带把 **ASR** 也变成简历技能点。代价：动漫音频有 BGM/日语，
   需要调参，中文需翻译。
2. **播放源自带字幕轨**：HLS 如果是 `EXT-X-MEDIA:TYPE=SUBTITLES`，可从播放链路里抓到。
   最省事，但取决于源，不可控。
3. **公开字幕站**：⚠️ 版权灰区。**只建议本地实验，不要入库、不要对外提供服务。**

> 现实建议：**阶段 1–4 先用「简介 + 章节 + 站内记录」把 RAG 链路和评估体系跑通**，
> 字幕作为阶段 5 的亮点增量。不要一上来就卡在语料获取上——RAG 的能力点在于检索与评估，
> 不在于语料多难搞。

---

## 5. 分阶段路线

每阶段都标注：**语料 → 技术 → 交付功能 → 面试可讲的点**。

### 阶段 0 · 对话 + Tool calling（无 RAG）

- **技术**：DeepSeek + function calling + SSE（见 `ai-chat-tech-stack.md`）
- **交付**：能对话、能调 `search_anime` 返回卡片
- **可讲**：「模型不产生番剧事实，所有条目必须来自工具返回的 `subject_id`」——幻觉抑制思路

### 阶段 1 · Naive RAG：打通链路

- **语料**：番剧简介 + 标签（1 万条量级）
- **技术**：固定长度切分（带 overlap）→ BGE-M3 embedding → Qdrant → top-k 检索 → 拼 prompt
- **交付**：新增 `search_knowledge` 工具（用于「模糊回忆」类问题）
- **可讲**：为什么 chunk 要 overlap、embedding 维度与距离度量（cosine vs dot）怎么选
- ⚠️ **本阶段的检索质量大概率不如 BM25**——这本身就是最好的教学材料，见阶段 2

### 阶段 2 · Hybrid + Rerank + 引用溯源 ← 性价比最高的一步

- **技术**：
  - 稠密（BGE-M3 dense）+ 稀疏（BM25 或 Qdrant sparse vector）**混合召回**，RRF 融合
  - `bge-reranker-v2-m3` 重排 top-50 → top-5
  - 元数据过滤（年份 / 类型 / 评分）作为 **pre-filter**，不靠向量
  - 引用溯源：每个 chunk 带 `subject_id`，前端渲染成可点卡片
- **交付**：检索结果可解释、可点击回到详情页
- **可讲**：**「中文短文本上纯向量召回不如 BM25，混合检索把 Hit Rate@5 从 X 提到 Y」**
  ——有对比数据的候选人和只会调 API 的候选人，差距就在这里

### 阶段 3 · 多跳检索 + 查询改写

- **技术**：query rewriting（把「像《X》那样的」改写成结构化条件）、multi-query 扩展、
  HyDE（可选）、多跳（subject → persons → subjects）
- **交付**：「和《X》同一个系列构成的还有哪些」这类问题可答
- **可讲**：单跳 RAG 的天花板在哪，为什么要多跳；改写带来的召回提升

### 阶段 4 · 站内专有语料 + 权限隔离

- **语料**：`group_message`（放映室聊天）、`user_anime`
- **技术**：增量索引（新消息 → 异步 embed）、去重、**按 `group_id` 强制过滤**（不能跨群检索）
- **交付**：「我们房上周聊的那部番」
- **可讲**：**多租户 RAG 的权限隔离**——这是企业知识库的核心难点，很多 demo 直接忽略
- ⚠️ 坑：群聊噪音大，需要过滤短消息/表情/重复；且要处理消息编辑与撤回的索引一致性

### 阶段 5 · 字幕 RAG + 播放器跳转 ← 简历亮点

- **语料**：字幕（ASR 自产），切分带时间轴元数据 `{anime_id, episode, start_ms, end_ms}`
- **技术**：自定义 Loader（`pysubs2`）+ 自定义 Splitter（按语义句 + 时间窗口）
- **交付**：**「检索台词 → 点击跳到播放对应时间点」**（与现有 Artplayer 联动）
- **可讲**：这是**只有 RAG 能做到**的功能，且能演示。比任何「我搭了个知识库问答」都具体

### 阶段 6 · LangGraph Workflow + Human-in-the-loop

- **技术**：把「意图识别 → 澄清 → 检索 → 推荐 → 用户确认 → 创建放映室」做成状态机
- **关键设计**：条件边（信息不足则反问）、重试与降级（检索失败退化为纯 API）、
  **interrupt**（推荐后停下等用户确认，不自动建房）
- **交付**：推荐 → 一键开放映室（复用现有 `season_id` 建房链路）
- **可讲**：为什么用状态机而不是 while 循环；失败分支怎么设计；人在哪一步介入

### 阶段 7 · 评估体系 ← 区分度最高

- **技术**：构建 golden set（50–100 条「问题 → 期望命中的 `subject_id`/chunk」）+ `ragas@0.4.3`
  + LangSmith 追踪
- **指标**：Hit Rate@k、MRR、Context Precision/Recall、Faithfulness
- **交付**：**《RAG 优化报告》** —— 表格化对比：chunk 256/512/1024、是否 rerank、
  纯向量 vs 混合、不同 embedding 模型
- **可讲**：这是把「我做过」变成「我做好过」的唯一路径

> 顺序建议：**0 → 1 → 2 → 7（先立评估）→ 4 → 6 → 3 → 5**。
> 评估要早做，否则后面所有优化都是拍脑袋。

---

## 6. 技术栈清单（2026-09-20 核实）

### Python 侧（无 Java 基础时推荐）

```
# 服务
fastapi==0.141.1          uvicorn          pydantic
# 编排
langchain==1.4.2          langgraph==1.2.11
langchain-community==0.4.2  langchain-openai==1.6.2   langchain-qdrant==1.1.0
langchain-text-splitters==1.1.2
# 向量库 / 检索
qdrant-client==1.19.1     rank-bm25==0.2.2
# 模型（本地部署）
FlagEmbedding==1.4.2      # BGE-M3（稠密+稀疏+多向量）、bge-reranker-v2-m3
# 文档解析
unstructured==0.27.6      pysubs2==1.9.0        # 字幕解析
# 评估 / 可观测
ragas==0.4.3              langsmith==0.13.0
```

要求 Python ≥ 3.10。Embedding 若不自建，可换 阿里 `text-embedding-v3` / 智谱 `embedding-3`（走 OpenAI 兼容或各自 SDK）。

### JS 侧（低摩擦备选路线）

```
langchain@1.5.11          @langchain/core@1.2.12
@langchain/langgraph@1.4.16   @langchain/qdrant@1.0.3
@langchain/openai@1.5.13      @langchain/community@1.1.29
```

**缺口**：`ragas` 无 JS 版 → 评估指标需自研（Hit Rate / MRR 手写不难，Faithfulness 要调 LLM 当裁判）；
本地 BGE-M3 / reranker 基本只能走 API。

### Java 侧（**本方案已选定**：LangChain4j）

```xml
<!-- 宿主：对齐 langchain4j-spring-boot4-starter 的编译基线 -->
org.springframework.boot:spring-boot-starter-parent:4.0.5

<!-- 一个 BOM 管住 GA + beta 两套版本（stable 1.20.0 / beta 1.20.0-beta30） -->
<dependencyManagement>
  <dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-bom</artifactId>
    <version>1.20.0</version>
    <type>pom</type><scope>import</scope>
  </dependency>
  <dependency>
    <groupId>org.bsc.langgraph4j</groupId>
    <artifactId>langgraph4j-bom</artifactId>
    <version>1.9.0</version>
    <type>pom</type><scope>import</scope>
  </dependency>
</dependencyManagement>

<!-- 核心（GA，1.20.0） -->
dev.langchain4j:langchain4j              <!-- AiServices / ChatMemory / RAG API → 1.20.0 -->
dev.langchain4j:langchain4j-open-ai      <!-- OpenAI 兼容：DeepSeek 对话 + BGE-M3 embedding → 1.20.0 -->

<!-- beta 线（1.20.0-beta30，由 BOM 自动对齐） -->
dev.langchain4j:langchain4j-spring-boot4-starter                    <!-- Spring Boot 4 自动装配 -->
dev.langchain4j:langchain4j-qdrant                                  <!-- 向量库接入 -->
dev.langchain4j:langchain4j-embeddings-bge-small-zh-v15-q           <!-- 本地中文 embedding（512 维，对照用） -->
dev.langchain4j:langchain4j-onnx-scoring                            <!-- 本地 reranker（M4，需自备 ONNX） -->
dev.langchain4j:langchain4j-document-parser-apache-tika             <!-- M5 文档解析 -->
dev.langchain4j:langchain4j-easy-rag                                <!-- 快速原型（可选） -->

<!-- 向量库原生客户端（运维/直连调试用） -->
io.qdrant:client:1.19.0

<!-- 文档解析底层 -->
org.apache.tika:tika-core:4.0.0                     <!-- 企业知识库场景强项 -->

<!-- Workflow（M6，langgraph4j 36 模块节选） -->
org.bsc.langgraph4j:langgraph4j-core:1.9.0
org.bsc.langgraph4j:langgraph4j-langchain4j:1.9.0          <!-- 与 LangChain4j 集成（已选定） -->
org.bsc.langgraph4j:langgraph4j-mysql-saver:1.9.0          <!-- = LangGraph checkpointer -->
org.bsc.langgraph4j:langgraph4j-studio-springboot:1.9.0    <!-- 状态图可视化 -->
org.bsc.langgraph4j:langgraph4j-opentelemetry:1.9.0
```

**Java 基线**：`langchain4j-core` 字节码 major version **61 = Java 17**（本机 Java 25 ✅）。

**缺口（已知并已有对策）**：
1. **无 RAGAS 对等物** —— 已逐个版本探测确认 `langchain4j-evaluation` 在 Maven Central 不存在
   （1.20.0/1.0.0/0.35.0/0.31.0 均 404；`langchain4j-core` 里只搜到 `RetrievalAugmentor`，
   那是检索管线不是评估）；Spring AI 272 个模块也无 evaluation。
   → **对策：Python 旁路脚本**（§3.5），服务保持 Java，评估用 ragas 离线跑。
2. **本地中文 embedding 只有 `bge-small-zh`（512 维）** —— 没有 BGE-M3、没有 bge-large-zh。
   → **对策：主用远程 BGE-M3（1024 维），本地 512 维作为对照与离线 fallback**（§3.6 ②）。
3. **ASR 自产字幕**：DJL 能跑 Whisper，但工程成本远高于 `faster-whisper`。
   → **对策：M2/M5 先用简介与群聊语料；字幕改用播放源自带字幕轨，或直接跳过。**

### 基础设施

- Qdrant 容器：加到 `docker-compose.playback.yml` 同款写法（该项目已有先例）
- 语料同步任务：NestJS 侧无调度模块 → 引入 `@nestjs/schedule`，或放 Python 侧用 APScheduler
- MySQL 已有：存原始语料、会话、配额；**向量不要放 MySQL**（8.0 无原生向量，
  9.0 的 `VECTOR` 类型与驱动生态尚不成熟，不值得为省一个容器冒险）

---

## 7. 面试怎么讲（别堆关键词）

三个必答题，以及应答要点：

**Q1「你这个 RAG 为什么要用 LangChain？」**
> ❌「教程都用它」/「它很方便」
> ✅ 说清哪一层省了事、哪一层反而自己写了：「Loader/Splitter/Retriever 的抽象让我能快速
> 换 embedding 模型和向量库做对比实验；但字幕的时间轴切分 LangChain 没有现成的，
> 我自己实现了 `TextSplitter` 子类。」——**有自研部分才可信**。

**Q2「你怎么知道你的 RAG 效果好？」**
> ✅ 拿出 golden set 和对比表：「同一套 80 条问题，纯向量 Hit Rate@5 = 0.62，
> 加 BM25 混合后 0.78，再加 reranker 0.89。代价是 P99 延迟从 180ms 涨到 640ms。」
> **能说出代价**，说明你真跑过。

**Q3「用户上传的文档，不同部门的权限怎么隔离？」**
> ✅「我在检索前强制注入 `group_id` 过滤条件，而不是检索后再过滤——后者会导致
> top-k 被无权限文档占满，实际可用结果变少。增量更新走 upsert + 内容 hash 去重。」

**反例**：把 JD 关键词原样抄进简历。写了 LangChain 就要能被追问 LCEL、Retriever 接口、
LangGraph 的 state/channel 设计；写了 RAG 就要能被追问切分、召回、重排、评估。
**每写一个词，准备好被追问三层。**

---

## 8. 陷阱清单

1. **为了用 LangChain 而用**：LangChain 在快速试错上强，生产上很多人最后只留 Retriever 抽象。
   要能讲清哪部分留、哪部分换掉。
2. **只有 demo 没有评估**：这是最常见的减分项，也是阶段 7 要提前的原因。
3. **小语料上迷信向量检索**：中文短文本（番剧简介几十字）上 BM25 经常更强。
   先做 baseline 再谈优化。
4. **语料获取本末倒置**：卡在字幕上三周，而 RAG 的核心能力在检索与评估。
5. **忽略权限隔离**：企业知识库的第一需求，demo 最容易漏。
6. **中文分词**：BM25 侧要做中文分词（`jieba`），否则按字切效果差。
7. **时间轴/版本一致性**：字幕与视频版本不匹配会导致跳转错位，要在 metadata 里存源标识。
8. **成本失控**：embedding 全量重跑很贵，要有内容 hash 做增量；检索结果要缓存。
9. **版权**：字幕、番剧简介有版权风险，**本地实验可以，公开部署要谨慎**。

---

## 9. 决策记录

### 已确认（2026-09-20）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 目标岗位 | **暂无明确岗位，先做出东西** → 优化目标从「JD 对齐」转为「最快跑出可演示闭环」 |
| 2 | 语言底子 | **有 Java 后端经验**；本机 Java 25.0.4 LTS + Maven 3.9.9 |
| 3 | AI 服务语言 | **Java**（依据与落地计划见 §3.5） |
| 4 | AI 框架 | **LangChain4j 1.20.0**（概念与 Python LangChain 1:1，迁移最省力；含本地 embedding 与 ONNX 重排） |
| 5 | 评估缺口对策 | **Python 旁路脚本**，不把服务改成 Python（§3.5） |
| 6 | M2 范围 | **已定稿**（§3.6）：不做 chunking、1 条番剧 = 1 向量点、检索与生成拆两个接口 |

> 若日后明确要投互联网 AI 岗，需重新评估是否迁 Python —— 届时迁移的是库 API，
> 不是 RAG 概念，成本可控。§3 的三方对比仍然有效。

### 仍待确认

1. **Embedding 供应商**：M2 主选 SiliconFlow BGE-M3（1024 维，OpenAI 兼容），
   需确认是否接受引入第二家 API key（**DeepSeek 没有 embedding 接口**）。
2. **时间预算**：2 周出 M1+M2，还是 2–3 个月做到 M6？
3. **字幕语料**：Java 侧 ASR 成本高（DJL 手搓）→ 建议 M5 之后再考虑，或改用播放源自带字幕轨。
4. **是否开源部署**：涉及语料版权与 API key 成本。
5. **NestJS 侧 Session 归属**：会话历史存 MySQL（`ai_conversation`/`ai_message`）还是先放前端 localStorage。

