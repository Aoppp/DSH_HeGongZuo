# 和工作平台｜开发与运维交接文档

面向继任开发、运维和业务负责人

交接基准日期：2026 年 9 月 16 日（北京时间）

业务代码基线：v5.91 / b90f7f5；本文档不代表另一次业务功能发布。

保密级别：内部。本文不包含密码、API Key、数据库连接串或真实员工个人档案；凭证应通过公司认可的秘密管理渠道交接。

## 1. 交接摘要与阅读指南

### 1.1 这个项目是什么

“和工作”是公司内部办公管理平台，将员工档案、组织架构、企业微信日报、考勤与请假、会议记录、招聘筛选、站内通知和平台管理集中到同一网站。部分场景使用大模型或对话式工具，但员工状态、权限、考勤统计、数据同步等关键规则由业务代码和数据库控制，不交给模型自行决定。

项目已经投入实际使用，不是只有演示数据的原型。开发时首先考虑保留既有数据与操作习惯，其次才是界面整理和技术重构。员工档案、平台登录账号、企业微信成员是三个不同概念，不能把它们的数量或 ID 当成一回事。

### 1.2 第一时间需要知道的事实

- 正式网站：https://hgzuo.com；当前部署目录：新服务器 `/opt/hegongzuo`。
- 当前正式公网 IP：`8.148.78.89`；私网 IP：`172.18.63.147`。旧香港服务器 `8.217.247.94` 不是后续默认发布目标。
- 代码仓库：`git@github.com:Aoppp/DSH_HeGongZuo.git`。Git 只能恢复代码，不能恢复数据库、上传文件、会话或企业微信授权状态。
- 前端是 React + TypeScript + Vite；后端是 Node.js 原生 HTTP + PostgreSQL，不是 Express / NestJS，也没有 ORM。
- 当前注册的对话能力为 `main-assistant`（和工作助手）与 `employee-query`（员工查询）。`work-assistant` 包仍被复用，但已不是独立的导航模块或注册实例。
- 日报当前由 `wecom-cli` 读取企业微信智能表格；考勤、排班和请假由企业微信接口同步。不能仅凭“企业微信日报”这个业务名称，假设使用了某个原生日报 Open API。
- 正式环境采用 API 与各账号运行实例独立的 systemd 服务，并按需启动对话实例。休眠实例不等于故障。
- 本文已核对仓库实现和服务器只读状态；没有在编写文档时重新进行所有业务场景的端到端验收。

### 1.3 建议阅读顺序

| 接手角色 | 优先阅读 | 要达到的结果 |
| --- | --- | --- |
| 全栈开发 | 第 2–9、13–15 章 | 能定位模块、理解数据与权限、完成一次小改动 |
| 运维或部署负责人 | 第 3、10–12、16–17 章 | 能查健康状态、识别任务失败、安全发布与恢复 |
| HR 或业务负责人 | 第 4、6、7、16 章 | 能确认统计口径、知道哪些能力已实现 |
| 新接手项目负责人 | 第 1、4、16–18 章 | 明确责任人、遗留风险和下一阶段优先级 |

章节中的“已实现”指存在对应业务实现；“本次核对”指 2026-09-16 的读代码或只读线上检查；“建议”不是已完成事项。历史聊天、旧需求或旧文档与代码不一致时，应先确认业务意图，不能默默恢复旧行为。

## 2. 总体架构与技术选型

### 2.1 请求与数据流

```text
浏览器（React 单页应用）
  └─ HTTPS / Nginx
      ├─ 静态资源 → apps/web/dist
      └─ /api/* → Node API（127.0.0.1:4174）
          ├─ 登录、权限、校验、业务服务 → PostgreSQL
          ├─ 对话代理 → 当前账号 + 当前能力的独立运行实例
          │   ├─ 当前账号文件工作区 / 会话
          │   └─ 受控员工只读接口 → 再次检查账号权限
          └─ 日报汇总服务 → DeepSeek → 汇总快照入库

systemd 定时任务
  ├─ 企业微信智能表格 → 日报表 / 同步日志
  ├─ 企业微信通讯录、打卡、排班、审批 → 本地业务表
  ├─ 站内通知 → 指定平台账号的通知记录
  └─ 健康检查 / 实例协调 / 故障告警
```

业务页面主要读取本地 PostgreSQL 中已经同步的数据，不是每次打开页面都实时请求企业微信。手动同步是触发服务器任务，再刷新同步状态和页面数据，并不代表瞬间拿到源系统最新结果。

### 2.2 技术栈与用途

| 层次 | 当前技术 | 维护重点 |
| --- | --- | --- |
| 工作区与构建 | pnpm workspace、ES modules、TypeScript | 按锁文件安装，先构建被引用的 packages |
| 前端 | React 18、Vite 8、TypeScript | 模块注册、状态隔离、请求竞态、长列表与 Markdown 渲染 |
| UI 工具 | lucide-react、共享 Skeleton、Pagination | 复用组件；不重复实现分页或加载占位 |
| 文档与表格 | ExcelJS、docx；PDF / DOCX 文本提取库 | 区分下载、文本解析和原始文件保存三个环节 |
| API | Node.js 原生 HTTP、pg | 手工路由、参数校验、模块权限与 SQL 事务 |
| 数据库 | PostgreSQL、编号 SQL 迁移 | 员工、账号、同步数据、审计、会议、招聘等分表 |
| 对话能力 | DSH / Cordis 插件与适配层 | 固定依赖版本，防止框架协议升级影响会话与隔离 |
| 汇总模型 | 独立 DeepSeek HTTP 调用 | 完整输入、分批处理、超时、并发限制与来源引用 |
| 部署 | Ubuntu、Nginx、systemd | API / 实例隔离、资源上限、日志、定时任务、证书 |

准确依赖版本以 `pnpm-lock.yaml` 为准；不要因为本文列了主版本就升级依赖。根包和子包中的 `version: 0.0.0` 不是业务发布版本；当前发布版本记录在 Git 提交信息中。

### 2.3 设计思想

- 数据真实来源明确：员工部门以员工档案为准；排班和请假来自企业微信；不以页面展示名称作为数据库关联键。
- 模块拥有自己的界面、数据访问、状态和规则；公共层只负责通用能力。
- 前端权限负责显示入口，服务端权限负责阻止访问。二者缺一不可。
- 所有重要统计都应能解释：统计日期、人员范围、排班、请假、离职和排除规则。
- 对话输出不能直接成为员工考核或招聘决定；保留来源与人工确认。
- 失败应可观察、可重试：同步日志、初始化状态、运行实例健康和审计分别负责不同问题。
- 不以删除会话、清空缓存或重启全部服务作为会话异常的默认处理方式。

## 3. 项目目录与关键文件导航

### 3.1 顶层结构

```text
apps/
  api/                  后端源代码、测试、SQL 迁移、数据库脚本
  web/                  前端页面、模块、共享组件、前端测试
packages/
  employee-domain/      员工类型、校验与公共计算规则
  employee-agent/       员工只读查询工具与对话插件
  agent-runtime-contract/  运行实例身份和就绪状态契约
  work-assistant/       复用的文件处理与会话底层能力
  main-assistant/       当前统一助手插件及注册清单
scripts/                构建辅助、运行空间同步、隔离与健康检查
deploy/
  nginx/                Nginx 配置与模板
  systemd/              服务、定时器、path 单元及日志模板
docs/                   技术说明；handover/ 为本交接文档可编辑源
DEVELOPMENT_LOG.md       开发日志，按时间升序追加
AGENTS.md               当前执行约束与发布要求
和工作平台设计规范.md     当前 UI 规范
.env                    本地/服务器各自维护的配置，不应提交
.runtime/               本机运行配置、实例工作区、会话等，不应提交
```

`packages` 是同一仓库内可复用的源码包，不是数据库或上传文件目录。修改包后，依赖它的 API、插件或前端可能需要重新构建。`.runtime` 和业务数据库属于运行数据，不能当“垃圾目录”删除。

### 3.2 修改需求时从哪里开始

| 需求 | 首先查看的文件或目录 |
| --- | --- |
| 导航、路由、模块可见性 | `apps/web/src/app/module-registry.ts`、同目录 `module-routes.ts` |
| 侧边栏与通用加载、分页 | `apps/web/src/components/Sidebar.tsx`、`Skeleton.tsx`、`Pagination.tsx` |
| 员工新增、编辑与离职 | `apps/web/src/modules/employee/data/`；API `modules/employee/employee-write-service.ts` |
| Excel 单行粘贴 | 前端 `employee-paste-parser.ts`；API `employee-input.ts`；`packages/employee-domain` |
| 日报列表与汇总界面 | `apps/web/src/modules/employee/reports/` |
| 日报查询、统计与同步 | `apps/api/src/modules/employee/work-reports/` |
| 日报模型调用、分批与保存快照 | `apps/api/src/modules/employee/report-analysis/` |
| 考勤、排班、请假 | `apps/api/src/modules/employee/attendance/`；前端 `modules/employee/attendance/` |
| 会议管理 | 前后端各自的 `modules/meetings/` |
| 招聘管理 | 前后端各自的 `modules/recruitment/` |
| 平台管理、通知、审计 | API `modules/platform/`；前端平台管理模块及账号编辑界面 |
| 对话窗口、历史与文件区 | `apps/web/src/modules/main-assistant/`、员工查询模块及 `shared/dsh/client.ts` |
| 助手工具与提示词 | `packages/main-assistant/src/index.ts`、`packages/employee-agent/src/index.ts`；文件能力见 `packages/work-assistant/` |
| API 路由与组装 | `apps/api/src/server.ts`；这里仍有大量手写路由，不应继续堆积业务规则 |
| 账号运行实例生命周期 | API `modules/accounts/`、`modules/agent-runtime/` 与根目录 `scripts/` |

历史说明中可能仍出现已移除的“工作助理”独立页面、旧服务器或旧目录。此次交接不恢复或重写这些历史文件；应以当前注册表、实际路由和生效的服务器配置核对。

## 4. 模块现状与完成边界

### 4.1 页面、权限与成熟度

| 页面 / 路径 | 权限标识 | 当前状态与边界 |
| --- | --- | --- |
| 概览 `/overview` | 基础入口 | 已有页面；本地存在未提交改动，不能视为线上版本 |
| 管理驾驶舱 `/management` | management-cockpit | 已读取真实日报、考勤等数据；目前另有 position=CEO 的限制 |
| 和工作助手 `/assistant` | 基础能力 | 文件处理、会话与受控员工查询；不是完整的多子助手调度系统 |
| 员工维护 `/employee/data` | employee-data | 在职/离职、编辑、简历、Excel、组织架构、合同提醒 |
| 员工查询 `/employee/query` | employee-query | 只读查询工具；独立运行实例与会话 |
| 考勤 `/employee/attendance` | employee-attendance | 日/月统计、异常、个人历史、排班与请假联动 |
| 日报 `/employee/daily-reports` | employee-reports | 列表、提交看板、历史日报、排除名单、质量检查、汇总 |
| 招聘 `/recruitment` | recruitment-management | 岗位、简历、三档规则筛选、候选、淘汰与恢复 |
| 会议 `/meetings` | meeting-records | 外部上传、检索、摘要/原文、摘要编辑、Word 导出 |
| 财务 `/finance` | finance-management | 待开发入口，不是完整财务系统 |
| 项目 `/projects` | project-management | 待开发入口，不是完整项目管理系统 |
| 平台管理 `/developer` | platform-administration | 账号权限、模块启停、审计、通知设置、上传凭证、同步状态 |

模块 ID 与权限 ID 不一定相同：员工查询的前端模块 ID 是 `employee-agent`，授权使用 `employee-query`。不要直接把页面名称、目录名或 URL 当成权限字符串。

### 4.2 不应被误认为已完成的需求

- 招聘当前采用关键词/条件规则评分，不是独立的“大模型简历筛选 Agent”。
- 统一助手目前通过同一插件组合已有能力；尚未实现完整的 supervisor 决策、多个子助手执行、结果仲裁与任务持久化。
- 绩效考核、电子签名、会议内容问答、完整财务与项目管理，仍属于后续规划或待开发。
- 站内通知已实现；企业微信审批/打卡数据能拉取，不等于已经实现向企业微信个人账号推送业务通知。
- 当前存在测试与健康检查，但不能等同于完整的自动化端到端验收、灾难恢复演练或安全审计认证。

### 4.3 最近一轮稳定性工作

- v5.70 / v5.71：账号运行身份不可变且不可复用；会话权限变更及时失效；运行实例独立系统用户；员工工具改为只读网关；文件路径边界加固；对话历史与实时事件竞态修复。
- v5.80：考勤重复打卡与跨天请假规则、同步失败状态、旧审批复查、汇总长内容分批及真实驾驶舱数据。
- v5.90 / v5.91：员工、会议摘要、模块启停的事务审计；离职信息一次保存；汇总页面旧请求不覆盖新日期；显式修复 PostgreSQL 参数类型推断冲突。
- 最近业务发布记录为前后端构建和 174 项回归通过；本地数据库相关测试有条件跳过，服务器另用临时表/临时序列执行了对应隔离测试。这里是上一轮发布记录，不是本次编写文档重新执行的测试。

## 5. 数据模型、身份与保存位置

### 5.1 员工与账号的几种 ID

| 标识 | 所属对象 | 正确用途 |
| --- | --- | --- |
| employees.id | 员工档案 | 业务内部关联、档案与历史检索；使用数据库编号机制 |
| accounts.id | 平台登录账号 | 登录会话、权限、操作人与通知接收人关联 |
| accounts.account_id | 登录名 | 用户登录和展示；不应作为新运行空间唯一身份 |
| accounts.runtime_key | 运行身份 | 不可变、不可复用；隔离同名删除后重建账号的数据 |
| employees.wecom_user_id | 企业微信通讯录成员 | 考勤、排班、审批关联 |
| employees.wecom_report_user_id | 日报填报者标识 | 企业微信智能表格日报关联，不能强行等同通讯录 ID |
| 日报 / 打卡 / 审批记录 ID | 一次业务记录 | 去重、更新、溯源；不是新的员工身份 |

员工没有平台登录账号也可以有考勤和日报；平台账号也不一定对应一个员工档案。姓名可重名、可变更，自动匹配只能在唯一且可确认时进行。手工绑定之前，应同时核对姓名、企业微信真实标识和员工档案。

`039_stable_account_runtime_identity.sql` 将运行身份从可复用登录名中分离，并保留历史占用记录。旧账号通常保留原目录身份以兼容既有数据；新账号使用随机身份。不要删除历史表来“回收用户名目录”。

### 5.2 主要数据库表

| 领域 | 核心表 | 数据含义 |
| --- | --- | --- |
| 员工 | employees | 档案、部门、任职、离职、简历二进制及企业微信关联 |
| 账号 | accounts、sessions、login_attempts | 账号、登录会话与登录保护 |
| 授权与运行身份 | account_module_permissions、account_runtime_identity_history | 模块权限和已占用运行身份 |
| 日报 | employee_work_daily_reports、employee_work_daily_sync_runs | 原始/规范化日报、内容哈希、同步状态 |
| 日报统计范围 | employee_daily_report_individual_scope | 单独汇报及固定排除人员范围 |
| 汇总 | daily_report_analysis_snapshots | 生成的报告内容、日期范围和来源信息 |
| 打卡 | employee_wecom_checkins、employee_wecom_checkin_sync_runs / checkpoints | 打卡原始记录、同步记录与断点 |
| 排班 | employee_wecom_schedules | 每个员工、日期的排班信息 |
| 请假 | employee_wecom_leaves、employee_wecom_leave_sync_runs / checkpoints | 审批编号、状态、理由、时间和同步信息 |
| 会议 | meeting_records、meeting_upload_credentials | 正文、摘要、参会人、幂等键和上传凭证摘要 |
| 招聘 | recruitment_jobs、recruitment_candidates | 岗位要求、简历文件/文本、筛选及候选状态 |
| 平台与审计 | platform_module_settings、platform_audit_logs | 模块启停、操作者、对象、变化明细 |
| 通知 | platform_notifications、account_notification_preferences | 指定账号的站内通知与订阅偏好 |
| 兼容通知配置 | platform_notification_settings、platform_notification_recipients | 保留的配置结构，迁移前先查看实际调用 |

准确字段、索引、外键和默认值以 `apps/api/migrations/*.sql` 及对应仓储为准。迁移编号截至 039；不能只阅读 001 来理解当前结构。

### 5.3 文件和数据在哪里

- 员工简历：当前保存在 `employees.resume_data`，不是简单复制到网站静态目录。
- 招聘简历：招聘候选数据及附件保存在招聘模块的数据表中，与员工档案独立。
- 会议原文和摘要：保存在会议表中，Markdown 是内容格式，不代表一定存在同名 `.md` 文件。
- 助手输入/输出文件：`.runtime/agent-sandboxes/<agentId>--<runtimeKey>/workspace/uploads` 与 `outputs`；内部临时工作目录为 `.work`。
- 助手会话：对应实例的 DSH 存储目录中，含框架管理的会话、索引与历史；不要单独删除某个会话压缩文件来清理空间。
- 企业微信 CLI 登录状态：服务器服务使用的 `/var/lib/hegongzuo-wecom` 等授权状态目录，具体文件名由 CLI 管理，不在 Git 中。
- 运行实例注册清单、实例凭证和活动标记：`.runtime` 内；包含敏感配置，备份应限制读取权限。

### 5.4 数据一致性的原则

员工新增、离职、部门变动应从员工档案维护入口进行，不能分别修改日报、考勤和页面的人员数组。历史统计按任职日期及当日排班等规则查询，不应因为当前离职就一律删除历史记录。企业微信原始记录保留源标识和内容哈希，便于重跑同步与解释变化。

当前并不是所有查询都已完成完整历史任职区间建模，例如多次入离职、历史部门调动需要进一步设计。不要宣传“任何人员变化都会自动无误地重算所有历史结果”。

### 5.5 常用只读核对 SQL

以下查询仅统计数量或同步状态，不输出员工姓名、联系方式和请假理由。连接前先确认数据库是哪个环境；诊断操作不需要数据库超级用户。结果要按业务日期解释，不能直接用总行数当某一天的应出勤人数。

```sql
-- 员工当前状态分布
SELECT status, count(*) FROM employees GROUP BY status ORDER BY status;

-- 两种企业微信身份的关联完整度
SELECT count(*) AS employees,
       count(nullif(wecom_user_id, '')) AS directory_linked,
       count(nullif(wecom_report_user_id, '')) AS reporter_linked
FROM employees;

-- 最近日报同步，不读取原始业务正文
SELECT id, status, started_at, finished_at
FROM employee_work_daily_sync_runs ORDER BY id DESC LIMIT 10;

-- 最近打卡与请假同步
SELECT id, status, started_at, finished_at
FROM employee_wecom_checkin_sync_runs ORDER BY id DESC LIMIT 10;
SELECT id, status, started_at, finished_at
FROM employee_wecom_leave_sync_runs ORDER BY id DESC LIMIT 10;
```

## 6. 核心业务规则

### 6.1 员工档案与 Excel 粘贴

粘贴识别只负责把一行内容填入表单，用户确认保存后才写数据库。这是为了让 HR 检查姓名、日期、电话和错列等问题，避免复制内容直接影响正式数据。

固定 33 列，按 Tab 分隔，空单元格必须保留，不接受一行中少列、多列或多行员工。顺序如下：

```text
01 所属公司       02 姓名            03 入职时间
04 试用期时长（月）05 预计转正日期     06 实际转正日期
07 合同到期日期   08 合同到期         09 一级部门
10 二级部门       11 职位            12 用工类型
13 性别           14 身份证          15 出生日期
16 年龄           17 工龄（月）      18 联系方式
19 邮箱           20 企业邮箱        21 学历
22 专业           23 毕业学校        24 毕业时间
25 婚否           26 育否            27 籍贯
28 紧急联系人     29 紧急联系人电话  30 居住住址
31 身份证地址     32 银行卡          33 银行信息
```

- 试用期允许留空或 0–12 的整数；不是必填 1–12。
- 婚否仅允许未婚、已婚、离异或空；育否仅允许未育、已育或空。
- 合同工、全职等映射为 `full_time`；兼职、实习、外包/劳务有相应枚举，不要只改显示名称而漏改后端类型。
- 日期识别接受年/月/日等明确日期格式，规范化为 `YYYY-MM-DD`，拒绝不存在的日历日期。
- 年龄、工龄、合同剩余天数是计算信息；粘贴值与计算不一致时提示，不直接把这些数值当永久事实存储。
- 工作电话、非空紧急联系人电话、非空身份证号需通过公共校验；两个邮箱可留空。
- 后端仍会重复校验。姓名、一级部门、职位、入职日期、工作电话等必要信息不能依靠“识别成功”跳过保存校验。
- 简历支持 PDF / DOC / DOCX，单份上限 5 MiB；输入中的 `resume` 不传表示不改，`null` 表示移除，对象表示上传替换。

员工离职日期、原因应与档案保存放在同一业务事务中；恢复在职应清理旧离职标记。不要恢复为“先保存档案、再发第二个离职请求”的前端流程，否则会重新产生部分保存和页面错乱。

### 6.2 日报统计

- 已实行日报统计的业务起点为 2026-08-08；更早日期的报表应结合这个口径解释，不应默认全员从年初开始欠交。
- 日期按北京时间解释；提交时间是时刻，汇报日期是业务日期，两者不能直接互相替换或任意减一天。
- 当前有效汇报日期规则由 `daily-report-date.ts` 定义，包含源汇报日期与北京时间提交日的约束；不采用“次日两份自动把第一份改成昨天”的推测规则。
- 应提交人员受任职范围、单独汇报名单、固定统计排除名单、请假和排班影响；不能直接等于在职员工总人数。
- 部门以员工档案关联后的部门为准，而不是企业微信表格里可能过时的部门文字。
- 当前部分时间请假仍可能免除当日日报，应由 HR 再确认这一口径；这是保留现行规则，不代表已按请假小时数精确扣减应提交义务。
- 日报列表点击员工可查看历史；离职归档保留有日报的离职人员；员工维护界面不再嵌入日报模块。
- 前端日历已移除，提交看板默认昨日并有趋势图；后端仍保留兼容查询分支，不应误认为前端需要恢复日历。
- 单独汇报与固定排除是两个业务分类；不能把排除统计等同于删除源日报。

### 6.3 考勤与请假

- 页面统计完整自然日，默认不纳入当天尚未结束的打卡；历史日期以北京时间计算。
- 排班来自企业微信，不用简单的周一到周五或单双周公式替代。周六可能有班，法定调休也要遵循同步的排班。
- 无上下班打卡或缺一侧时保留空值并按规则判断缺卡，不补造 09:00 / 18:00。
- 当日正常选用首次上班、末次下班记录；中间重复打卡不能改变已展示记录的异常结果。
- 09:00 分钟内不迟到，从 09:01 开始迟到；超过 09:15:00 的记录按较严重迟到展示。边界秒数如需调整，应先与 HR 确认。
- 全天请假包括同日达到 8 小时等现有条件；跨天请假按当日覆盖判断，不能仅因总时长较长便把跨越的所有日期都当全天请假。
- 请假覆盖上班边界时上班栏显示请假，覆盖下班边界时下班栏显示请假；未覆盖的部分保留真实打卡逻辑。
- 只有审批通过的有效记录参与请假判断，撤销或拒绝应在后续同步时反映。
- 外出打卡有兼容配对逻辑：多条时补充首末记录，单条时存在 13:30 分界推断。这是应用规则，不是企业微信明确提供的上下班判定。
- 当前总体状态在部分情况下以请假优先，可能盖过另一侧缺卡；需由业务负责人决定是否将“请假且缺卡”拆成复合异常。

### 6.4 会议、招聘和通知

会议上传一次提交摘要和原文，摘要失败可传 `null`。新上传不要求 `mode`，新记录内部兼容保存为中文；原有记录的模式不批量改写。开始与结束时间均保存，列表主要展示开始时间。有会议权限的用户可查看全部会议；摘要可在详情中编辑并审计，原文没有同等编辑入口。导出当前为 Word。

招聘三档结果当前基于岗位条件与简历文本匹配：优先查看、人工复核、明显不匹配。排除词命中、必需条件匹配情况影响结果，存在同义词、否定表达和文本提取误差，不能替代人工决定。候选、淘汰、删除是不同操作；候选还有联系、面试、录用等跟进阶段。删除岗位和简历前应确认保留政策。

站内通知有合同、日报、考勤三类，接收人是指定平台账号，按账号权限与通知偏好控制。同一来源键去重更新；已解决状态与已读状态不同。合同提醒包括已逾期和未来 7 天范围，日报与考勤提示通常针对昨日。通知查询当前会触发一次派发计算，性能边界见第 16 章。

## 7. 企业微信与模型集成

### 7.1 同步链路与实际时间

| 数据 / 工作 | 生产计划 | 执行方式与保存结果 |
| --- | --- | --- |
| 日报智能表格 | 每日 22:00 | work-daily-sync 服务，分页读取并按内容哈希增量写入 |
| 通讯录、打卡、排班、关联请假 | 每日 02:15 | checkin-sync 服务，完成排班后再提交成功状态与断点 |
| 站内提醒 | 每日 09:00；同步后也会触发 | notification-dispatch 服务，写入账号通知 |
| 运行实例校准 | 约每 10 分钟及配置变更触发 | reconcile / sync 服务，管理实例配置与空闲状态 |
| 健康检查 | 约每分钟 | health 服务，检查与告警 |

上述时间在本次服务器上核对，服务器时区为 `Asia/Shanghai`。部分 timer 有随机延迟或启动后执行规则，精确状态以 `systemctl list-timers --all` 为准。不要再沿用早期“每 5 分钟同步日报”的描述。

### 7.2 日报源不是数据库直连

配置使用 `WECOM_WORK_DAILY_DOC_ID`、`WECOM_WORK_DAILY_SHEET_ID` 和 `WECOM_CLI_PATH`。同步器调用 `wecom-cli smartsheet records list`，按 cursor 获取分页，当前单页上限 1000。所有页读取后按记录标识和 `content_hash` 判定新增、更新、未变化。

因此当前“增量同步”准确含义是增量落库，不是每次只从企业微信请求当天或最近变化的记录。源表越来越大时，读取时间仍可能增长。重复 cursor、CLI 超时或授权失效会导致失败，不应把只读了一部分数据标记为全量成功。

CLI 授权属于服务身份，开发者在个人终端重新登录不一定修复 systemd 中的授权。接手时必须确认谁是企业微信应用/机器人/表格授权负责人、授权范围、授权缓存所在账户，以及离职后是否会失效。不要假设某个固定有效期适用于所有凭证。

### 7.3 打卡、排班与审批

源码中的主要企业微信路径包括 `/cgi-bin/gettoken`、`/cgi-bin/user/list`、`/cgi-bin/checkin/getcheckindata`、`/cgi-bin/checkin/getcheckinschedulist`、审批 `getapprovalinfo` 与 `getapprovaldetail`。具体域名、请求参数与错误处理以 client 文件为准。

打卡按时间窗口与成员批次读取，增量同步保留重叠回看窗口；单员工补同步不能推进全员全局断点。请假列表按申请时间获取，不等于按实际请假日期获取，因此“8 月提交、9 月请假”不能只查 9 月申请。当前同步增加了既有待审批、未来和近期已批准记录复查，避免批准、撤销或长提前量申请被遗漏。

业务历史起点为打卡 2026-07-01。历史补齐命令应明确范围，在备份和核对参数后执行，不能每次遇到缺卡就重跑所有历史。

企业可信 IP 是服务器对外请求的公网出口 IP；可信域名是网页域名，两者不是同一个配置。迁移服务器需要重新核对出口 IP、回调 HTTPS、域名校验文件和企业微信授权范围。当前可信域名校验文件由 Nginx 单独静态规则提供，不应被 SPA 首页覆盖。

### 7.4 日报汇总模型

当前独立配置名为 `HEGONGZUO_DAYLYREPORT_DEEPSEEK_API_KEY`。`DAYLYREPORT` 是现有命名，不能只在某一处改成另一种拼写。该凭证只用于日报汇总/查询链路，不应复用到其他助手或暴露给浏览器。

实现会把选定范围的日报按真实部门整理，生成有层次的正文与子弹点，并附可点击来源。处理包含日期范围校验、资料分批、超长单条拆分、输出截断拆分重试和请求并发限制。当前模型调用温度为 0.2，结果不保证字句一致；即使改为 0 也不应向用户承诺绝对一致。

实现要点：日期范围上限 90 天；资料批次约 32,000 字符、最多 28 条；单次请求超时约 90 秒；并发 3、等待队列上限 30。上述是代码边界，不代表每次生成必定在 90 秒内结束，多批次会累计耗时。

生成汇总保存到 `daily_report_analysis_snapshots`；问题查询不等于保存报告。当前每次保存会新增快照，同一日期范围可能有多条记录；如业务坚持一范围仅一份，应单独设计唯一性和覆盖规则，不能在交接时声称已经满足。

外部发送内容涉及员工工作信息。此前业务已允许用于这一功能；继任者仍需控制字段与接收方，不把身份证、银行卡、简历等无关个人资料添加进提示词。

## 8. 对话能力、运行空间与安全边界

### 8.1 注册与组合

运行能力注册文件位于 `packages/*/hegongzuo-agent.json`。`scripts/agent-runtime-registry.mjs` 负责发现和校验；运行环境通过同步脚本为有资格的账号生成配置。现有主助手和员工查询分别声明能力 ID、权限、运行类型等。

自动注册能够减少“新增账号但某个能力没有运行空间”的情况，但并不自动生成前端页面、工具、数据库权限或业务测试。新增能力仍要实现插件、注册、页面与服务端授权；不要绕过这些步骤只复制一个目录。

### 8.2 按需分配的真实含义

“运行时”是正在执行的进程，主要消耗 CPU、内存、文件句柄；“工作空间”是文件和会话，主要占硬盘。账号拥有配置不意味着其进程全天常驻，也不意味着预先占满 3 GiB 磁盘。

- 页面访问通过代理唤醒对应运行实例；同一实例的并发唤醒会合并。
- 活跃请求更新活动标记，默认空闲约 30 分钟后可停止实例。
- 退出登录或撤权会断开相关实时连接，但不是立即删除文件或会话。
- 工作区和历史保留在硬盘，下一次打开后可重新启动实例读取。
- 3 GiB 是主助手可见文件区的应用层配额，上传单文件上限 200 MiB；不等于操作系统对整个实例硬盘的强制配额。
- `.work`、会话日志、并发上传及助手自行写出的内容，仍需考虑额外磁盘限制与容量治理。

生产模板中 API 内存上限 1 GiB、CPU 配额 100%；单运行实例内存上限 1 GiB、CPU 配额 75%。这只是每服务上限，不能推导为任意数量账号同时使用都不会耗尽整机资源。必须结合并发活跃数、整机内存与告警做容量规划。

### 8.3 会话与前端稳定性

员工查询维持最多 3 个会话、单会话最多 30 轮的业务限制；主助手采用单窗口并可清空。框架会话上限、前端按钮状态、后端清理和实际存储必须保持一致。不要仅从列表隐藏会话而留下后端可继续操作的孤立状态。

历史问题包括消息短暂出现后消失、已结束仍显示生成中、必须刷新才能看到全文、输入法确认回车误发送。当前相关实现通过请求轮次隔离、事件顺序合并、历史补偿读取、结束后内容校验和输入法组合状态保护处理。修改这一链路必须保留竞态测试，不能把错误简单归因于“浏览器缓存”。

排查时区分：消息提交是否成功、实时连接是否收到事件、后端是否完成、历史接口是否包含正文、前端是否被旧请求覆盖。不要只看“正在生成”的文字。

### 8.4 安全约束

- 每个生产实例由独立系统用户运行，不共用一个拥有项目写权限的用户。
- 实例隐藏平台 `.env`、Git 元数据和其他账号目录；只允许写自己工作区。
- 实例环境使用白名单，不把数据库连接串和公司级 Secret 继承给工具进程。
- 员工工具经平台内部只读网关访问，每次调用重新校验账号与权限；不能直接给模型数据库管理权限。
- HTTP / WebSocket 实例入口需要实例凭证；不应将内部端口直接开放公网。
- 工作区访问防路径穿越和符号链接越界；上传、下载、删除均走共享安全路径边界。
- 提示词可以约束行为，但不是访问控制。提示词泄露防护不能替代操作系统隔离、接口鉴权与字段最小化。
- 新增工具，尤其是 shell、文件或网络工具，必须单独评估其权限和数据流向。

## 9. API 接口交接

### 9.1 共通约定

正式 API 基址为 `https://hgzuo.com`，服务内网地址为 `http://127.0.0.1:4174`。普通页面使用登录 Cookie `hegongzuo_session`，HTTPOnly、SameSite=Strict，生产应启用 Secure。会议外部上传使用独立 Bearer 凭证；内部员工工具使用独立实例凭证，不能混用。

错误通常返回 JSON `{ "error": "说明" }`；成功包裹结构不完全统一，下面列出主要差异。常见状态包括 400 参数错误、401 未登录/凭证无效、403 无权限、404 不存在、413 体积超限、503 功能或外部服务暂不可用。代理和各业务也可能返回其他状态，应以实际处理分支为准。

JSON 解析器目前按约 8,000,000 个字符限制请求，不是统一 8 MiB 字节限制；文件直传走单独流式接口。前端、API、Nginx 的限制必须一起检查。当前没有自动生成并强制校验的 OpenAPI 契约；本清单用于交接，未来改接口应同步更新客户端、测试和文档。

### 9.2 登录、健康与平台访问

| 方法与路径 | 输入 / 权限 | 输出 / 说明 |
| --- | --- | --- |
| GET /health | 无登录；建议内网运维访问 | 数据库及已配置实例综合状态，含 running / idle / unavailable |
| POST /api/auth/login | accountId、password | user + 登录 Cookie；有登录保护 |
| GET /api/auth/me | 登录 Cookie | 当前 user，并更新 Cookie 生命周期 |
| POST /api/auth/change-password | currentPassword、newPassword | 修改密码并撤销旧会话 |
| POST /api/auth/logout | 登录 Cookie | 204；清理登录状态 |
| GET /api/platform/access | 登录 | 全局停用模块信息 |
| GET /api/management/cockpit | management-cockpit 及现有 CEO 限制 | 真实业务概览，日期以返回值为准 |
| GET/POST /api/integrations/wecom/callback | 企业微信签名参数 / 加密内容 | 回调校验；不是任意客户端可写数据入口 |

### 9.3 员工接口（employee-data）

| 方法与路径 | 参数 | 返回与注意事项 |
| --- | --- | --- |
| GET /api/employees | query、scope、page、pageSize、sort、ascending | employees、total、page、pageSize；默认每页 10，不是总共 10 人 |
| GET /api/employees/export | 同列表筛选和排序 | employees JSON；前端生成 Excel，不直接返回 xlsx |
| GET /api/employees/contract-expiry-alerts | 无 | 已逾期及 7 天预警范围 |
| POST /api/employees | 完整 EmployeeInput | 201 + employee；事务保存与审计 |
| GET /api/employees/:id | 员工 ID | employee |
| PUT /api/employees/:id | 完整 EmployeeInput | employee；不是任意字段 PATCH |
| POST /api/employees/:id/departure | departureDate、departureReason | employee；不要与普通保存重复串行调用 |
| GET /api/employees/:id/resume | 员工 ID | 二进制文件，私有缓存策略 |
| GET /api/employees/:id/daily-reports | page、pageSize 等 | 历史兼容入口；HR 页面已移除对应嵌入区 |
| POST /api/employee/wecom-directory/sync | 当前员工维护权限 | 同步通讯录关联；不等于自动创建全部企业微信成员档案 |

scope 为 `employed` / `departed`；排序支持 `hireDate`、`departureDate`、`tenure`、`displayName`、`departmentName`、`contractEndDate`。员工 ID、总人数和下一编号不要在前端根据当前页自行推算。

新增接口的最小示意 JSON 如下，仅供独立测试环境使用。正式更新应保留完整表单数据，不能把这个最小对象用于覆盖已有档案：

```json
{
  "displayName": "示例员工",
  "departmentName": "示例部门",
  "jobTitle": "示例岗位",
  "workPhone": "13800138000",
  "employmentType": "full_time",
  "status": "active",
  "hireDate": "2026-09-01",
  "probationMonths": null,
  "workEmail": null,
  "personalEmail": null
}
```

### 9.4 日报与分析（employee-reports）

| 方法与路径 | 参数 | 返回与说明 |
| --- | --- | --- |
| GET /api/daily-reports | employee、department、startDate、endDate、keyword、page、pageSize | reports、total、page、pageSize、totalPages；pageSize 最大 100 |
| GET /api/daily-reports/:id | 日报记录 ID | report；用于原始来源查看 |
| GET /api/daily-report-analytics | view 及相应 date/month/startDate/endDate/scope | data；dashboard、trend、employees、individual、quality 等 |
| GET /api/daily-reports/sync | 无 | 排队状态与最近同步记录 |
| POST /api/daily-reports/sync | 无 | 202，触发后台同步；不等待全部同步结束 |
| POST /api/daily-reports/analysis | startDate、endDate、可选 question | 正文、数量、来源；无 question 时生成并保存汇总 |
| GET /api/daily-reports/analysis | startDate、endDate | snapshot，查询已保存报告 |
| GET /api/daily-reports/analysis/versions | page | 汇总列表，当前每页 8 条 |
| DELETE /api/daily-reports/analysis/versions/:id | 数字 ID | 删除指定保存报告，不删除源日报 |
| GET /api/employee/reports | date | 旧兼容业务入口，已接入真实同步数据 |

生成和查询的日期范围均为包含起止日的范围。不要用 `new Date('YYYY-MM-DD')` 再转本地时区造成日期偏移。前端切换范围时，应丢弃旧范围请求的覆盖写入，而不是取消整个模块所有任务。

### 9.5 考勤（employee-attendance）

| 方法与路径 | 参数 | 用途 |
| --- | --- | --- |
| GET /api/employee/attendance | date | 每日快照、员工记录与状态 |
| GET /api/employee/attendance | view=history、employeeId | 单员工历史 |
| GET /api/employee/attendance | view=anomalies、month=YYYY-MM | 月度异常排行 |
| GET /api/employee/attendance | view=monthly、month=YYYY-MM | 月度统计 |
| GET /api/employee/day-status | employeeId、date | 当日打卡、请假、日报等关联信息 |

接口存在不传日期时的默认值，前端应显式传符合业务的统计日；不要以服务端默认日期推断“当天必须已经完整”。

### 9.6 会议与上传协议

| 方法与路径 | 授权 / 输入 | 输出 |
| --- | --- | --- |
| POST /api/meeting-records | Bearer 上传凭证 + Idempotency-Key + JSON | 新建 201 / 重试命中 200，success、id、url、created |
| GET /api/meeting-records | meeting-records；query、date、mode、page、pageSize | 分页列表，pageSize 最大 50 |
| GET /api/meeting-records/:id | meeting-records | record |
| PUT /api/meeting-records/:id | meeting-records；summary 字符串 | record；空白保存为 null，只修改摘要 |
| GET/POST /api/platform/meeting-upload-credentials | platform-administration；创建传 name | 凭证列表 / 新凭证，仅创建时提供原始凭证 |
| DELETE /api/platform/meeting-upload-credentials/:id | platform-administration | 撤销凭证；不是删除会议 |

外部翻译脚本示例（所有姓名与值均为示意）：

```http
POST /api/meeting-records
Authorization: Bearer <安全渠道取得的会议上传凭证>
Idempotency-Key: meeting-20260916-090000-example01
Content-Type: application/json

{
  "title": "项目进度会议",
  "started_at": "2026-09-16T09:00:00+08:00",
  "ended_at": "2026-09-16T10:00:00+08:00",
  "summary": "# 会议摘要\n\n- 明确本周工作事项。",
  "transcript": "[09:00:00] 会议开始……",
  "participants": [{ "name": "示例参会人" }]
}
```

要求：标题 1–200 字符；时间包含时区且结束晚于开始；summary 必须传字符串或 null，不能完全省略；摘要上限 500,000 字符；transcript 非空且上限 6,000,000 字符；参会人数组最多 100，每个 name 1–80 字符。不要再发送 `source` 或要求 `mode`。服务器生成形如 `26001` 的编号，不由上传方指定。

幂等键由上传端为每场会议生成并持久保存，重试同一场会议必须复用原值；不能每次重试都随机生成一个新值。当前格式限制为 16–200 个字母、数字、点、下划线、冒号或短横线。成功地址采用 `/meetings?record=<id>`。当前年度编号有 999 的容量边界，达到前应扩展而不是修改已有 ID。

### 9.7 招聘（recruitment-management）

| 方法与路径 | 输入 / 结果 | 说明 |
| --- | --- | --- |
| GET/POST /api/recruitment/jobs | jobs / 创建岗位字段 | 创建返回 id |
| GET/DELETE /api/recruitment/jobs/:jobId | job / 删除 | 删除前确认候选关联影响 |
| GET/POST /api/recruitment/jobs/:jobId/candidates | candidates / files 数组 | 上传项含 fileName、mimeType、base64，可有 text |
| GET /api/recruitment/candidates | candidates | 候选池 |
| GET /api/recruitment/eliminated | candidates | 淘汰池 |
| POST /api/recruitment/jobs/:jobId/candidates/:id/candidate | stage、notes | 设置或取消候选阶段 |
| POST /api/recruitment/jobs/:jobId/candidates/:id/status | ids 数组、status | status 为 eliminated / restored；支持批量 |
| GET /api/recruitment/jobs/:jobId/candidates/:id/file | 二进制 | 下载原简历 |
| DELETE /api/recruitment/jobs/:jobId/candidates/:id | 204 | 删除该简历，不等于淘汰 |

候选阶段：none、to_contact、interview_scheduled、interviewing、pending_offer、hired、declined。状态接口虽然路径中有一个候选 ID，批量目标仍由 body.ids 决定，客户端需按既有实现调用，不要自行猜测不存在的批量 URL。

### 9.8 账号、平台与通知

以下账号和平台配置接口需要 `platform-administration`，普通通知接口只针对当前登录账号。

| 方法与路径 | 主要输入 / 用途 | 注意事项 |
| --- | --- | --- |
| GET /api/accounts | 账号列表 | 不含原始密码 |
| GET /api/accounts/permission-catalog | 权限目录 | 新能力需核对目录与注册一致 |
| GET /api/accounts/notification-preferences | 通知偏好 | 与账号编辑权限区联动 |
| POST /api/accounts | accountId、displayName、position、permissions、notificationTypes | 202；运行环境初始化为后台任务 |
| PUT /api/accounts/:id | 账号编辑内容 | 202；不能因改某一权限停掉整个账号所有能力 |
| DELETE /api/accounts/:id | 账号 ID | 不可删除当前操作账号；撤销会话与连接 |
| POST /api/accounts/:id/reset-password | 账号 ID | 撤销会话和锁定状态；默认密码须私下移交并及时修改 |
| POST /api/accounts/:id/retry-initialization | 账号 ID | 202；重新排队初始化 |
| GET /api/platform/status | 平台状态 | 模块、服务等信息 |
| PATCH /api/platform/modules/:id | enabled 布尔值 | 模块启停与审计同事务 |
| GET /api/platform/audit-logs | cursor | logs、nextCursor；不要用页码假设游标结构 |
| GET /api/platform/audit-logs/export | 无 | 全量 CSV，500 条分批流式写出同一文件 |
| GET /api/platform/data-sync | 无 | 同步源状态 |
| POST /api/platform/data-sync/daily | 无 | 202，触发日报同步 |
| GET/PUT /api/platform/notification-settings | settings | 平台通知兼容配置 |
| GET /api/notifications | 当前账号 | 通知及未读数；当前最多读取 80 条 |
| POST /api/notifications/read-all | 当前账号 | 全部标记已读 |
| POST /api/notifications/:id/read | 当前账号、通知 ID | 只允许修改自己通知 |

### 9.9 文件与对话代理

| 方法与路径 | 输入 / 授权 | 说明 |
| --- | --- | --- |
| GET /api/main-assistant/files | 登录 | files、usedBytes、quotaBytes |
| POST /api/main-assistant/files | 原始二进制；x-workspace-file-name | 流式上传，不是 JSON/base64；文件名需正确编码 |
| GET /api/main-assistant/files/download | path | 只访问自己工作区可见文件 |
| DELETE /api/main-assistant/files | path | 只删文件，不递归删除目录 |
| /api/employee-agent/* | 员工查询权限 | 旧兼容对话代理；HTTP 与 WebSocket |
| /api/agents/:agentId/* | 注册能力及当前账号授权 | 通用代理，根据 runtimeKey 找实例 |
| POST /api/internal/agent-employees | 实例凭证 + 当前业务权限 | 只读工具网关，不给浏览器直接调用 |

DSH 的 session/workspace 请求带其自己的 RPC envelope，客户端适配见 `shared/dsh/client.ts` 和会话实现。不要将框架代理当普通 REST 随意改字段。普通上游请求约 30 秒超时，prompt 请求允许更长；Nginx、API 代理、客户端取消和框架任务超时必须一起排查。

## 10. 开发环境接手步骤

### 10.1 准备条件

准备公司授权的 Git 访问、Node.js 22 系列、与仓库匹配的 pnpm / Corepack、PostgreSQL，以及测试环境配置。当前验证过 Node 22 环境，不要直接换大版本。生产凭证不要复制到个人演示项目、聊天记录或 Git。

首次建立独立开发数据库，并由负责人决定使用脱敏备份还是种子数据。`db:seed`、`db:seed:accounts` 和 `db:setup` 会导入或初始化数据，不能在生产环境为“修复缺数据”随意运行。

```sh
git clone git@github.com:Aoppp/DSH_HeGongZuo.git
cd DSH_HeGongZuo
corepack pnpm install --frozen-lockfile
corepack pnpm verify:env
# 人工确认 .env 指向独立开发数据库后：
corepack pnpm db:migrate
corepack pnpm build
```

`.env.example` 只是起点，未必包含每个后续集成的全部变量。需要根据本章配置表与源码确认，不要依赖“示例没有就不需要”的假设。数据库迁移有历史重放风险，见第 12 章。

### 10.2 启动方式

```sh
# API 与前端分别启动：
corepack pnpm api:dev
corepack pnpm platform:web

# 需要完整对话环境时：
corepack pnpm platform:dev
```

前端默认 4173，API 默认 4174。`platform:dev` 会进行准备、构建和运行环境初始化，不适合把每次纯 CSS 修改都当完整平台冷启动。第一次需要对话功能时，应确认 DSH 依赖与运行空间配置。

重要已知差异：当前 Vite 代理只列出了 `/api/employee-agent`、`/api/auth`、`/api/accounts`、`/api/employees`。日报、会议、主助手等新路径没有全部列入，因此“前端能打开”不代表完整本地接口联通。继任者开始全模块联调前，应在独立任务中补齐统一 `/api` 转发及 WebSocket，或使用与生产一致的本地反向代理。本交接未擅自修改业务配置，也不承诺上述命令已完成全模块联调。

### 10.3 配置与凭证移交清单

| 配置 / 资源 | 作用 | 交接方式 |
| --- | --- | --- |
| DATABASE_URL、DATABASE_SSL | API 与同步任务访问数据库 | 秘密管理渠道；分别提供开发和生产值 |
| HEGONGZUO_API_HOST / PORT | API 监听位置 | 生产为环回地址，禁止随意暴露内部端口 |
| HEGONGZUO_SESSION_COOKIE_SECURE | HTTPS Cookie | 生产启用；本地 HTTP 环境需对应调整 |
| HEGONGZUO_WECOM_CORP_ID | 企业标识 | 与业务管理员核对，不能使用个人测试企业替代 |
| HEGONGZUO_WECOM_CHECKIN_SECRET | 打卡/排班集成 | 安全交接、确认范围和出口 IP |
| HEGONGZUO_WECOM_APPROVAL_SECRET | 请假审批 | 与审批应用权限和模板可见范围一起核对 |
| WECOM_WORK_DAILY_DOC_ID / SHEET_ID | 日报智能表格 | 连同服务身份的 CLI 授权一起移交 |
| WECOM_CLI_PATH、同步 request 路径 | CLI 和手动同步桥接 | 与 systemd 单元中的用户、路径一致 |
| HEGONGZUO_WECOM_CALLBACK_TOKEN / AES_KEY | 企业微信回调 | 只在服务端；不要写入页面或文档 |
| HEGONGZUO_DAYLYREPORT_DEEPSEEK_API_KEY | 仅日报分析 | 独立额度、计费和访问权限 |
| DSH / 模型供应商配置 | 对话运行实例 | 以实际运行配置为准，不能认为都复用日报密钥 |
| HEGONGZUO_ALERT_WEBHOOK_URL | 运维告警 | 核对接收方不是离职人员的私人渠道 |
| Git / 云主机 / DNS / 证书管理权 | 发布和恢复 | 迁移到公司可持续管理的账号，移除不必要私人访问 |

不要执行 `cat .env` 然后将终端输出贴到工单或交接文档。核对时只列变量名、是否存在、文件所有者和权限；秘密值在受控渠道单独移交。

## 11. 生产部署现状与只读运维

### 11.1 当前生效位置

| 项目 | 本次核对结果 |
| --- | --- |
| 应用目录 | /opt/hegongzuo |
| 前端根目录 | /opt/hegongzuo/apps/web/dist |
| Nginx 站点 | /etc/nginx/conf.d/hgzuo.com.conf |
| 站点域名 | hgzuo.com、www.hgzuo.com |
| TLS 证书 | /etc/nginx/certs/hgzuo.com/www.hgzuo.com.pem（私钥另行保护） |
| API 服务 | hegongzuo-api.service，用户 hegongzuo |
| 实例服务 | hegongzuo-agent@<agentId>--<runtimeKey>.service，独立 hga… 用户 |
| 环境文件 | /opt/hegongzuo/.env，受限权限，不在仓库 |
| 企业微信状态目录 | /var/lib/hegongzuo-wecom |
| 发布备份目录 | /var/backups/hegongzuo/ |

生效 Nginx 包含 `WW_verify_*.txt` 独立访问规则、`/api/` 反向代理以及 SPA 回退。修改配置时以 `nginx -T` 的实际结果为准，不要拿仓库旧模板全量覆盖站点，丢失企业微信校验、证书或其他线上补充项。

### 11.2 日常只读排查命令

```sh
ssh root@8.148.78.89
cd /opt/hegongzuo
git -c safe.directory=/opt/hegongzuo log -1 --oneline
systemctl status hegongzuo-api.service --no-pager
systemctl list-timers --all --no-pager
systemctl list-units 'hegongzuo-agent@*' --all --no-pager
curl -fsS http://127.0.0.1:4174/health
curl -I https://hgzuo.com/
journalctl -u hegongzuo-api.service --since '1 hour ago' --no-pager
journalctl -u hegongzuo-work-daily-sync.service -n 80 --no-pager
journalctl -u hegongzuo-checkin-sync.service -n 80 --no-pager
df -h
free -h
```

日志可能包含业务错误上下文，转发前须检查是否含个人数据或秘密。SSH 退出使用 `exit`，这只断开终端会话，不会停止 systemd 托管服务。

### 11.3 如何解释健康检查

本次只读检查得到 `ok=true`，运行配置 expected=14、available=14、running=2、idle=12。数字会随账号、权限和活跃情况变化，不应写成监控硬编码。

available 包括可按需唤醒的空闲实例，所以 running 不需要等于 expected。HTTP 200 仅证明这次探测通过，不保证每个模型供应商、每条历史记录和每个页面交互都成功。新账号验收仍需实际启动对应能力，并检查身份就绪响应。

### 11.4 日志与告警

systemd 日志统一通过 journald 查询，仓库有 `deploy/systemd/journald.conf.d/` 的保留模板。接手时应核实生产实际生效的磁盘上限、保留时间及 webhook 接收人；仅存在模板不代表告警接收已验收。服务自动重启不能替代告警，尤其是周期性同步失败和磁盘接近满的情形。

## 12. 发布、数据库迁移、备份与恢复

### 12.1 正常发布顺序

1. 明确本次改动范围；检查 Git 工作区，保留用户已有修改，不把不相关文件一起提交。
2. 根据风险执行必要测试；涉及 TypeScript、构建产物或跨包引用时执行相应构建。不要重复运行与纯文档/CSS 不相关的生产同步。
3. 将开发日志按真实时间追加到末尾，提交信息写入版本号与摘要，推送对应远程分支。
4. 核对发布目标为新服务器、当前提交与服务健康。涉及数据迁移或运行空间变更时先做对应备份。
5. 服务器仅 fast-forward 拉取指定提交；若服务器有改动或无法快进，停止分析，不执行强制 reset。
6. 有依赖变化才按锁文件安装；构建 packages、API、前端中实际受影响的部分。不要把 npm 源故障误认为业务代码错误。
7. 数据迁移先审阅与隔离测试，随后按批准方案执行；运行注册变化再执行实例同步与准备。
8. 构建和必要检查通过之后，再重启受影响服务；改 systemd 单元才 daemon-reload，改 Nginx 才 nginx -t 后 reload。
9. 验证 `/health`、HTTPS、实际页面与本次受影响业务；记录部署提交及回退位置。

文档或说明文件更新可以只同步仓库，不重启业务、不重建前端、不运行数据库迁移。当前项目约束要求完成修改后必要测试、版本提交、推送与部署；若用户明确要求暂不提交或部署，应遵守该任务的明确范围。

### 12.2 构建与运行空间更新

正常入口是 `corepack pnpm build`、`corepack pnpm dsh:accounts:sync`、运行空间 setup 脚本。对话注册或插件代码更新应核对实例配置与插件修订，不能只更新网页后声称插件已经发布。

生产曾发生包源访问超时，最近无依赖变化的发布使用服务器已有锁定依赖完成 TypeScript/Vite 构建。该方法只适用于依赖已正确安装且锁文件没有变化，不能当作永久跳过依赖安装或安全检查的理由。

服务器仓库存在不同历史文件所有者；此前直接以服务用户执行 Git 写入可能因权限失败。检查所有者后选定一致的部署身份，使用最小必要权限；不要给整个目录 chmod 777，也不要把所有运行数据递归改为 root 所有。

### 12.3 迁移的特别警告

当前 `apps/api/scripts/migrate.mjs` 会按文件名顺序执行 migrations 中所有 `.sql`，没有已执行版本表。即使许多 DDL 使用 `IF NOT EXISTS`，历史数据更新、回填、清理语句也可能在重跑时再次生效。

因此不能认为“每次发布跑 db:migrate 肯定安全”。新迁移应使用下一个编号，先审阅全部会被重放的语句并在备份副本验证。建议后续增加迁移 ledger / checksum 和基线机制；引入时不能把历史脚本盲目再跑一次。

不要修改已发布迁移来修复生产状态，也不要用种子脚本“补齐编号”。编号可能因序列取号、失败事务或历史导入不连续，这是正常数据库特性；应修复唯一冲突根因，不要求所有记录连续无空洞。

### 12.4 备份应包含什么

- PostgreSQL 逻辑备份或等效可恢复备份，包含业务、权限、审计、汇总及简历。
- `.runtime` 中必要的会话、工作区、实例身份与敏感配置；在线复制需考虑框架正在写入的一致性。
- `.env`、企业微信 CLI 授权状态、Nginx 生效配置、证书与 systemd 单元/drop-in。
- 当前 Git 提交、构建产物和运行工具版本；不要只备份前端 dist。

本次看到历史发布备份：v5.70 目录包含数据库 dump 与旧产物，v5.80 / v5.90 包含发布前产物。存在这些文件不等于已经建立每日备份、异地备份或验证过恢复。接手第一周应做一次独立环境恢复演练并约定恢复点与恢复时间目标。

### 12.5 故障回退原则

纯代码故障通常先回退到上一已验证产物与对应代码，再重启受影响服务；有数据库变更时先判断向后兼容，不能直接拿旧代码连接新结构赌兼容。恢复数据库属于会覆盖业务数据的高影响操作，必须明确恢复时点、期间新增数据处理及业务批准。

不要在当前带有用户未提交内容的工作树上使用 `git reset --hard`。建议用独立 release 目录或经过验证的备份产物回退，并保留失败版本的日志用于定位。

## 13. 开发规范与扩展范式

### 13.1 必须遵守的项目约束

- 当前任务范围是边界，不随意扩展为重构、修改凭证、删除数据或批量部署。
- 新功能按主模块/子功能组织，界面、状态、数据访问、规则与外部集成分离。
- 前端统一在模块注册表管理页面入口；后端所有读取和修改都明确鉴权，不能只藏按钮。
- 跨模块共享类型与规则放到公共边界，不能让一个模块 import 另一模块内部私有状态。
- 日志、文档、提交信息不包含密码、API Key、访问 Token 和真实敏感档案内容。
- 修改项目后更新开发日志，按时间升序 append，不倒插或重写历史说明。
- 版本采用 x.xx：小改如 v5.91 → v5.92，中等改动进入下一十分位，大改动递增主版本。提交信息包含版本与摘要。
- 不用“全部正常、永久不会出错”等不可验证承诺代替测试范围说明。

### 13.2 前端风格与性能

当前设计规范为克制的企业办公绿色系，而不是早期蓝色或夸张科技风：主色 `#2F8C78`，深色 `#163F3A`，浅背景 `#EDF7F4`，页面背景 `#F5F8F7`，正文 `#172522`，边框 `#DDE8E5`。具体以根目录设计规范为准。

标题一般 20–24 px，模块标题 16–18 px，正文 13–14 px，表格 12–13 px；间距、圆角和按钮高度统一。业务界面使用中性称呼，不在用户面前暴露 DSH、模型、数据库等实现术语。避免机器人图标、发光和身份宣传文案。

数据加载复用 Skeleton / Shimmer，按真实布局占位；有缓存数据时不必全页清空再转圈。长表格或列表复用分页；姓名长度、按钮文字和参会人换行不得挤乱其他列。Markdown 用已有安全渲染边界，不把模型文本交给任意 HTML 执行，也不要把渲染结果反复写回 React 状态制造死循环。

### 13.3 新增一个普通模块

1. 定义业务对象、角色权限、数据来源和最小验收用例。
2. 在 `apps/web/src/modules/<主模块>/<功能>/` 建立页面、样式、API 访问与状态文件。
3. 在 `module-registry.ts` 注册 ID、路径、菜单名称和权限；核对平台模块启停目录。
4. API 建立模块目录，分输入解析、服务、仓储；入口只接线，不写长业务 SQL 或复杂规则。
5. 如需数据库，新增编号迁移及索引；确认列表分页、导出和历史数据规则。
6. 权限至少覆盖直接请求 API、跨账号、模块停用三种场景。
7. 修改数据时记录明确对象和字段变化，优先接入同一事务审计。
8. 加入回归、文档、日志并按发布流程上线。

### 13.4 新增一个对话能力

先决定是给主助手新增一个只读工具，还是需要独立运行实例。简单业务查询不一定值得新增长期驻留进程。独立能力需建包和 manifest，复用运行契约与隔离流程，并实现能力身份检查。

权限应在每次工具调用处校验；主助手入口是基础功能不等于它能访问所有业务数据。添加员工、会议或招聘工具时，按真实数据权限限制字段和记录范围。未经明确设计，不要允许对话工具直接编辑代码、修改系统设置或运行全库 SQL。

验收新账号、老账号新增权限、撤权、删除后同名重建、并发唤醒、空闲重启、文件越界、模块停用等整类情况，不只验收开发者自己的账号。

### 13.5 审计写入范式

员工新增/编辑/离职/简历变更、会议摘要修改、平台模块启停已采用业务写入与审计同事务。典型顺序为取得连接、开始事务、锁定并读取旧值、校验和更新、记录字段变化、提交；失败统一回滚。

记录账号 ID 与展示名、业务对象类型与 ID、动作、时间、变更明细。密码和密钥只记录“已修改/已撤销”，不能把原始值写进 before/after。会议摘要当前主要记录长度变化，不是全文版本历史；不能用审计表恢复任意旧摘要。

招聘、账号等部分入口仍是业务写入后单独记审计，尚未全部原子化。后续扩展应复用事务边界，不复制这种遗留模式。用户已要求不记录助手文件区的上传、删除等操作，不能未经确认恢复这些审计。

## 14. 测试与验收策略

### 14.1 测试分层

| 改动 | 必要检查 | 不必默认执行 |
| --- | --- | --- |
| 纯文档 | 文档能打开、内容/路径/秘密检查 | 全量构建、数据库迁移、服务重启 |
| 纯界面与样式 | 对应页面构建、必要交互与窄屏检查 | 全量历史数据同步 |
| 业务规则 | 对应单元/回归、输入边界、权限与错误场景 | 无关模块重复 E2E |
| SQL 或事务 | 独立数据库验证、回滚与并发、必要迁移检查 | 在正式员工数据上写入测试 |
| 实例或会话 | 安全隔离、登录/撤权、实时/历史竞态、实际唤醒 | 清空真实账号会话来测试 |
| 部署配置 | nginx -t / 单元校验、健康与回退路径 | 未经计划重启所有实例 |

根目录 `pnpm test` 包含构建并运行工作区测试，耗时更长。聚焦修改时可先构建受影响包，再执行对应 `node --test` 文件。测试文件直接引用 dist 或临时编译产物时，必须确保产物来自当前源码，不能用旧 dist 的通过结果证明新代码正确。

### 14.2 重点回归文件

- 员工输入与粘贴：API `employee-input.test.mjs`；Web `employee-paste-parser.test.mjs`、`employee-data.test.mjs`。
- 事务与审计：`audited-writes.test.mjs`、`audited-writes-database.test.mjs`、`employee-audit.test.mjs`。
- 账号隔离：`account-security.test.mjs`、`account-identity-migration.test.mjs`、`runtime-security.test.mjs`、`agent-http-guard.test.mjs`。
- 对话与文件：Web `conversation.test.mjs`、`work-assistant-conversation.test.mjs`、`main-assistant-session.test.mjs`、`submit-on-enter.test.mjs`；API `main-assistant-workspace-files.test.mjs`。
- 日报汇总：`report-analysis-batches.test.mjs`；Web `analysis-request-state.test.mjs`、`report-dates.test.mjs`。
- 考勤与同步：`attendance-data-integrity.test.mjs`、`wecom-checkin-sync.test.mjs`、`wecom-leave-sync.test.mjs`、`postgres-attendance-source.test.mjs`。
- 会议：API `meeting-input.test.mjs`；Web `meeting-markdown.test.mjs`、`meeting-word-export.test.mjs`。

数据库测试有显式开关，先读取对应文件顶部的环境变量要求，再在独立测试库启用。测试被 skip 不是通过了真实 SQL；审阅测试报告时必须区别通过、失败和跳过。

例如 `audited-writes-database.test.mjs` 使用 `HEGONGZUO_TEST_DATABASE=1` 开关，并在连接中创建临时表/序列隔离写入。建议仍优先连接开发测试库；启用开关并不意味着其他测试都自动具备相同隔离保证。

### 14.3 接手后的最小业务验收

- 使用普通权限账号和管理账号分别登录，验证不越权；改权限后已有页面和长连接应同步失效。
- 在测试环境新建员工、修改部门、办理离职、编辑离职日期、恢复在职，核对列表人数与审计。
- 用保留空列的 33 列 Excel 行测试识别，验证错误婚育枚举、非法日期和可空试用期。
- 查看昨日考勤、一个休息日、一个周六工作日、全天请假、部分请假和单侧缺卡。
- 日报按同一个日期与员工核对列表、看板和历史；汇总长范围，检查来源、末尾完整性和切换日期竞态。
- 上传会议后用同一幂等键重试，确认只有一条；编辑摘要并导出 Word。
- 招聘测试可解析简历、无法提取文本的文件、候选、淘汰、恢复与删除权限。
- 新账号首次打开主助手和员工查询，确认不是通用编码助手；多轮对话与清空后刷新一致。

## 15. 常见故障定位手册

| 现象 | 优先检查 | 禁止的快捷处理 |
| --- | --- | --- |
| 网站无法访问 | DNS、TLS、Nginx、API、本地 health、当前发布提交 | 直接重建数据库或迁回旧服务器 |
| 日报同步时间不更新 | timer 最近执行、service 日志、CLI 服务身份授权、sync_runs | 只改页面展示时间伪装已同步 |
| 日报少人/日期错一天 | 日期转换、源字段、员工绑定、排除范围、任职与请假排班 | 按姓名硬编码补人数或统一减一天 |
| 请假未显示 | 申请时间与请假时间、审批状态、成员 ID、复查窗口 | 只查询请假发生当天的审批申请 |
| 员工总数与考勤人数不同 | 统计日期、任职范围、绑定、排班、源可见范围 | 将所有无记录员工标为旷工 |
| 有打卡无地点 | 原始来源、外出打卡字段、配对规则 | 补造办公室地点或默认上下班时间 |
| 新账号助手一直连接 | 初始化任务、runtimeKey、注册配置、实例 drop-in、就绪身份 | 复制其他账号目录和凭证 |
| The user aborted a request | 客户端取消、代理超时、模型耗时、服务重启、轮次变更 | 一律认为用户手动取消 |
| 回复结束但前端仍生成 | 实时事件、后端历史、终态合并、旧请求覆盖、网络代理 | 强制删除历史或要求用户永久手动刷新 |
| 汇总长内容失败 | 分批日志、外部响应、截断原因、队列与日期范围 | 截掉未处理输入然后返回成功 |
| 新增员工唯一冲突 | 错误约束名、序列与现有 ID、实际唯一列 | 只看页面最后一条编号或重置所有 ID |
| 保存后报审计失败 | 该入口是否在同一事务、数据库连接与约束 | 未确认结果就反复点击造成重复数据 |
| 构建突然很慢 | 是否无关全量构建、依赖源超时、超大包导入 | 反复安装依赖或无界重试 |

排查顺序：复现并记下北京时间与账号 → 查浏览器请求状态 → 对应 API 日志 → 同步/实例日志 → 读数据库证据 → 设计最小修复 → 补回归 → 发布验证。错误截图可保留，但需要隐藏姓名、电话、Token 等无关信息。

## 16. 已知风险与后续优先级

下列事项是交接时从实现与配置中识别的边界，不表示本次已修复，也不表示已在生产逐一复现。

### 16.1 优先级 P0：离职交接前确认

- 公司接管 Git、云服务器、DNS、企业微信授权主体、模型计费、通知告警渠道和证书管理权；确认私人账号退出后不影响服务。
- 将曾在聊天、终端记录或其他非受控位置出现过的秘密值轮换，采用公司可持续管理的凭证存储方式。
- 完成一次数据库与关键工作区的独立恢复演练，明确备份保留、访问权限和负责人；仅有几个发布备份不够。
- 核对生产运行时确实使用独立系统用户与受控只读接口，不回退到旧的单服务共享权限模式。

### 16.2 优先级 P1：下一轮稳定性工作

- 数据迁移无版本账本，历史脚本每次全部重放；应设计可审计的迁移状态与安全基线。
- 本地 Vite API 代理未覆盖全部新模块，应补齐并增加本地完整启动验收。
- 账号、招聘、部分会议上传及其他变更与审计仍未统一事务，失败可能留下“业务成功、审计失败”。
- 请假解析对多个不连续区间存在合并为最早开始/最晚结束的风险，可能扩大中间空白时段；需用真实结构脱敏样例回归。
- 部分请假免交整日日报、请假状态盖过另一侧缺卡、固定上下班边界和外出打卡推断，需 HR 明确规则后再改。
- JSON 读取目前有字符计量及分块解码边界，中文跨块可能受影响；应补 UTF-8 分块测试后统一处理。
- 助手 3 GiB 目前主要限制上传可见目录，不是文件系统硬配额；并发上传和工具自行写入仍需容量边界。
- 默认重置密码与首次修改策略应审查，避免新账号长期保留可预测的初始口令。

### 16.3 优先级 P2：性能与可维护性

- server.ts 仍承担大量路由分发，应按模块渐进拆分，避免一次重写影响全站。
- 招聘候选/淘汰列表当前部分分页在前端，接口可能读取全量；招聘批量上传的总 JSON 大小与“最多 200 个文件”上限需协调。
- DOC 简历虽然可上传，但当前解析分支主要支持 PDF / DOCX，DOC 可能没有文本而进入人工复核，需完善格式能力并明确提示。
- 通知列表读取会触发派发计算，账号数和数据量增大后应去抖或使用队列/缓存；当前列表最多 80 条，不是完整通知历史检索。
- 日报汇总通过等待中的 HTTP 请求生成，队列不是持久化作业；重启、页面刷新和长范围生成应设计任务状态、可恢复查询与幂等策略。
- 汇总同范围多快照与早期“一范围一份”的期望可能不一致，应明确保留/覆盖规则。
- 会议年度序号目前有 999 容量边界；历史摘要审计不是完整内容版本库。
- 员工分页的请求规范化与返回元数据存在进一步统一空间；跨模块列表应逐步统一服务端分页契约。
- 统一助手尚未具备完整 supervisor 分发、任务隔离、子任务持久化与结果追踪；先稳定能力契约，再引入复杂编排。
- 旧 README / 项目目录说明 / TODO 与当前路径、服务器和功能存在差异，应单独整理，不直接把历史需求当未完成清单。

### 16.4 优先级 P3：业务新功能

在上述交接与稳定性工作可控之后，再评估绩效核实与电子签名、简历结构化与人才档案、会议内容问答、企业微信业务推送。每个新功能先确认数据来源、可查看对象、数据保留、人工确认和导出需求，避免为“有模型能力”而增加独立模块。

## 17. 继任者接手计划与签收清单

### 17.1 第一天

1. 取得公司授权的仓库、服务器只读/部署权限与秘密管理入口，明确不得继续依赖离职人员个人授权。
2. 阅读本交接摘要、AGENTS.md 和设计规范，确认生产域名、提交和服务健康。
3. 拉取仓库，建立独立开发数据库，核对本地代理缺口；不要把生产数据库当开发库。
4. 跟业务负责人演示员工、日报、考勤、会议、招聘、通知与账号权限，记录不一致之处。
5. 列出未提交文件、未完成需求、备份位置和紧急联系人，确认谁有最终发布权。

### 17.2 第一周

1. 完成一次脱敏数据库恢复与一项小改动的完整测试、提交、部署、验证和回退演练。
2. 检查未来几次自动同步是否成功，验证 CLI 授权不受人员交接影响。
3. 用普通账号验收新账号运行环境和撤权行为；验证员工工具无法修改项目文件或绕过业务权限。
4. 与 HR 确认日报应提交口径、请假边界、排班与离职历史，并固化为测试。
5. 按第 16 章排期，先解决恢复能力、迁移和本地联调，不先大规模重写全部架构。

### 17.3 签收清单

- [ ] 代码仓库所有权、分支和当前发布提交已确认。
- [ ] 当前服务器、DNS、备案域名、证书续期责任人已确认。
- [ ] 数据库、工作区、会话、企业微信授权状态的备份位置与恢复方法已确认。
- [ ] 所有生产秘密均通过受控渠道移交，未出现在 Word、Git 或开发日志中。
- [ ] 企业微信应用、表格、机器人授权与可见范围的公司负责人已确认。
- [ ] 模型供应商、独立日报密钥的计费和额度负责人已确认。
- [ ] 02:15 / 09:00 / 22:00 定时任务和失败告警接收已验收。
- [ ] 已能在独立环境启动并完成关键业务流程。
- [ ] 未提交改动与历史删除文件逐项确认归属，没有被交接提交覆盖。
- [ ] 已知风险、业务口径争议、未开发功能得到双方确认。
- [ ] 完成一次发布、回退与恢复演练，形成可查证记录。

交接人：__________　接收人：__________　业务确认人：__________

交接日期：__________　遗留事项跟踪位置：____________________

## 18. 本次编制范围与后续维护

本文根据当前源码、编号迁移、实际服务配置和开发日志编制，不以历史对话中的功能愿望替代真实实现。本次仅新增交接资料与可重复生成的 Word 文档，不修改员工、日报、考勤、招聘、会议等业务逻辑，不执行生产数据修复。

编制时工作区已存在未提交内容：`.gitignore`、`TODO.md`、概览页修改、若干历史技术说明的删除，以及本地 `data/` 和请假报告等未跟踪内容。这些不属于本交接任务，不应混入交接提交或自动部署。继任者须与交接人确认后再决定保留、归档或提交。

本文可编辑源为 `docs/handover/PROJECT_HANDOVER.md`；Word 导出脚本为同目录 `export-word.mjs`；根目录交付文件为 `和工作项目开发与运维交接文档.docx`。使用 `.docx` 是为了保留标准 Word 标题、目录、表格与页码，避免将 HTML 或纯文本伪装成旧 `.doc` 格式。

重新生成命令：在项目根目录执行 `node docs/handover/export-word.mjs`。脚本复用前端已经安装的 docx 依赖，只读取此 Markdown 并覆盖同名 Word 输出，不访问数据库、外部模型或生产服务。

后续模块、接口或部署方式变化时，更新对应章节和编制基线，再重新生成 Word；不要把此文档永久当作实时配置清单。对于未核验的外部授权期限、备份恢复效果、全量 E2E 和业务口径，应保留“待确认”而不是凭经验填成已完成。
