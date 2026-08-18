# 第三方软件声明

“和工作”使用以下第三方开源软件。第三方组件的名称、版权和许可证仅用于履行许可证义务，不代表它们是“和工作”的用户界面品牌。

## DeepSeek Harness（DSH）

- 项目：DeepSeek Harness
- 上游仓库：https://github.com/deepseek-ai/deepseek-harness
- 当前锁定版本：`0.1.0-rc.6`
- 许可证：MIT License
- 版权所有：Copyright (c) 2026 DeepSeek

DSH 作为“和工作”的内部 Agent 运行框架，提供会话、模型、工具、事件和 Workspace 等基础能力。“和工作”没有删除依赖包中的许可证或版权文本，也不将 DSH 上游代码声明为自主原创。

完整许可证文本保留在已安装依赖包及上游仓库的 `LICENSE` 文件中。发布包含 DSH 或其重要代码副本的产品时，必须随发布物保留相应版权和许可证文本，并同步核对 `THIRD_PARTY_NOTICES.md` 上游清单。

## ExcelJS

- 项目：ExcelJS
- 上游仓库：https://github.com/exceljs/exceljs
- 许可证：MIT License
- 用途：`@hegongzuo/api` 的 `scripts/import-employees.mjs` 用于解析 `data/` 下员工 Excel 文件并导入 PostgreSQL，属于开发/维护脚本依赖（devDependencies），不进入 API 运行时产物。

完整许可证文本保留在已安装依赖包的 `LICENSE` 文件中。
