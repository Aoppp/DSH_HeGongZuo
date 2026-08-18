import assert from 'node:assert/strict'
import test from 'node:test'

import { buildConversation } from '../src/modules/employee-agent/conversation.ts'

test('将 DSH 原始事件转换为和工作对话消息', () => {
  const entries = [
    {
      event: {
        type: 'user/message',
        seq: 1,
        time: 100,
        data: {
          id: 'message-1',
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: '查询技术部员工' }],
        },
      },
    },
    {
      event: {
        type: 'assistant/chunk',
        seq: 2,
        time: 110,
        data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '正在查询' } },
      },
    },
    {
      event: {
        type: 'assistant/message',
        seq: 3,
        time: 120,
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'message-2',
            role: 'assistant',
            source: { kind: 'model', provider: 'test', model: 'test' },
            content: [{ type: 'text', text: '技术部共有 3 名测试员工。' }],
          },
        },
      },
    },
  ]

  const conversation = buildConversation(/** @type {any} */ (entries))
  assert.deepEqual(conversation.map((message) => [message.kind, message.text]), [
    ['user', '查询技术部员工'],
    ['assistant', '技术部共有 3 名测试员工。'],
  ])
})

test('工具调用在完成后更新为成功状态', () => {
  const entries = [
    {
      event: {
        type: 'tool/call',
        seq: 1,
        time: 100,
        data: { turn: 1, step: 1, callId: 'call-1', name: 'employee_search', arguments: '{}' },
      },
    },
    {
      event: {
        type: 'tool/result',
        seq: 2,
        time: 110,
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'message-3',
            role: 'user',
            source: { kind: 'tool', callId: 'call-1' },
            content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '{}' }] }],
          },
        },
      },
    },
  ]

  const conversation = buildConversation(/** @type {any} */ (entries))
  assert.equal(conversation.length, 1)
  assert.equal(conversation[0].label, 'employee_search')
  assert.equal(conversation[0].state, 'completed')
})
