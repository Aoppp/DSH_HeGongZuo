# 服务配置与凭证更换

适用版本：v5.93 起。入口为“平台管理 → 服务配置”，默认折叠，要求 `platform-administration` 权限；服务端也校验权限。会议上传凭证仍由原有独立功能管理。

## 使用步骤

1. 展开服务配置，选择“助手服务”或“日报分析服务”，点击“更换密钥”。
2. 输入新密钥；可先验证连接。“验证并保存”也会重新验证，不依赖前端声称已经验证。
3. 验证失败不更新原配置；保存成功后输入内容被清除，接口不会返回原密钥或密文。
4. 日报后续请求即时读取受管配置，不重启 API，不取消已经发出的生成请求。
5. 助手由后台同步每个账号的实例凭证文件，休眠实例下次启动使用新配置；正在使用的实例暂不打断，页面显示待更新连接数。
6. 必须马上切换时点击“立即生效”，在窗口内确认可能中断当前回复，再重新连接运行中的实例。不会批量启动休眠实例。
7. 等所有实例确认已生效后，再到供应商后台停用旧密钥。平台不会自动撤销供应商的旧密钥。

验证使用既有服务地址的 `GET /models`，只核验认证与连通性，不发送业务资料，不调用文本生成，也不保证账户额度充足。参考：[DeepSeek 模型列表接口](https://api-docs.deepseek.com/api/list-models)。前端不能修改地址，验证不跟随重定向，供应商原始报错不会返回或写入日志。

## 配置优先级与保存位置

- 未在页面保存过：继续使用服务器 `.env` 的 `DEEPSEEK_API_KEY` 或 `HEGONGZUO_DAYLYREPORT_DEEPSEEK_API_KEY`。
- 在页面保存后：优先使用数据库 `platform_service_credentials` 的受管配置，后续手改 `.env` 不覆盖受管值。页面没有“清空配置”或“恢复环境文件”入口，避免误操作。
- 数据库只保存 AES-256-GCM 认证加密后的密文、随机版本、操作人、时间与生效任务状态；密文绑定服务和版本，不能在两项服务间调换。
- 解密主密钥在 `.runtime/platform-secrets/service-credentials.key`，文件权限 0600，目录 0700；正式服务用户为 `hegongzuo`，助手隔离挂载看不到此目录。
- 实例实际使用的供应商密钥仍在 `.runtime/agent-credentials/<runtimeId>.env` 中，由同步器生成、受限读取，不得提交 Git。
- 数据库备份必须与主密钥安全备份配套。丢失主密钥不能靠重新创建空文件恢复；存在密文时程序拒绝自动重建主密钥。
- 配置与审计在同一 SQL 事务提交。审计只记录服务名、操作者及操作类型，不包含密钥、密文、前后密钥或密钥片段。

## 文件边界

- 前端：`apps/web/src/modules/developer/service-configuration/`，作为既有平台管理的子功能接入，无新权限。
- 后端路由和管理：`apps/api/src/modules/platform/service-credentials/`。
- 共享配置读取/加密：`apps/api/src/configuration/service-credentials.ts`；日报分析通过注入的读取函数使用，不直接耦合管理页面。
- 后台应用器：`scripts/apply-service-credentials.mjs`，只执行固定同步脚本，不接受任意命令或路径。
- 实例同步与配置保存共用 PostgreSQL 锁，防止旧同步覆盖新密钥；重新提交生效任务有独立请求版本，旧任务不能覆盖新任务状态。
- 路由、验证和错误处理限制请求大小、同源来源与操作频率；保存前再次核对账号权限。两个管理员同时更换时使用版本冲突保护。

## API

均要求已登录且具有平台管理权限；写操作要求浏览器同源 Origin。所有响应禁止缓存，不返回秘密。

| 方法 / 路径 | 请求 | 结果 |
| --- | --- | --- |
| GET /api/platform/service-credentials | 无 | services：配置状态、更新时间、操作人、版本、待更新连接数 |
| POST /api/platform/service-credentials/:id/verify | key | 验证成功；不保存 |
| POST /api/platform/service-credentials/:id/save | key、revision（首次为 null） | 验证并保存；助手同步为后台任务 |
| POST /api/platform/service-credentials/assistant/apply | revision、interrupt 布尔值 | 重新同步；仅 interrupt=true 且页面确认后重新连接 |

id 仅允许 `assistant` / `daily-report`。401/403 为登录或权限/同源问题，409 为版本冲突，429 为操作频繁，502/503 为连接或应用失败。界面显示“已保存”不等于所有助手进程已切换，必须同时查看生效状态。

## 生产安装与运维

只新增迁移 `040_platform_service_credentials.sql`，部署时单独应用该迁移，不为这个功能重新播放历史 001–039。构建 API 后运行实例同步器才能导入最新共享配置读取实现。

部署时将以下模板中的 `__PROJECT_DIR__` 替换为 `/opt/hegongzuo`、`__DEPLOY_USER__` 替换为 `hegongzuo`，安装到 `/etc/systemd/system/`：

- `hegongzuo-service-credentials.service.template`
- `hegongzuo-service-credentials.path.template`

创建 `.runtime/service-credential-tasks`（所有者 hegongzuo、权限 0700），重新加载 systemd，并启用 service 与 path。service 在启动时检查待处理任务；path 监听 `apply.request`。没有待处理任务时不改凭证、不重启实例。任务失败可在页面重新同步；超过约五分钟仍待处理时显示失败，不假装已经生效。

只读检查：

```sh
systemctl status hegongzuo-service-credentials.path --no-pager
journalctl -u hegongzuo-service-credentials.service -n 50 --no-pager
curl -fsS http://127.0.0.1:4174/health
```

不要输出 `.env`、主密钥、实例凭证或密文用于诊断。若生效任务无法启动，检查 service/path、数据库权限、任务目录所有者以及 `agent-sync.path`；不要把 API 用户改为 root。非 systemd 的本地开发环境可运行 `node scripts/apply-service-credentials.mjs` 消费任务；生产靠 systemd 自动完成。

## 验证

- `apps/api/test/service-credentials.test.mjs`：加密、篡改、权限、同源、错误脱敏、验证失败与动态读取。
- `apps/api/test/service-credentials-database.test.mjs`：显式设置 `HEGONGZUO_TEST_DATABASE=1` 后，在会话临时表中验证 SQL、事务回滚、审计和任务版本；不写正式表。
- `apps/web/test/service-configuration-api.test.mjs`：同源、不缓存、错误处理。
- `apps/web/test/service-configuration.browser.mjs`：构建后启动 4175 端口 preview 再执行；使用隔离 Chrome 配置和假接口，验证完整操作及 390px 窄屏，无真实密钥替换。

此次发布沿用现有真实密钥，未替换供应商凭证。已有 Word 交接文档的业务基线为 v5.91；新增配置管理以本说明为补充，不覆盖正在打开的交接 Word 文件。
