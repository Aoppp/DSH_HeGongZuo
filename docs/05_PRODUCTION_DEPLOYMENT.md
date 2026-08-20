# 和工作生产部署

本说明适用于单台 Ubuntu 22.04 或 24.04 服务器。平台前端由 Nginx 提供静态文件；平台 API、账号专属员工查询服务和 PostgreSQL 均不直接暴露公网。

## 上线前提

- 域名 A 记录已指向服务器公网 IP。
- 防火墙仅放行 22、80、443；4174、3180 起的查询服务端口与 5432 数据库端口仅允许本机访问。
- 安装 Node.js 22、Corepack、Git、PostgreSQL、Nginx 与 Certbot。
- 使用专用普通用户运行服务，不使用 root。

## 首次部署

```bash
git clone git@github.com:Aoppp/DSH_HeGongZuo.git /opt/hegongzuo
cd /opt/hegongzuo
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
```

在 `.env` 中只填写服务器自己的数据库连接与模型服务配置。该文件不得提交 Git。创建 PostgreSQL 数据库和最小权限账号后，仅执行迁移：

生产环境还应设置 `HEGONGZUO_SESSION_COOKIE_SECURE=true`，使浏览器仅通过 HTTPS 发送登录会话 Cookie。

```bash
corepack pnpm db:migrate
corepack pnpm platform:prepare
```

不要在正式环境执行 `db:seed`、`db:setup` 或任何全量导入命令；这些命令可能覆盖员工数据。

## 启用系统服务

复制 `deploy/systemd/hegongzuo.service.template` 至 `/etc/systemd/system/hegongzuo.service`，将 `__DEPLOY_USER__` 和 `__PROJECT_DIR__` 替换为实际值，然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hegongzuo
sudo systemctl status hegongzuo
```

同时复制 `deploy/systemd/hegongzuo-health.service.template`、`deploy/systemd/hegongzuo-health.timer.template` 与 `deploy/systemd/hegongzuo-alert@.service.template` 到 `/etc/systemd/system/`，替换模板变量后启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hegongzuo-health.timer
systemctl list-timers hegongzuo-health.timer
```

主服务模板已包含 CPU、内存、任务数和文件句柄限制。可在 `.env` 中配置 `HEGONGZUO_ALERT_WEBHOOK_URL` 接收故障告警；该值属于运行环境秘密，不得提交。健康检查每分钟分别确认 PostgreSQL、API 和账号运行时可用。

将 `deploy/systemd/journald.conf.d/hegongzuo.conf.template` 复制为 `/etc/systemd/journald.conf.d/hegongzuo.conf` 后重启 journald，可限制服务日志总量、单文件大小和保留时间：

```bash
sudo systemctl restart systemd-journald
```

服务日志：

```bash
journalctl -u hegongzuo -f
```

## 独立 API 与账号运行时服务

完成第一阶段验证后，停止旧的组合服务，改用 `hegongzuo-api.service.template` 与 `hegongzuo-agent@.service.template`。API 与每个账号运行时使用独立 systemd cgroup，单个账号故障不会终止 API 或其他账号。

```bash
sudo systemctl disable --now hegongzuo
sudo systemctl enable --now hegongzuo-api
corepack pnpm dsh:accounts:sync
sudo systemctl enable --now hegongzuo-agent@<账号>.service
```

对 `.runtime/account-agent-runtimes.json` 中每个启用账号执行最后一条命令。新增、删除或停用账号后，先同步运行时配置，再由运维执行对应的启用、停止或禁用命令；API 不直接管理 systemd 单元。

### 迁移验证与回滚

上线前在预发布服务器执行 `corepack pnpm verify:production-services`，并模拟停止 `hegongzuo-api`、任一 `hegongzuo-agent@账号`、PostgreSQL 三种故障，确认健康 timer 失败、告警到达且未受影响单元保持运行。生产迁移后重复该检查。

如迁移失败，停止独立单元并恢复旧组合服务：

```bash
sudo systemctl disable --now hegongzuo-api 'hegongzuo-agent@*.service'
sudo systemctl enable --now hegongzuo
```

## 配置 HTTPS

首次申请证书时先停止 Nginx，使用 standalone 模式签发：

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d example.com
```

然后将 `deploy/nginx/hegongzuo.conf.template` 复制为 `/etc/nginx/conf.d/hegongzuo.conf`，替换其中的 `__DOMAIN__` 与 `__PROJECT_DIR__`，并运行：

```bash
sudo nginx -t
sudo systemctl enable --now nginx
```

Nginx 只代理 `/api/` 到 127.0.0.1:4174。员工查询的 HTTP 与 WebSocket 请求会由平台 API 校验登录会话后转发至当前账号对应的本机服务；不要添加任何将 `/dsh/`、3180 起端口或 PostgreSQL 直接公开的 Nginx 规则。

## 更新步骤

```bash
cd /opt/hegongzuo
git pull --ff-only origin main
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm platform:prepare
sudo systemctl restart hegongzuo
```

更新后依次确认：HTTPS 首页可打开、账号可登录、员工信息可读取、员工查询可建立对话、`/health` 在服务器本机返回成功。数据库应配置独立的每日备份和异地备份保留策略。
