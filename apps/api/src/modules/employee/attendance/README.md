# 企业微信打卡同步

本模块只负责将企业微信 `getcheckindata` 的原始打卡记录同步到 PostgreSQL，不包含前端展示、考勤规则或员工评分。

生产环境需要在项目根目录 `.env` 配置：

```env
HEGONGZUO_WECOM_CORP_ID=企业微信CorpID
HEGONGZUO_WECOM_CHECKIN_SECRET=具备打卡数据权限的自建应用Secret
```

常用命令：

```bash
# 正常增量同步：从 checkpoint 往前重叠 3 天补拉到当天。
corepack pnpm checkins:sync

# 首次或补拉历史：自动按每 30 天拆分，每批最多 100 名已关联员工。
corepack pnpm checkins:history -- --start-date 2026-08-01 --end-date 2026-08-31

# 仅补拉一名已关联员工（传企业微信 userid）。
corepack pnpm checkins:history -- --start-date 2026-08-01 --end-date 2026-08-31 --employee wecom-user-id
```

唯一键 `wecom_record_key` 由企业微信 `userid`、`checkin_type`、`checkin_time`、`groupid`、`schedule_id` 和 `standard_checkin_time` 生成。地点、备注、异常状态等可被企业微信修订的内容不参与唯一键，而是通过 `content_hash` 判断后更新原记录。

只有同步运行完整成功时，`employee_wecom_checkin_sync_checkpoints` 中的 `default` checkpoint 才会推进。运行日志保存在 `employee_wecom_checkin_sync_runs`。
