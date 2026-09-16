import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionLedger } from '../src/modules/main-assistant/session/session-ledger.ts'

const user = (seq, turn, text) => ({ event: { type: 'user/message', seq, data: { turn, id: `u${seq}`, source: { kind: 'user' }, content: [{ type: 'text', text }] } } })
const answer = (seq, turn, text) => ({ event: { type: 'assistant/message', seq, data: { turn, step: 1, message: { content: [{ type: 'text', text }] } } } })
const end = (seq, turn) => ({ event: { type: 'turn/end', seq, data: { turn, reason: { kind: 'completed' } } } })

test('上一轮历史晚到不清除新消息、不结束新任务', () => {
  const state = new SessionLedger()
  const old = [user(1, 1, '旧问题'), answer(2, 1, '旧回答'), end(3, 1)]
  state.merge(old)
  const requestRevision = state.revision
  state.submit('新问题')
  state.merge(old)
  assert.equal(state.canFinish(requestRevision), false)
  assert.equal(state.canFinish(), false)
  assert.equal(state.messages.at(-1).text, '新问题')
  state.merge([user(4, 2, '新问题'), answer(5, 2, '新回答'), end(6, 2)])
  assert.equal(state.canFinish(), true)
  assert.equal(state.messages.filter((message) => message.text === '新问题').length, 1)
})

test('历史请求期间收到实时正文，合并旧快照不会丢失或重复', () => {
  const state = new SessionLedger()
  state.submit('整理文档')
  state.append([user(1, 1, '整理文档').event, { type: 'assistant/chunk', seq: 2, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '内容' } } }])
  state.merge([user(1, 1, '整理文档')])
  assert.equal(state.messages.at(-1).text, '内容')
  state.merge([answer(3, 1, '内容完整'), end(4, 1)])
  state.merge([user(1, 1, '整理文档')])
  assert.equal(state.messages.at(-1).text, '内容完整')
  assert.equal(state.canFinish(), true)
})

test('重复发送相同文字不会被上一轮相同用户消息误确认', () => {
  const state = new SessionLedger()
  state.merge([user(1, 1, '你好'), answer(2, 1, '你好'), end(3, 1)])
  state.submit('你好')
  state.merge([end(3, 1)])
  assert.match(state.messages.at(-1).id, /^pending-/)
  assert.equal(state.canFinish(), false)
})

test('提交失败保留消息，再发送时仍可看到失败内容', () => {
  const state = new SessionLedger()
  const revision = state.submit('网络失败的消息')
  state.failSubmission(revision)
  assert.equal(state.messages[0].state, 'failed')
  state.submit('新消息')
  assert.equal(state.messages.length, 2)
  assert.equal(state.messages[0].text, '网络失败的消息')
})

test('结束信号和正文乱序到达后可完整恢复', () => {
  const state = new SessionLedger()
  state.submit('问题')
  state.append([end(4, 1).event])
  assert.equal(state.canFinish(), false)
  state.merge([user(1, 1, '问题'), answer(3, 1, '回答'), end(4, 1)])
  assert.equal(state.canFinish(), true)
  assert.equal(state.messages.at(-1).text, '回答')
})

test('已确认用户消息但结束事件先于正文，不应提前结束等待', () => {
  const state = new SessionLedger()
  state.submit('问题')
  state.merge([user(1, 1, '问题'), end(4, 1)])
  assert.equal(state.canFinish(), false)
  state.merge([answer(3, 1, '完整回答')])
  assert.equal(state.canFinish(), true)
})

test('同轮后续步骤尚在运行时不使用前一步正文结束任务', () => {
  const state = new SessionLedger()
  state.submit('问题')
  state.merge([user(1, 1, '问题'), answer(2, 1, '继续检查'), { event: { type: 'step/start', seq: 3, data: { turn: 1, step: 2 } } }])
  assert.equal(state.canFinish(), false)
})

test('旧历史里的较短压缩片段不能截断已显示正文', () => {
  const state = new SessionLedger()
  state.merge([{ event: { type: 'text-chunks', seq0: 10, data: { turn: 1, step: 1, texts: ['前段', '后段'] } } }])
  state.merge([{ event: { type: 'text-chunks', seq0: 10, data: { turn: 1, step: 1, texts: ['前段'] } } }])
  assert.equal(state.messages[0].text, '前段后段')
})
