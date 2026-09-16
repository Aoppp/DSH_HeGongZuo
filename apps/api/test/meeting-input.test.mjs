import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMeetingInput } from '../dist/modules/meetings/meeting-input.js'

const valid = { title: '项目进度会议', mode: 'bilingual', started_at: '2026-08-27T10:30:00+08:00', ended_at: '2026-08-27T11:30:00+08:00', summary: null, transcript: '# 会议原文', participants: [{ name: '张三' }] }

test('会议上传不要求模式，新记录兼容存储为中文且摘要可为空', () => {
  const { mode: _mode, ...withoutMode } = valid
  assert.equal(parseMeetingInput(withoutMode).mode, 'chinese')
  assert.equal(parseMeetingInput(valid).mode, 'chinese')
  assert.equal(parseMeetingInput({ ...valid, mode: 'chinese', summary: '# 摘要' }).summary, '# 摘要')
})

test('会议上传拒绝无时区时间、倒置时间，忽略不再要求的模式字段', () => {
  assert.equal(parseMeetingInput({ ...valid, mode: 'english' }).mode, 'chinese')
  assert.throws(() => parseMeetingInput({ ...valid, started_at: '2026-08-27T10:30:00' }), /包含时区/)
  assert.throws(() => parseMeetingInput({ ...valid, ended_at: valid.started_at }), /晚于开始时间/)
})
