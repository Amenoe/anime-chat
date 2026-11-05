---
name: deploy
description: >
  发布 / 回滚 anime-chat 生产环境时使用。生产单机 2C2G（阿里云），systemd + Nginx，
  push main 自动部署。完整手册见 docs/DEPLOYMENT.md，本 skill 只写操作入口与高频坑。
---

# 生产发布

## 环境事实

| 项 | 值 |
| --- | --- |
| 地址 | `http://8.130.120.172` |
| 机器 | 阿里云 2C2G，Alibaba Cloud Linux 3 / glibc 2.32 |
| 代码目录 | `/www/wwwroot/anime-chat`（以服务器实际 `APP_DIR` 为准） |
| 后端服务 | `systemctl status anime-chat-server`（以用户 `anime` 跑 `server/dist/main.js`） |
| Node | 24.22.2，`/usr/local/bin/node` → `/opt/nodejs/v24.22.2` |
| Nginx root | `client/dist` |
| AI 服务 | `anime-ai` 8013，`AI_INTERNAL_TOKEN` 必须与 server 一致 |

> 服务用户 `anime` 进不去 `/root`（权限 700），不要用 nvm `/root` 下的 Node 路径。

## 自动发布（默认）

```bash
git push origin main      # .github/workflows/ci-cd.yml 自动构建 + 部署
```

流程：构建 → `scripts/deploy/deploy.sh` 打包 scp → `remote-deploy.sh` 备份 / 原子切换
`dist` / 依赖变化才 install / 重启 / 健康检查失败回滚。备份在
`/www/wwwroot/.anime-chat-deploy/releases`（保留 5 份）。

## 手工发布

```bash
# 本地构建后
DEPLOY_HOST=8.130.120.172 ./scripts/deploy/deploy.sh
```

## 回滚

```bash
ls -1 /www/wwwroot/.anime-chat-deploy/releases/     # 最新在最下
R=/www/wwwroot/.anime-chat-deploy/releases/<时间戳>-<commit>
# 按 DEPLOYMENT.md §16 替换 dist 并重启
systemctl restart anime-chat-server
```

## 发布后验收

```bash
systemctl is-active anime-chat-server
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health   # 以实际路由为准
journalctl -u anime-chat-server -n 100 --no-pager
```

再打开首页 / 详情 / 放映室，确认静态资源与 API 都通。

## 高频坑

- **改了表结构**：生产关闭 `synchronize`，必须先手工执行 `docs/schema.sql` 的增量 ALTER。
- **依赖变化**：lock 变了才 install；没变不要重装，2C2G 上很慢。
- **Node 版本**：CI 与生产都锁 24.22.2，改一处要改两处。
- **qB / ffmpeg**：BT 播放依赖 `QB_*` 与宿主机绝对路径；2 核机器用 `libx264`、降低码率。
- **回滚要快**：健康检查失败时优先回滚 dist，不要在现场调试。
