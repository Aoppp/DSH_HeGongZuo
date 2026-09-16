import assert from 'node:assert/strict'
import test from 'node:test'
import { AnalysisRequestState } from '../src/modules/employee/reports/analysis-request-state.ts'

test('选择历史汇总后，较早的快照或生成响应不再覆盖选择', () => {
  const state = new AnalysisRequestState()
  const loading = state.replace()
  const generation = state.start()
  assert.equal(state.current(loading), false)
  state.invalidate()
  assert.equal(state.current(generation), false)
  assert.equal(state.start(), null)
  state.finish()
  assert.notEqual(state.start(), null)
})

test('汇总和查询独立计数，重复回车不能重复提交，分页只接受最新请求', () => {
  const summary = new AnalysisRequestState(), query = new AnalysisRequestState(), pages = new AnalysisRequestState()
  const first = summary.start()
  assert.equal(summary.start(), null)
  assert.notEqual(query.start(), null)
  assert.equal(summary.current(first), true)
  const previousPage = pages.replace(), currentPage = pages.replace()
  assert.equal(pages.current(previousPage), false)
  assert.equal(pages.current(currentPage), true)
})
