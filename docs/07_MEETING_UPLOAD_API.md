# 会议记录上传接口

线下会议脚本通过专用会议上传凭证创建只读会议记录。凭证在“平台管理 → 会议上传凭证”中填写名称后生成，只完整显示一次；可以按设备创建多个凭证并单独删除。不得将凭证写入源码、Git 或日志。

```http
POST /api/meeting-records
Authorization: Bearer <会议上传凭证>
Content-Type: application/json
Idempotency-Key: <每场会议固定且唯一的随机值>
```

```json
{
  "title": "项目进度会议",
  "mode": "bilingual",
  "started_at": "2026-08-27T10:30:00+08:00",
  "ended_at": "2026-08-27T11:30:00+08:00",
  "summary": "# 会议概述\n……",
  "transcript": "# 会议原文\n……",
  "participants": [{ "name": "张三" }, { "name": "李四" }]
}
```

- `mode` 仅允许 `chinese` 或 `bilingual`。
- 摘要生成失败时传 `null`；原文不能为空。
- 时间必须带时区，且结束时间晚于开始时间。
- 同一场会议重试时必须复用同一个 `Idempotency-Key`。

创建成功返回 HTTP 201；幂等重试返回 HTTP 200，二者都会返回：

```json
{ "success": true, "id": "26001", "url": "https://平台域名/meetings?record=26001", "created": true }
```
