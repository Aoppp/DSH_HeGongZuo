import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Readable } from 'node:stream'

import { WorkAssistantWorkspaceFiles, workAssistantQuotaBytes } from '../dist/modules/work-assistant/workspace-files.js'

function uploadRequest(name, content) {
  const request = Readable.from([Buffer.from(content)])
  request.headers = { 'x-workspace-file-name': encodeURIComponent(name), 'content-length': String(Buffer.byteLength(content)) }
  return request
}

test('工作助理将表格上传到账号隔离目录并统计空间', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hegongzuo-workspace-'))
  try {
    const files = new WorkAssistantWorkspaceFiles(root)
    const uploaded = await files.upload('liuao', uploadRequest('销售 数据.csv', '名称,金额\n甲,100\n'))
    assert.equal(uploaded.name, '销售 数据.csv')
    const listed = await files.list('liuao')
    assert.equal(listed.files.length, 1)
    assert.equal(listed.files[0].path, '销售 数据.csv')
    assert.equal(listed.usedBytes, Buffer.byteLength('名称,金额\n甲,100\n'))
    assert.equal(listed.quotaBytes, workAssistantQuotaBytes)
    const document = await files.upload('liuao', uploadRequest('会议纪要.docx', 'document fixture'))
    assert.equal(document.name, '会议纪要.docx')
    await assert.rejects(files.upload('liuao', uploadRequest('program.exe', 'x')), /仅支持常用表格与文档格式/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
