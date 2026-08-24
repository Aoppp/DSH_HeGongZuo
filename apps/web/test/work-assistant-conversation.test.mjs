import assert from 'node:assert/strict'
import test from 'node:test'

import { latestTurnFinished, mergeHistoryMessages, messagesFromHistory } from '../src/modules/work-assistant/main/conversation.ts'

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

test('工作助理显示 DSH 压缩后的正文片段', () => {
  const messages = messagesFromHistory(/** @type {any} */ ([
    { event: { type: 'text-chunks', seq: 2, data: { turn: 1, step: 2, texts: ['正在', '整理', '文件。'] } } },
  ]))

  assert.deepEqual(messages, [
    { id: 'assistant-1-2', kind: 'assistant', text: '正在整理文件。', state: 'running' },
  ])
})

test('工作助理以最新轮次的完成事件结束等待，不依赖滞后的运行状态', () => {
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'user/message', seq: 10, data: { source: { kind: 'user' } } } },
    { event: { type: 'assistant/message', seq: 11, data: {} } },
    { event: { type: 'turn/end', seq: 12, data: { reason: { kind: 'completed' } } } },
  ])), true)
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'turn/end', seq: 12, data: { reason: { kind: 'completed' } } } },
    { event: { type: 'user/message', seq: 13, data: { source: { kind: 'user' } } } },
  ])), false)
})
