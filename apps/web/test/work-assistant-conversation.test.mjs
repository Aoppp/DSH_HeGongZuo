import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeHistoryMessages, messagesFromHistory } from '../src/modules/work-assistant/main/conversation.ts'

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

test('工作助理显示尚未完成的回复片段', () => {
  const messages = messagesFromHistory(/** @type {any} */ ([
    { event: { type: 'user/message', seq: 1, data: { id: 'user-1', source: { kind: 'user' }, content: [{ type: 'text', text: '整理文件' }] } } },
    { event: { type: 'assistant/chunk', seq: 2, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '正在读取' } } } },
    { event: { type: 'assistant/chunk', seq: 3, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '文档。' } } } },
  ]))

  assert.deepEqual(messages, [
    { id: 'user-user-1', kind: 'user', text: '整理文件' },
    { id: 'assistant-1-1', kind: 'assistant', text: '正在读取文档。', state: 'running' },
  ])
})
