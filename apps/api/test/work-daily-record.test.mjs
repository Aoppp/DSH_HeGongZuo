import assert from 'node:assert/strict'
import test from 'node:test'

import { parseWeComSmartSheetPage, parseWeComWorkDailyRecord } from '../dist/modules/employee/work-reports/work-daily-record.js'
import { synchronizeWorkDailyPages } from '../dist/modules/employee/work-reports/work-daily-sync.js'
import { parseWeComCliOutput } from '../dist/modules/employee/work-reports/wecom-smartsheet-client.js'

const rawRecord = {
  create_time: '2026-08-08 19:09:07', creator_name: '张三', record_id: 'record-001', update_time: '2026-08-08 19:41:49',
  values: {
    '填写人': [{ userId: 'zhangsan', userName: '张三' }],
    '所在部门': [{ id: 'department-1', text: '研发部', style: 1 }],
    '填写时间': '2026-08-08 19:09:04', '汇报日期': '2026-08-08 00:00:00',
    '今日工作总结': [{ text: '完成' }, { text: '联调' }], '明日工作计划': [{ text: '继续测试' }], '其他事项': null,
    '附件': [{ name: '测试.pdf', fileUrl: 'https://example.test/file', fileType: 'application/pdf', fileExt: 'pdf', size: 128, docType: 1 }],
  },
}

test('企业微信日报字段转换为稳定数据模型', () => {
  const report = parseWeComWorkDailyRecord(rawRecord)
  assert.equal(report.recordId, 'record-001')
  assert.equal(report.authorUserId, 'zhangsan')
  assert.equal(report.departmentName, '研发部')
  assert.equal(report.reportDate, '2026-08-08')
  assert.equal(report.todaySummary, '完成联调')
  assert.deepEqual(report.attachments[0], { name: '测试.pdf', url: 'https://example.test/file', type: 'application/pdf', extension: 'pdf', size: 128, documentType: 1 })
  assert.match(report.contentHash, /^[a-f0-9]{64}$/)
})

test('字段顺序不影响日报内容哈希', () => {
  const reversedValues = Object.fromEntries(Object.entries(rawRecord.values).reverse())
  assert.equal(parseWeComWorkDailyRecord(rawRecord).contentHash, parseWeComWorkDailyRecord({ ...rawRecord, values: reversedValues }).contentHash)
})

test('智能表格分页响应保留游标与记录', () => {
  assert.deepEqual(parseWeComSmartSheetPage({ errcode: 0, records: [rawRecord], has_more: true, next_cursor: 'cursor-2', total: 1078 }), {
    records: [rawRecord], hasMore: true, nextCursor: 'cursor-2', total: 1078,
  })
  assert.throws(() => parseWeComSmartSheetPage({ errcode: 40001, errmsg: '读取失败' }), /读取失败/)
})

test('同步客户端兼容 wecom-cli 多行缩进 JSON', () => {
  const output = JSON.stringify({ errcode: 0, records: [rawRecord], has_more: false, total: 1 }, null, 2)
  assert.equal(parseWeComCliOutput(output).records.length, 1)
})

test('同步统计区分新增、更新、未变和失败', async () => {
  const outcomes = ['inserted', 'updated', 'unchanged']
  const finished = []
  const repository = {
    startRun: async () => 9,
    upsert: async () => outcomes.shift() ?? 'unchanged',
    linkUniqueReporters: async () => 2,
    finishRun: async (...args) => { finished.push(args) },
  }
  async function *pages() { yield { records: [rawRecord, { ...rawRecord, record_id: 'record-002' }, { ...rawRecord, record_id: 'record-003' }, {}], hasMore: false, nextCursor: null, total: 4 } }
  const result = await synchronizeWorkDailyPages(repository, 'history', pages())
  assert.deepEqual({ status: result.status, pulled: result.pulled, inserted: result.inserted, updated: result.updated, unchanged: result.unchanged, failed: result.failed }, { status: 'partial', pulled: 4, inserted: 1, updated: 1, unchanged: 1, failed: 1 })
  assert.equal(finished[0][1], 'partial')
})
