---
name: docs-maintain
description: >
  维护 anime-chat 的文档体系（唯一入口 anime-chat/docs）。用户说「整理文档」「更新进度」
  「同步文档」「合并文档」时使用。规则：同一事实只写一处，其余用链接引用；
  改接口/实体/任务后按联动清单同步；禁止新建第二份文档地图。
---

# 文档维护（anime-chat/docs）

## 唯一入口

- 文档全部在 `anime-chat/docs/`，工作区根目录只有跨仓 AI 协作说明（`AGENTS.md`）。
- 先读 `docs/README.md` 的「给 AI 的阅读顺序」，按任务进入对应文档，不要通读全部。
- 文档地图只在 `README.md`；其他文档不再重复列表。

## 各文档的权威范围（不要越界写）

| 内容 | 唯一位置 |
| --- | --- |
| 项目概览、进度、看板、修复记录、Git Ship | `PROJECT_MEMORY.md` |
| 跨端契约（响应信封后果、双 token 时序、命名、联动清单、验证/提交） | `COGNITION_SYNC.md` |
| 接口字段、错误码、管理端/AI/埋点契约 | `api-contract.md` |
| 播放链路、qB、HLS、字幕 | `playback-architecture.md` |
| AI 架构、SSE、工具、RAG、规划 | `AI.md` |
| 管理端路线与设计依据 | `admin-roadmap.md` |
| 部署/运维/回滚 | `DEPLOYMENT.md` |
| 表结构 | `schema.sql` |

## 规则

1. **同一事实只写一次**。例如响应信封只在 `api-contract.md` §0 定义，
   `COGNITION_SYNC.md` 只写「跨端后果」并链接过去。
2. 改接口 / 实体 → 按 `COGNITION_SYNC.md` §7 联动清单同步；改实体**必须**同步 `schema.sql`。
3. 推进任务 / 修完问题 → 更新 `PROJECT_MEMORY.md` 的「任务看板」与「修复记录」，
   并把「当前进度」的日期改成最新（不要留旧日期）。
4. 合并文档时：保留结论、决策、验证数字与「为什么」，删掉已过时的方案段落；
   历史过程留在 `PROJECT_MEMORY.md` §4，不复制进其他文档。
5. 面试/个人材料（`ai-interview-pitch.md`）标注为「非工程文档」，AI 助手不必读。

## 校验（改完必跑）

```bash
# 1) 本地 Markdown 链接是否有效
python3 - <<'PY'
import re, pathlib
bad=[]
for p in pathlib.Path('anime-chat/docs').glob('*.md'):
    for m in re.finditer(r'\[[^\]]*\]\(([^)]+)\)', p.read_text()):
        l=m.group(1).strip()
        if l.startswith(('http','#','mailto:')): continue
        t=(p.parent/l.split('#')[0]).resolve()
        if not t.exists(): bad.append((p,l))
print(bad or 'links ok')
PY

# 2) 代码块配对 / 标题结构
grep -c '^```' anime-chat/docs/*.md   # 每个文件应为偶数
```

## 不要做

- 不要新建 `docs/README` 以外的文档地图。
- 不要复制整段契约到另一份文档（会再次漂移）。
- 不要为了「整齐」删除仍有验证价值的负结果与踩坑记录。
