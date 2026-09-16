import assert from 'node:assert/strict'
import test from 'node:test'
import { AnalysisRequestQueue, completeAnalysisBatch, mapAnalysisBatches, sourceBatches } from '../dist/modules/employee/report-analysis/report-analysis-batches.js'
import { parseReportAnalysisInput, ReportAnalysisService } from '../dist/modules/employee/report-analysis/report-analysis-service.js'

test('单份超长日报及批末资料完整保留，来源重复携带且不破坏表情字符', () => {
  const original = { header: '【测试｜2026-09-01｜R1】', body: '正文😀'.repeat(30_000) + '最后一条不可丢失' }
  const batches = sourceBatches([original, { header: '【末条】', body: '最后一份日报' }])
  assert.ok(batches.length > 3)
  assert.equal(batches.flat().filter((part) => part.header === original.header).map((part) => part.body).join(''), original.body)
  assert.equal(batches.at(-1).at(-1).body, '最后一份日报')
  for (const batch of batches) for (const part of batch) assert.ok(part.body.isWellFormed())
})

test('截断输出不会当成功，拆分后包含所有输入；空返回重试原输入', async () => {
  const seen = []
  const sources = [{ header: '【A】', body: 'A'.repeat(5_000) }, { header: '【B】', body: 'B'.repeat(5_000) }]
  const result = await completeAnalysisBatch(async (_instruction, source) => { seen.push(source); return { content: source.includes('【A】') && source.includes('【B】') ? '不完整' : source.includes('【A】') ? '- A结果' : '- B结果', truncated: source.length > 7_000 } }, '摘要', sources)
  assert.deepEqual(result, ['- A结果', '- B结果'])
  assert.ok(seen[2].includes('B'.repeat(5_000)))
  const retries = []
  await assert.rejects(completeAnalysisBatch(async (_instruction, source) => { retries.push(source); return { content: null, truncated: false } }, '', [{ header: '来源', body: '原文末尾' }]), /未能完整生成/)
  assert.equal(retries.length, 2)
  assert.equal(retries[0], retries[1])
})

test('并发队列上限为3，失败也释放位置，结果保持原有顺序', async () => {
  const queue = new AnalysisRequestQueue()
  let active = 0, maximum = 0
  const results = await mapAnalysisBatches(Array.from({ length: 12 }, (_, i) => i), (i) => queue.run(async () => {
    active++; maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active--; return i
  }), 12)
  assert.equal(maximum, 3)
  assert.deepEqual(results, Array.from({ length: 12 }, (_, i) => i))
  await assert.rejects(queue.run(async () => { throw new Error('失败') }), /失败/)
  assert.equal(await queue.run(async () => '继续'), '继续')
})

test('汇总与查询都会处理原截断上限之后的日报，不调用真实外部服务', async () => {
  const reports = Array.from({ length: 40 }, (_, i) => ({ record_id: `R${i}`, employee: { name: '测试' }, department: { name: '研发部', level2: null }, report_date: '2026-09-01', today_summary: `唯一尾标${i}` + '资料'.repeat(10_000), tomorrow_plan: '', other: '' }))
  const service = new ReportAnalysisService({ analysisRecords: async () => reports })
  const seen = []
  service.requestContent = async (_instruction, source) => { seen.push(source); return { content: '- 已处理【测试｜2026-09-01｜R39】', truncated: false } }
  const input = { startDate: '2026-09-01', endDate: '2026-09-01' }
  const summary = await service.analyze(input)
  assert.equal(summary.reportCount, 40)
  assert.ok(seen.some((item) => item.includes('唯一尾标39')))
  assert.ok(seen.every((item) => item.length <= 32_056))
  seen.length = 0
  await service.analyze({ ...input, question: '有哪些工作？' })
  assert.ok(seen.some((item) => item.includes('唯一尾标39')))
})

test('日期范围按包含首尾的90天校验', () => {
  assert.doesNotThrow(() => parseReportAnalysisInput({ startDate: '2026-01-01', endDate: '2026-03-31' }))
  assert.throws(() => parseReportAnalysisInput({ startDate: '2026-01-01', endDate: '2026-04-01' }), /90 天/)
})
