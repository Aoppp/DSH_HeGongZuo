import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldSubmitOnEnter } from '../src/shared/forms/submit-on-enter.ts'

function keyboard(overrides = {}) {
  return { key: 'Enter', keyCode: 13, shiftKey: false, nativeEvent: { isComposing: false }, ...overrides }
}

test('普通回车提交，Shift 回车仅换行', () => {
  assert.equal(shouldSubmitOnEnter(keyboard()), true)
  assert.equal(shouldSubmitOnEnter(keyboard({ shiftKey: true })), false)
})

test('输入法确认候选词时不提交消息', () => {
  assert.equal(shouldSubmitOnEnter(keyboard({ nativeEvent: { isComposing: true } })), false)
  assert.equal(shouldSubmitOnEnter(keyboard({ keyCode: 229 })), false)
})

test('非回车按键不提交消息', () => {
  assert.equal(shouldSubmitOnEnter(keyboard({ key: 'a', keyCode: 65 })), false)
})
