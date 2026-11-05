---
name: verify
description: >
  改完代码后的验收流程（anime-chat 无测试框架，靠手动 + 真实环境）。用户说「验证」
  「跑一下」「验收」时使用。核心：类型检查不够——后端要真实启动看 DI/路由，
  UI 要 headless Chrome 量真实节点，鉴权/管理端要跑入库脚本。
---

# 验收流程

先读 `docs/COGNITION_SYNC.md` §8（完整约定），下面是可执行清单。

## 1. 静态检查（每个改动的仓）

```bash
# 前端
cd anime-chat/client && pnpm type-check && pnpm build-only && pnpm lint

# 后端
cd anime-chat/server && pnpm exec tsc --noEmit -p tsconfig.build.json \
  && pnpm run build && pnpm run lint

# AI 服务
cd anime-ai && mvn clean test        # 必须带 clean；不带 clean 会跳过增量编译、掩盖编译失败
```

> 前端不要用 `pnpm build`（pnpm 10 下 `config.commitizen` 会让它失败），用 `type-check && build-only`。

## 2. 后端必须真实启动

`tsc` 查不出 DI 错误和路由缺失：

```bash
cd anime-chat/server && NODE_ENV=development node dist/main.js
# 看到 "Nest application successfully started" + 路由映射才算过
```

## 3. 脚本验收（改了鉴权/管理端必跑）

```bash
cd anime-chat/server
node scripts/auth-e2e.mjs    # 24 项，测试账号自动清理
node scripts/admin-e2e.mjs   # 57 项，连跑 3 次全绿
```

## 4. UI 必须 headless Chrome 实测

类型检查全绿但页面滚不动、暗色主题文字看不清，都发生过：

- 量 `clientHeight` / `scrollHeight`，不要只看截图「差不多」。
- 管理端表格要分别核对暗色 / 亮色主题的 stripe 与文字颜色。
- 图表要采样 canvas 像素，确认颜色跟随主题。
- 验证服务用独立端口，别杀正在跑的 3000 / 8012。

## 5. AI 对话链路

- 改协议/工具/提示词：先 `mvn clean test`，再用**真实 key** 跑完整对话。
- **假 key 只能验链路，验不了行为**（工具往返、答非所问只有真 key 才暴露）。
- 检索改动：`cd anime-ai && python3 eval/run_eval.py`，对比 Hit Rate@10 / MRR。

## 6. 汇报

写明实际执行的命令与结果；未验证的行为明确标注「未验证」，不要用「应该可以」。
