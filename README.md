# 和工作

“和工作”是一个基于 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 构建的企业智能工作平台。

当前项目已完成 DSH 基础环境、员工领域模型、员工管理 Agent 的 3 个只读工具，以及模块化的“和工作”平台原型。当前平台只面向老板与开发者，包含管理驾驶舱、概览、员工管理 Agent 和开发控制台四个模块。项目不修改 DSH 内核。

## 环境要求

- Node.js `>= 22.19.0`
- Corepack
- pnpm `11.7.0`（由 `packageManager` 自动锁定）

## 启动“和工作”平台原型

```bash
corepack enable
corepack pnpm install
cp .env.example .env
corepack pnpm dsh:accounts:setup
```

`dsh:accounts:setup` 只需在首次启动或员工 Agent 插件更新后执行。它会为每个平台账号创建独立 DSH_HOME。

终端 A 启动账号专属 Agent 运行时：

```bash
corepack pnpm dsh:accounts
```

终端 B 启动平台：

```bash
corepack pnpm platform:dev
```

然后打开 `http://127.0.0.1:4173`，使用以下本地测试账号登录：

| 账号 | 密码 | 系统身份 | 默认入口 |
| --- | --- | --- | --- |
| `boss` | `demo123` | 老板 | 管理驾驶舱 |
| `developer` | `demo123` | 开发者 | 概览 |

系统通过账号记录自动判断身份，登录后不能手动切换角色。当前账号是前端本地测试实现；正式上线前必须替换为服务端认证和权限校验。

员工管理 Agent 已使用“和工作”原生对话界面，不再显示或嵌入 DSH Web 页面。平台通过同源 HTTP/WebSocket 代理连接账号专属 DSH 运行时：老板账号使用 `3180`、`.runtime/dsh/boss` 和 `.runtime/workspaces/boss/employee-agent`，开发者账号使用 `3181`、`.runtime/dsh/developer` 和 `.runtime/workspaces/developer/employee-agent`。工作区在运行时启动时自动注册，用户无需选择文件夹。

需要调用模型时，请在本地 `.env` 中填写 `DEEPSEEK_API_KEY`。`.env` 已被 Git 忽略，禁止提交真实密钥。

## 常用命令

```bash
corepack pnpm verify:env       # 检查 Node.js 与项目版本约束
corepack pnpm build            # 验证根 TypeScript 工程可构建
corepack pnpm typecheck        # 执行严格类型检查
corepack pnpm validate:data    # 校验虚构员工测试数据
corepack pnpm verify:agent-isolation # 验证账号 DSH_HOME、端口与服务
corepack pnpm dsh --help       # 查看 DSH CLI 帮助
corepack pnpm dsh:accounts:setup # 配置每个账号的独立 DSH_HOME
corepack pnpm dsh:accounts     # 同时启动所有账号专属 Agent
corepack pnpm dsh:employee:install # 仅维护旧的默认 web profile
corepack pnpm dsh:web          # 仅启动旧的共享 DSH，平台不再使用
corepack pnpm dsh:dump-config  # 查看 web profile 的最终配置
corepack pnpm platform:dev     # 启动和工作平台开发预览
corepack pnpm platform:preview # 预览已构建的平台页面
```

DSH Web 仅作为底层运行服务和开发调试入口，不再作为“和工作”的用户界面。正式部署时，应在服务端实现与当前 `/dsh/<account>` 等价的认证代理，不能信任浏览器直接提供的账号或运行时地址。

## 文档

- [技术路线](docs/00_TECHNICAL_ROUTE.md)
- [员工管理 Agent 规格](docs/01_EMPLOYEE_AGENT_SPEC.md)
- [平台视觉原型说明](docs/02_PLATFORM_UI.md)
- [管理驾驶舱说明](docs/03_MANAGEMENT_COCKPIT.md)
- [Agent 账号隔离说明](docs/04_ACCOUNT_AGENT_ISOLATION.md)
- [第三方软件声明](THIRD_PARTY_NOTICES.md)
- [开发日志](DEVELOPMENT_LOG.md)

## 员工数据

**正式数据**：`apps/api/scripts/import-employees.mjs` 从 `data/王叔和在职.xlsx` 导入 82 名在职员工的完整档案（任职、身份、联系、教育、财务与备注信息）。默认 dry-run 只解析并输出问题清单 `data/import-issues.md`；加 `--apply` 会**清空 employees 表后全量导入**（`db:seed` 与 `db:setup` 因此是破坏性命令，执行前请确认）。

身份证、银行卡、居住住址与身份证地址在前端默认脱敏展示（点击眼睛图标查看原文）；Agent 工具不返回这些敏感字段。`data/` 目录包含真实个人信息，已加入 Git 忽略，禁止提交仓库。

**测试数据**：`packages/employee-domain/fixtures/employees.mock.json` 提供 10 名完全虚构的员工数据，仅用于 Agent 自动化测试与 `validate:data` 校验，不对应任何真实人员。

## 员工管理 Agent

当前已经实现三个只读 DSH 工具：

- `employee_search`：按关键词、部门、岗位、状态和地点查询员工。
- `employee_get`：按员工 ID 或工号查看员工和直属经理。
- `organization_list_members`：查看一个部门的成员与汇报关系。

首次安装或员工插件代码更新后执行：

```bash
corepack pnpm dsh:accounts:setup
```

然后重启 `corepack pnpm dsh:accounts`。在平台的员工管理 Agent 模块中可以尝试：

```text
请查询技术部有哪些员工，并列出他们的直属经理。
```

这些工具只读取虚构数据，不会修改员工信息。
