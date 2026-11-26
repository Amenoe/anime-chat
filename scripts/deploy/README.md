# 生产部署配置（rainmory.xyz）

这里是从生产服务器同步回来的**运维配置**，用于版本化与灾备重建。
**不包含任何密钥**；`.env`、Cloudflare token 只存在服务器上。

## nginx

| 仓库文件 | 服务器位置 |
| --- | --- |
| `nginx/anime-chat.conf` | `/www/server/panel/vhost/nginx/anime-chat.conf` |
| `nginx/anime-chat-locations.inc` | `/www/server/panel/vhost/nginx/anime-chat-locations.inc` |

- `.inc` 后缀是刻意的：宝塔的 `include /www/server/panel/vhost/nginx/*.conf` 会把 `.conf`
  当站点配置加载，location 文件用 `.conf` 会报 `"location" directive is not allowed here`。
- 证书：`/www/server/panel/vhost/cert/anime-chat/{fullchain.pem,privkey.pem}`
  （阿里云 DV，SAN 含 `rainmory.xyz` / `www.rainmory.xyz`，2027-02-23 到期）。
- 站点：`www.rainmory.xyz` 443 + HTTP/2；裸域 301 到 www；`8.130.120.172` 保留 80 直连排障。
- 反代上游：`bgmapi.rainmory.xyz`（Cloudflare Pages Worker），见下。

改完执行：

```bash
nginx -t && nginx -s reload
```

## Cloudflare Worker（Bangumi / TMDB 反代）

| 仓库文件 | 服务器位置 |
| --- | --- |
| `bangumi-proxy/_worker.js` | `/www/wwwroot/bangumi-proxy-pages/_worker.js` |

- 路由：`bgmapi.rainmory.xyz` → `api.bgm.tv`、`lain.bgm.tv`、`api.themoviedb.org`（`/tmdb/*`）。
- `API_HOST` 只认 `bgmapi.rainmory.xyz`；旧的 `bgmapi-anime.pages.dev` 已返回 404。
- 部署命令（token 在服务器 `/www/wwwroot/.deploy-secrets.env`，**不入库**）：

```bash
set -a; . /www/wwwroot/.deploy-secrets.env; set +a
cd /www/wwwroot/bangumi-proxy-pages
NODE_OPTIONS=--no-network-family-autoselection \
  npx wrangler pages deploy . --project-name=bgmapi-anime --branch=main --commit-dirty=true
```

## 环境文件（不入库）

- `server/.env.production`（NestJS）、`anime-ai/.env`、`/www/wwwroot/.deploy-secrets.env`
  都只存在服务器，禁止提交。
- `client/.env.production` **在仓库里**：只含公开 URL（API 前缀、反代路径），不含密钥，
  且 CI 的前端构建依赖它，**不要删**。
