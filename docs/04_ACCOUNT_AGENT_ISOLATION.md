# Agent 账号隔离说明

## 1. 问题原因

修复前，老板和开发者都在平台中嵌入 `http://127.0.0.1:3080`。这意味着两个账号同时共享：

- 同一个浏览器 origin 下的 DSH 前端存储。
- 默认 `~/.dsh` 下的会话、配置和持久化记录。
- 同一个 DSH Web 服务进程。

平台只切换 React 用户状态无法隔离 DSH 自己的会话存储，因此两个账号会看到共享记录。

## 2. 当前修复

当前本地开发环境采用“账号独立 API 路径 + 独立 DSH_HOME + 独立 Workspace”的三层隔离：

| 平台账号 | 平台 API 路径 | DSH 服务 | DSH_HOME | 自动工作区 |
| --- | --- | --- | --- | --- |
| `boss` | `/dsh/boss` | `127.0.0.1:3180` | `.runtime/dsh/boss` | `.runtime/workspaces/boss/employee-agent` |
| `developer` | `/dsh/developer` | `127.0.0.1:3181` | `.runtime/dsh/developer` | `.runtime/workspaces/developer/employee-agent` |

浏览器不再加载两个 DSH Web origin，而是通过“和工作”同源代理连接对应运行时。不同 DSH_HOME 使服务端会话和配置完全分离，不同 Workspace 限制两个账号的文件工作范围。

原来 `~/.dsh` 中的共享记录没有删除，但“和工作”平台不再访问默认 3080 运行时。

## 3. 运行命令

首次或员工 Agent 插件更新后：

```bash
corepack pnpm dsh:accounts:setup
```

每次开发时，在独立终端启动账号 Agent：

```bash
corepack pnpm dsh:accounts
```

验证隔离状态：

```bash
corepack pnpm verify:agent-isolation
```

验证会检查每个账号的 DSH_HOME、端口、API 路径和 Workspace 是否唯一，员工 Agent bundle 是否已安装，工作区是否已经被 DSH 注册，以及专属 DSH 服务是否返回 HTTP 200。

## 4. 防止回归的代码约束

- `.runtime/account-agent-runtimes.json` 由 `dsh:accounts:sync` 从平台账号表自动生成，是账号、端口、平台代理路径和工作区的唯一定义。
- `getAccountAgentRuntime()` 对未配置账号返回 `undefined`，不存在共享 fallback。
- 员工 Agent 插件启动时通过 DSH Workspace Registry 注册后台分配的目录，用户不再选择本地路径。
- 原生 Agent 客户端只使用账号配置对应的平台代理路径，账号登出时组件和连接完全卸载。
- 自动化测试检查账号、端口、API 路径和工作区均唯一，并检查未配置账号不会落入共享运行时。

## 5. 新增账号

1. 在正式账号服务中创建账号；当前本地阶段修改 `apps/web/src/app/accounts.ts`。
2. 在开发控制台的账号管理中新增账号（启用状态），运行 `dsh:accounts:sync` 自动分配唯一端口、代理路径与工作区。
3. 为账号分配 `.runtime/workspaces/<account>/employee-agent` 下的唯一工作区。
4. 执行 `corepack pnpm dsh:accounts:setup` 初始化专属 DSH_HOME 和工作区。
5. 执行 `corepack pnpm verify:agent-isolation` 确认隔离。

## 6. 生产环境路线

“每账号一个本地 DSH 进程”适合当前两个内部测试账号，不是未来大规模部署方案。正式账号增加时，应将会话存储改为服务端强制包含 `tenant_id` 和 `user_id`，由认证中间件决定运行时路由和访问范围。员工业务数据应进入数据库并按公司与权限共享，不能把 Workspace 文件目录当作正式员工数据库。
