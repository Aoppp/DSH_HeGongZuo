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
    assert.match(sections[0].text, /不得删除、覆盖或改名原始上传文件/)
  } finally {
    if (previous === undefined) delete process.env.HEGONGZUO_AGENT_WORKSPACE
    else process.env.HEGONGZUO_AGENT_WORKSPACE = previous
  }
})
