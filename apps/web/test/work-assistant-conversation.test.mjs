import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeHistoryMessages } from '../src/modules/work-assistant/main/conversation.ts'

test('工作助理在服务端历史尚未写入时保留刚发送的消息', () => {
  const history = [{ id: 'user-saved', kind: 'user', text: '之前的消息' }]
  const current = [...history, { id: 'pending-1', kind: 'user', text: '刚发送的消息' }]

  assert.deepEqual(mergeHistoryMessages(history, current), current)
})

test('工作助理在历史写入完成后用持久消息替换临时消息', () => {
  const history = [
    { id: 'user-saved', kind: 'user', text: '刚发送的消息' },
    { id: 'assistant-1-1', kind: 'assistant', text: '已处理。' },
  ]
  const current = [{ id: 'pending-1', kind: 'user', text: '刚发送的消息' }]

  assert.deepEqual(mergeHistoryMessages(history, current), history)
})
