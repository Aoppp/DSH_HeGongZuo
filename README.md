# 和工作

“和工作”是面向企业内部的模块化工作平台，集中提供员工档案、日报、考勤、会议、招聘、平台管理与工作区文件处理等功能。

## 目录总览

```text
apps/
  api/        平台 API、数据迁移、业务模块与同步任务
  web/        React 前端、页面模块与通用组件
packages/
  employee-domain/          员工领域类型、校验与测试夹具
  employee-agent/           员工查询运行能力
  work-assistant/           工作区文件处理能力
  agent-runtime-contract/   运行时通信约定
deploy/      Nginx、systemd 与生产部署模板
scripts/     运行时同步、健康检查、生产辅助脚本
docs/        当前架构与维护说明
data/        本地导入数据（含个人信息，不提交 Git）
```

更详细的职责说明见 [目录地图](docs/PROJECT_STRUCTURE.md)。

## 本地启动

环境要求：Node.js `>= 22.19.0`、Corepack、pnpm `11.7.0`。

```bash
corepack enable
corepack pnpm install
cp .env.example .env
corepack pnpm db:migrate
corepack pnpm platform:dev
```

`.env` 仅保存在本机或服务器，不能提交到仓库。首次运行或账号、运行能力变更后，可执行：

```bash
corepack pnpm platform:prepare
```

## 常用命令

```bash
corepack pnpm build                 # 构建全部应用与共享包
corepack pnpm test                  # 构建并执行测试
corepack pnpm db:migrate            # 执行 PostgreSQL 迁移
corepack pnpm platform:dev          # 启动本地平台
corepack pnpm verify:env            # 检查本地环境
corepack pnpm verify:agent-registry # 检查账号与运行时注册关系
corepack pnpm verify:production-services # 校验生产服务模板
```

日报、考勤等企业微信数据同步命令及生产服务配置，请见 [维护说明](docs/README.md)。

## 数据与安全

- `data/` 中可能包含员工个人信息，只用于本地导入，不应提交 Git。
- `.env`、运行时目录、构建产物与日志均不应提交。
- 员工简历、身份证、银行卡、地址等属于敏感信息；访问、下载与变更应遵循已有权限和审计机制。

## 维护记录

- [目录与维护说明](docs/README.md)
- [开发日志](DEVELOPMENT_LOG.md)
- [待办事项](TODO.md)
- [第三方软件声明](THIRD_PARTY_NOTICES.md)
