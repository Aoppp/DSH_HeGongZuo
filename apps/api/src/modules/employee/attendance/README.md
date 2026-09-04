# 企业微信考勤数据同步

本模块只负责将企业微信 `getcheckindata` 的原始打卡记录同步到 PostgreSQL，不包含前端展示、考勤规则或员工评分。

生产环境需要在项目根目录 `.env` 配置：

```env
HEGONGZUO_WECOM_CORP_ID=企业微信CorpID
HEGONGZUO_WECOM_CHECKIN_SECRET=具备打卡数据权限的自建应用Secret
HEGONGZUO_WECOM_APPROVAL_SECRET=具备审批数据权限的应用Secret
```

常用命令：

```bash
# 正常增量同步：从 checkpoint 往前重叠 3 天补拉到当天。
corepack pnpm checkins:sync

# 首次或补拉历史：自动按每 30 天拆分，每批最多 100 名已关联员工。
corepack pnpm checkins:history -- --start-date 2026-08-01 --end-date 2026-08-31

# 仅补拉一名已关联员工（传企业微信 userid）。
corepack pnpm checkins:history -- --start-date 2026-08-01 --end-date 2026-08-31 --employee wecom-user-id

# 请假增量同步：包含 30 天重叠窗口，用于捕获审批状态变化。
corepack pnpm leaves:sync

# 首次导入或按日期补拉请假历史。
corepack pnpm leaves:history -- --start-date 2026-07-01 --end-date 2026-09-04
```

唯一键 `wecom_record_key` 由企业微信 `userid`、`checkin_type`、`checkin_time`、`groupid`、`schedule_id` 和 `standard_checkin_time` 生成。地点、备注、异常状态等可被企业微信修订的内容不参与唯一键，而是通过 `content_hash` 判断后更新原记录。

只有同步运行完整成功时，`employee_wecom_checkin_sync_checkpoints` 中的 `default` checkpoint 才会推进。运行日志保存在 `employee_wecom_checkin_sync_runs`。

请假审批以 `sp_no` 幂等写入 `employee_wecom_leaves`，只通过 `employees.wecom_user_id` 关联员工，不使用姓名匹配。审批中、已通过、驳回和撤销均保留；考勤聚合时仅将 `sp_status=2` 的时段视为有效请假。请假 checkpoint 和运行日志分别保存在 `employee_wecom_leave_sync_checkpoints` 和 `employee_wecom_leave_sync_runs`。

生产环境的现有打卡定时任务会在打卡和排班同步后继续执行请假增量同步。统一员工单日状态可通过 `GET /api/employee/day-status?employeeId=...&date=YYYY-MM-DD` 查询打卡、请假和日报关联结果。
