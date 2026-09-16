import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Readable } from 'node:stream'

import { AssistantWorkspaceFiles, mainAssistantQuotaBytes } from '../dist/modules/main-assistant/workspace-files.js'

function uploadRequest(name, content) {
  const request = Readable.from([Buffer.from(content)])
  request.headers = { 'x-workspace-file-name': encodeURIComponent(name), 'content-length': String(Buffer.byteLength(content)) }
  return request
}

test('和工作助手将文件上传到账号隔离目录并统计空间', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hegongzuo-workspace-'))
  try {
    const files = new AssistantWorkspaceFiles(root)
    const uploaded = await files.upload('liuao', uploadRequest('销售 数据.csv', '名称,金额\n甲,100\n'))
    assert.equal(uploaded.name, '销售 数据.csv')
    assert.equal(uploaded.path, 'uploads/销售 数据.csv')
    const listed = await files.list('liuao')
    assert.equal(listed.files.length, 1)
    assert.equal(listed.files[0].path, 'uploads/销售 数据.csv')
    assert.equal(listed.usedBytes, Buffer.byteLength('名称,金额\n甲,100\n'))
    assert.equal(listed.quotaBytes, mainAssistantQuotaBytes)
    const document = await files.upload('liuao', uploadRequest('会议纪要.docx', 'document fixture'))
    assert.equal(document.name, '会议纪要.docx')
    const workspace = files.workspacePath('liuao')
    await mkdir(path.join(workspace, '.work', '.pylibs'), { recursive: true })
    await writeFile(path.join(workspace, '.work', '.pylibs', 'parser.py'), 'internal dependency')
    await writeFile(path.join(workspace, '.work', '_article_text.txt'), 'intermediate text')
    await writeFile(path.join(workspace, 'outputs', '会议纪要摘要.md'), '# 摘要')
    const visible = await files.list('liuao')
    assert.deepEqual(visible.files.map((file) => file.path).sort(), ['outputs/会议纪要摘要.md', 'uploads/会议纪要.docx', 'uploads/销售 数据.csv'])
    await assert.rejects(files.remove('liuao', '.work/_article_text.txt'), /只能删除上传文件或处理结果/)
    await assert.rejects(files.upload('liuao', uploadRequest('program.exe', 'x')), /仅支持常用表格与文档格式/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('不同账号使用相互隔离的主助手工作区', () => {
  const root = '/opt/hegongzuo'
  const mainAssistant = new AssistantWorkspaceFiles(root)
  assert.equal(mainAssistant.workspacePath('test2'), path.join(root, '.runtime', 'agent-sandboxes', 'main-assistant--test2', 'workspace'))
  assert.notEqual(mainAssistant.workspacePath('test2'), mainAssistant.workspacePath('test3'))
})

test('拒绝经中间目录符号链接下载、删除和覆盖外部文件', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hg-path-security-'))
  try {
    const files = new AssistantWorkspaceFiles(root)
    await files.list('testuser')
    const external = path.join(root, 'private')
    await mkdir(external)
    await writeFile(path.join(external, 'secret.txt'), 'fixture-private')
    await symlink(external, path.join(files.workspacePath('testuser'), 'outputs', 'escape'))
    await assert.rejects(files.remove('testuser', 'outputs/escape/secret.txt'), /符号链接/)
    await assert.rejects(files.download('testuser', 'outputs/escape/secret.txt', {}), /符号链接/)
    await symlink(path.join(external, 'secret.txt'), path.join(files.workspacePath('testuser'), 'uploads', 'secret.txt'))
    await assert.rejects(files.upload('testuser', uploadRequest('secret.txt', 'overwrite')), /符号链接/)
    assert.equal(await readFile(path.join(external, 'secret.txt'), 'utf8'), 'fixture-private')
  } finally { await rm(root, { recursive: true, force: true }) }
})
