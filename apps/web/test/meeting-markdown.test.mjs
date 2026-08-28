import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeMeetingMarkdown, parseMeetingMarkdown } from '../src/modules/meetings/records/meeting-markdown-parser.ts'

test('会议摘要兼容上传端二次转义的换行', () => {
  assert.equal(normalizeMeetingMarkdown('# 摘要\\n\\n- 第一项'), '# 摘要\n\n- 第一项')
  assert.equal(normalizeMeetingMarkdown('正文中的 `\\n` 示例\n下一行'), '正文中的 `\\n` 示例\n下一行')
})

test('会议摘要按结构解析标题、列表、表格和代码块', () => {
  const blocks = parseMeetingMarkdown(`# 会议摘要

**结论**如下：

1. 完成第一项
2. 完成第二项

| 负责人 | 任务 |
| --- | --- |
| 张三 | 跟进上线 |

\`\`\`text
保留原始内容
\`\`\``)

  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'ordered-list', 'table', 'code'])
  assert.deepEqual(blocks[3], { type: 'table', header: ['负责人', '任务'], rows: [['张三', '跟进上线']] })
  assert.equal(blocks[4]?.type === 'code' ? blocks[4].text : '', '保留原始内容')
})

test('未闭合代码块仍能安全结束解析', () => {
  assert.deepEqual(parseMeetingMarkdown('```text\n未闭合'), [{ type: 'code', language: 'text', text: '未闭合' }])
})
