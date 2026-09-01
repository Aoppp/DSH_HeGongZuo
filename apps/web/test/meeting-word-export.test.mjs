import assert from 'node:assert/strict'
import test from 'node:test'

import { createMeetingWordBlob, meetingWordFilename } from '../src/modules/meetings/records/meeting-word-export.ts'

const record = {
  id: '26001', title: '项目/进度会', mode: 'bilingual',
  startedAt: '2026-08-27T10:30:00+08:00', endedAt: '2026-08-27T11:30:00+08:00',
  summary: '# 会议摘要\n\n- 结论一\n- 结论二\n\n| 事项 | 负责人 |\n| --- | --- |\n| 交付 | 张三 |',
  transcript: '[10:30:00] 会议开始', participants: [{ name: '张三' }], createdAt: '2026-08-27T11:31:00+08:00',
}

test('Word 导出文件名移除非法字符并区分摘要与原文', () => {
  assert.equal(meetingWordFilename(record, 'summary'), '26001_项目_进度会_会议摘要.docx')
  assert.equal(meetingWordFilename(record, 'transcript'), '26001_项目_进度会_会议原文.docx')
})

test('会议摘要可生成真实 docx 文件', async () => {
  const blob = await createMeetingWordBlob(record, 'summary')
  const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  assert.deepEqual([...signature], [0x50, 0x4b])
  assert.ok(blob.size > 1_000)
})
