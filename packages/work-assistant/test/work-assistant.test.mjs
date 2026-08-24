import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../dist/index.js'

test('工作助理为账号工作目录注册默认工作区和处理边界', async () => {
  const workspaces = []
  const sections = []
  const previous = process.env.HEGONGZUO_AGENT_WORKSPACE
  process.env.HEGONGZUO_AGENT_WORKSPACE = '/tmp/hegongzuo-work-assistant-test'
  try {
    await apply({
      workspaceRegistry: { async create(workspacePath, title) { workspaces.push({ workspacePath, title }) } },
      systemPrompt: { section(section) { sections.push(section) } },
      agents: { create() {}, resume() {} },
      on() { return () => undefined },
      effect() { return undefined },
      webServer: { register() { return () => undefined } },
    })
    assert.deepEqual(workspaces, [{ workspacePath: '/tmp/hegongzuo-work-assistant-test', title: '工作文件' }])
    assert.match(sections[0].text, /原始上传文件位于 uploads\//)
    assert.match(sections[0].text, /只能在用户明确要求.*时写入新的结果文件/)
    assert.match(sections[0].text, /只在对话中回复，不得默认生成任何文件/)
    assert.match(sections[0].text, /不得调用 ask_user_question/)
    assert.match(sections[0].text, /中间文件保存到 .work\//)
  } finally {
    if (previous === undefined) delete process.env.HEGONGZUO_AGENT_WORKSPACE
    else process.env.HEGONGZUO_AGENT_WORKSPACE = previous
  }
})
