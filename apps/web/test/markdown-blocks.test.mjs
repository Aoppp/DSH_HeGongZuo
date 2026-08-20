import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMarkdownBlocks } from '../src/modules/employee/agent/markdown-blocks.ts'

test('流式表格只有首行时作为普通段落并正常结束', () => {
  const blocks = parseMarkdownBlocks('| 指标 | 数值 |')
  assert.deepEqual(blocks, [{ type: 'paragraph', lines: ['| 指标 | 数值 |'] }])
})

test('流式表格分隔行尚未完整时不会重复解析同一行', () => {
  const blocks = parseMarkdownBlocks('| 指标 | 数值 |\n| ---')
  assert.deepEqual(blocks, [{ type: 'paragraph', lines: ['| 指标 | 数值 |', '| ---'] }])
})

test('完整表格解析表头和数据行', () => {
  const blocks = parseMarkdownBlocks('| 指标 | 数值 |\n| --- | ---: |\n| 人数 | 91 |')
  assert.deepEqual(blocks, [{
    type: 'table',
    header: ['指标', '数值'],
    rows: [['人数', '91']],
  }])
})

test('无尾部竖线的表格不会丢失最后一列', () => {
  const blocks = parseMarkdownBlocks('| 指标 | 数值\n| --- | ---:\n| 人数 | 91')
  assert.deepEqual(blocks, [{
    type: 'table',
    header: ['指标', '数值'],
    rows: [['人数', '91']],
  }])
})
