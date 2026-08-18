# “和工作”平台模块化原型说明

## 1. 当前产品范围

当前版本不再模拟完整办公平台，而是用最小范围逐步验证“和工作”的核心结构。

当前仅包含四个模块：

| 模块 | 用途 | 可见角色 |
| --- | --- | --- |
| 管理驾驶舱 | 汇总公司经营指标、趋势、异常和 AI 分析 | 老板 |
| 概览 | 展示当前阶段和 Agent 状态 | 老板、开发者 |
| 员工管理 Agent | 使用“和工作”原生界面调用 DSH Agent 运行时 | 老板、开发者 |
| 开发控制台 | 展示模块、DSH 和测试数据信息 | 开发者 |

消息、项目、任务、文档、日历、员工列表和企业管理等非当前必需模块已从平台导航与代码中移除。

## 2. 当前角色边界

平台目前只提供两种内部账号角色：

- 老板：企业所有者，拥有当前已开放业务功能的最高权限。
- 开发者：可使用 Agent，并额外查看开发控制台。

登录页只接收账号和密码，不提供身份选择。`accounts.ts` 根据账号记录返回角色，模块注册表再决定导航和页面可见性。登录后不提供角色切换。

当前账号仅用于本地开发，密码仍存在前端代码中，不具备生产安全性。正式上线前必须由服务端认证返回用户身份，并在 API 端同步执行权限校验。HR、管理者和普通员工尚未加入当前代码。

## 3. Agent 如何集成

员工管理 Agent 不再通过外部链接或 iframe 显示 DSH Web。`EmployeeAgentModule`、`use-employee-agent.ts` 和 `dsh-api-client.ts` 共同提供“和工作”原生会话列表、消息流、输入框、工具状态和错误提示。用户界面不渲染 DSH Web 的 Logo、导航、工作区选择或产品声明。

平台与 DSH 仍是独立运行进程。浏览器只访问平台同源路径，由 Vite 开发代理转发 HTTP 和 WebSocket；每个平台账号绑定不同的 API 路径、DSH_HOME 和工作区：

```text
和工作平台 http://127.0.0.1:4173
       └── 员工管理 Agent 模块
              ├── /dsh/boss → 3180
              │          ├── .runtime/dsh/boss
              │          └── .runtime/workspaces/boss/employee-agent
              └── /dsh/developer → 3181
                         ├── .runtime/dsh/developer
                         └── .runtime/workspaces/developer/employee-agent
```

`config/account-agent-runtimes.json` 是账号运行时和工作区的唯一定义。`dsh:accounts:setup` 创建目录，员工 Agent 插件在 DSH 启动时调用 Workspace Registry 自动注册目录；前端只读取已注册结果，从不接受用户输入的本地路径。未配置专属运行时的账号会看到明确错误，平台不会回退到共享 DSH。

当前代理适用于本地开发。正式部署必须由认证后端根据服务端会话决定租户、用户和 DSH 运行时，不能根据浏览器传来的账号 ID 任意转发。

## 4. 模块化代码结构

```text
apps/web/src/
├── app/
│   ├── App.tsx                 # 只负责组装平台外壳和当前模块
│   ├── accounts.ts            # 本地账号验证与角色映射边界
│   ├── module-registry.ts      # 唯一功能注册表
│   ├── roles.ts                # 角色数据
│   └── types.ts                # 模块与角色类型契约
├── components/                     # 可复用平台外壳组件
│   ├── AccountLogin.tsx
│   ├── BrandMark.tsx
│   ├── Sidebar.tsx
│   └── Topbar.tsx
├── config/
│   ├── account-agent-runtimes.ts # 加载账号 Agent 运行时定义
│   └── runtime.ts              # 按账号解析专属 DSH API 路径
├── modules/
│   ├── management-cockpit/     # 老板驾驶舱、数据和独立样式
│   ├── overview/               # 概览模块和独立样式
│   ├── employee-agent/         # 原生 Agent UI、DSH API 客户端、事件转换和样式
│   └── developer/              # 开发控制台和独立样式
└── styles/
    ├── tokens.css                  # 颜色、尺寸、阴影等设计变量
    ├── base.css                    # 全局基础样式
    └── shell.css                   # 平台外壳样式
```

## 5. 如何增加、删除或修改功能

### 增加功能

1. 在 `src/modules/<module-name>/` 建立组件和局部样式。
2. 在 `ModuleId` 中增加模块 ID。
3. 在 `module-registry.ts` 增加一条注册，配置名称、图标、组件和 `allowedRoles`。

侧边导航和访问过滤会自动读取注册表，不需要在多个页面重复添加入口。

### 删除功能

1. 从 `module-registry.ts` 删除对应注册。
2. 删除对应模块目录。
3. 如果模块 ID 不再使用，从 `ModuleId` 删除。

### 修改模块信息

- 导航名称、描述、图标、标签和允许角色：只修改 `module-registry.ts`。
- 页面内容：只修改对应模块目录。
- 模块局部样式：只修改该模块自己的 CSS。
- 全局品牌颜色和尺寸：修改 `styles/tokens.css`。

## 6. 运行方式

首次先配置账号专属 DSH_HOME：

```bash
corepack pnpm dsh:accounts:setup
```

启动所有账号专属 DSH：

```bash
corepack pnpm dsh:accounts
```

再在另一个终端启动平台：

```bash
corepack pnpm platform:dev
```

访问 `http://127.0.0.1:4173`。如果需要修改账号、专属端口、API 路径或工作区，只修改根目录 `config/account-agent-runtimes.json`，然后重新执行 setup 并重启运行时与平台。
