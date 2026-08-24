import assert from 'node:assert/strict'
import test from 'node:test'

import { appendSessionEvents, latestTurnFinished, mergeHistoryEntries, mergeHistoryMessages, mergeHistoryWindow, messagesFromHistory, parseMarkdownTable } from '../src/modules/work-assistant/main/conversation.ts'

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

test('工作助理从服务端补齐完成回复时替换本地流式片段', () => {
  const history = [{ id: 'assistant-2-1', kind: 'assistant', text: '完整回复。' }]
  const current = [{ id: 'assistant-2-1', kind: 'assistant', text: '完整回', state: 'running' }]

  assert.deepEqual(mergeHistoryMessages(history, current), history)
})

test('工作助理使用最新历史窗口对账时保留较早对话', () => {
  const current = [
    { id: 'user-old', kind: 'user', text: '较早的问题' },
    { id: 'assistant-1-1', kind: 'assistant', text: '较早的回答' },
    { id: 'user-new', kind: 'user', text: '当前问题' },
    { id: 'assistant-2-1', kind: 'assistant', text: '半截', state: 'running' },
  ]
  const latest = [
    { id: 'user-new', kind: 'user', text: '当前问题' },
    { id: 'assistant-2-1', kind: 'assistant', text: '完整回答' },
  ]
  assert.deepEqual(mergeHistoryWindow(latest, current), [current[0], current[1], ...latest])
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

test('工作助理按压缩事件的 seq0 顺序合并回复片段', () => {
  const messages = messagesFromHistory(/** @type {any} */ ([
    { event: { type: 'text-chunks', seq0: 3, data: { turn: 1, step: 1, texts: ['后半段'] } } },
    { event: { type: 'text-chunks', seq0: 2, data: { turn: 1, step: 1, texts: ['前半段'] } } },
  ]))
  assert.deepEqual(messages, [{ id: 'assistant-1-1', kind: 'assistant', text: '前半段后半段', state: 'running' }])
})

test('历史压缩片段与实时事件竞态时不会重复正文', () => {
  const realtime = /** @type {any} */ ([
    { event: { type: 'assistant/chunk', seq: 11, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '实时片段' } } } },
  ])
  const packed = /** @type {any} */ ([
    { event: { type: 'text-chunks', seq0: 10, data: { turn: 1, step: 1, texts: ['前缀', '实时片段'] } } },
  ])
  const merged = mergeHistoryEntries(realtime, packed)
  assert.deepEqual(messagesFromHistory(merged), [{ id: 'assistant-1-1', kind: 'assistant', text: '前缀实时片段', state: 'running' }])
  assert.deepEqual(appendSessionEvents(packed, /** @type {any} */ ([realtime[0].event])), packed)
})

test('工作助理以最新轮次的完成事件结束等待，不依赖滞后的运行状态', () => {
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'turn/start', seq: 10, data: { turn: 3 } } },
    { event: { type: 'assistant/message', seq: 11, data: { turn: 3 } } },
    { event: { type: 'turn/end', seq: 12, data: { turn: 3, reason: { kind: 'completed' } } } },
  ])), true)
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'turn/end', seq: 12, data: { turn: 3, reason: { kind: 'completed' } } } },
    { event: { type: 'turn/start', seq: 13, data: { turn: 4 } } },
  ])), false)
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'turn/start', seq: 20, data: { turn: 5 } } },
    { event: { type: 'assistant/message', seq: 21, data: { turn: 5 } } },
  ])), true)
})

test('长回复历史截掉用户消息后仍能按轮次识别完成', () => {
  assert.equal(latestTurnFinished(/** @type {any} */ ([
    { event: { type: 'text-chunks', seq0: 500, data: { turn: 8, step: 1, texts: ['回复后半段'] } } },
    { event: { type: 'assistant/message', seq: 620, data: { turn: 8, step: 1, message: {} } } },
  ])), true)
})

test('工作助理将 Markdown 表格识别为结构化表格', () => {
  assert.deepEqual(parseMarkdownTable(['| 姓名 | 部门 |', '| --- | :---: |', '| 张三 | 技术部 |']), {
    headers: ['姓名', '部门'],
    rows: [['张三', '技术部']],
  })
  assert.equal(parseMarkdownTable(['普通文本', '不是表格']), null)
})
