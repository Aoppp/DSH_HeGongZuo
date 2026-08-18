import assert from 'node:assert/strict'
import test from 'node:test'

import { authenticateAccount } from '../src/app/accounts.ts'
import { accountAgentRuntimeDefinitions } from '../src/config/account-agent-runtimes.ts'
import { getAccountAgentRuntime } from '../src/config/runtime.ts'

test('老板账号自动映射为 owner 角色', () => {
  const result = authenticateAccount('boss', 'demo123')
  assert.equal(result.ok, true)
  assert.equal(result.user?.role, 'owner')
  assert.equal(result.user?.displayName, '企业老板')
})

test('开发者账号自动映射为 developer 角色', () => {
  const result = authenticateAccount('developer', 'demo123')
  assert.equal(result.ok, true)
  assert.equal(result.user?.role, 'developer')
})

test('账号匹配时容忍首尾空格和大小写', () => {
  const result = authenticateAccount('  BOSS  ', 'demo123')
  assert.equal(result.ok, true)
  assert.equal(result.user?.accountId, 'boss')
})

test('错误密码不返回用户信息', () => {
  const result = authenticateAccount('boss', 'wrong-password')
  assert.equal(result.ok, false)
  assert.equal(result.user, undefined)
})

test('老板与开发者使用不同的平台 Agent API 路径', () => {
  const ownerRuntime = getAccountAgentRuntime('boss')
  const developerRuntime = getAccountAgentRuntime('developer')
  assert.ok(ownerRuntime)
  assert.ok(developerRuntime)
  assert.notEqual(ownerRuntime.apiBasePath, developerRuntime.apiBasePath)
})

test('每个 Agent 运行时定义使用唯一账号和端口', () => {
  const accountIds = accountAgentRuntimeDefinitions.map((runtime) => runtime.accountId)
  const ports = accountAgentRuntimeDefinitions.map((runtime) => runtime.port)
  const apiBasePaths = accountAgentRuntimeDefinitions.map((runtime) => runtime.apiBasePath)
  const workspaceDirectories = accountAgentRuntimeDefinitions.map((runtime) => runtime.workspaceDirectory)
  assert.equal(new Set(accountIds).size, accountIds.length)
  assert.equal(new Set(ports).size, ports.length)
  assert.equal(new Set(apiBasePaths).size, apiBasePaths.length)
  assert.equal(new Set(workspaceDirectories).size, workspaceDirectories.length)
  assert.ok(apiBasePaths.every((basePath) => basePath.startsWith('/dsh/')))
  assert.ok(workspaceDirectories.every((directory) => directory.startsWith('.runtime/workspaces/')))
})

test('未配置账号不回退到共享 Agent 运行时', () => {
  assert.equal(getAccountAgentRuntime('unconfigured-account'), undefined)
})
