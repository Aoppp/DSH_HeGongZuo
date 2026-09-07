# 项目目录地图

## 顶层目录

| 路径 | 职责 | 是否提交 Git |
| --- | --- | --- |
| `apps/api` | API、认证、业务服务、数据库迁移和同步任务 | 是 |
| `apps/web` | React 前端、路由、页面模块、样式与组件 | 是 |
| `packages` | 可被应用复用的领域模型和运行能力 | 是 |
| `deploy` | Nginx、systemd、日志与健康检查配置模板 | 是 |
| `scripts` | 账号运行空间、健康检查和部署辅助脚本 | 是 |
| `docs` | 当前有效的维护与架构文档 | 是 |
| `data` | 本地导入表格与数据核对文件，可能含个人信息 | 否 |
| `.runtime` | 本地或服务器运行空间、会话与数据库运行数据 | 否 |
| `node_modules`、`dist` | 依赖与构建产物 | 否 |

## 前端：`apps/web/src`

| 路径 | 职责 |
| --- | --- |
| `app/` | 平台壳层、登录态、模块注册表和地址路由 |
| `components/` | 侧边栏、顶栏、分页、加载占位等跨模块组件 |
| `modules/employee/` | 员工档案、组织架构、日报、考勤、合同提醒与员工查询 |
| `modules/meetings/` | 会议记录列表、摘要/原文渲染与导出 |
| `modules/recruitment/` | 岗位、简历筛选、候选与淘汰名单 |
| `modules/management/` | 管理驾驶舱与待开发模块占位 |
| `modules/developer/` | 平台管理、账号、权限、审计与上传凭证 |
| `modules/work-assistant/` | 工作区文件与对话界面 |
| `modules/overview/` | 概览页 |

每个功能目录应优先包含界面、数据访问、状态管理与样式的本地实现；跨模块复用内容才放入 `components/` 或共享包。

## 后端：`apps/api/src`

| 路径 | 职责 |
| --- | --- |
| `server.ts` | HTTP 服务组合入口，注册认证、模块路由和健康检查 |
| `http/` | 请求、响应与认证中间件 |
| `modules/accounts/` | 账号、权限与账号运行空间变更 |
| `modules/agent-runtime/` | 运行空间按需分配与回收 |
| `modules/employee/` | 员工档案、考勤、日报、企业微信同步与审计 |
| `modules/meetings/` | 会议记录接收、查询和上传凭证 |
| `modules/recruitment/` | 招聘岗位、候选状态与筛选规则 |
| `modules/platform/` | 平台管理与审计查询 |
| `modules/work-assistant/` | 工作区文件访问边界 |

`migrations/` 按数字顺序保存不可变的 PostgreSQL 结构和必要数据迁移；`test/` 保存模块化自动化测试；`scripts/` 保存数据导入与同步命令。

## 共享包：`packages`

| 包 | 职责 |
| --- | --- |
| `employee-domain` | 员工领域模型、校验逻辑和虚构测试数据 |
| `employee-agent` | 员工查询的工具、权限与运行配置 |
| `work-assistant` | 工作区文件处理运行能力 |
| `agent-runtime-contract` | 前后端与运行时之间共享的契约 |

## 部署与运维

- `deploy/nginx/`：网站反向代理、静态资源与域名配置模板。
- `deploy/systemd/`：API、账号运行空间、同步、健康检查和告警服务模板。
- `scripts/`：从账号数据生成运行空间、校验服务模板、执行健康检查。

新增模块时，先在对应应用的 `modules/` 中建立独立目录，再通过前端模块注册表、后端权限与部署运行时注册接入；不要把业务实现写入平台壳层或无关模块。
