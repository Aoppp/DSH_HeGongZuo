import assert from 'node:assert/strict'
import test from 'node:test'

import { accessibleModuleForPath, defaultModuleIdForUser, moduleForPath, normalizeModulePath } from '../src/app/module-routes.ts'

const modules = [
  { id: 'management-cockpit', path: '/management' },
  { id: 'overview', path: '/overview' },
  { id: 'employee-data', path: '/employee/data' },
]

test('模块地址会规范化尾部斜杠并定位到已注册模块', () => {
  assert.equal(normalizeModulePath('/employee/data/'), '/employee/data')
  assert.equal(moduleForPath(modules, '/employee/data/').id, 'employee-data')
})

test('CEO 优先进入管理驾驶舱，其他账号进入概览', () => {
  assert.equal(defaultModuleIdForUser('CEO', modules), 'management-cockpit')
  assert.equal(defaultModuleIdForUser('人事专员', modules), 'overview')
})

test('无权限或不存在的地址会回退至默认模块', () => {
  const visibleModules = modules.filter((module) => module.id !== 'employee-data')
  assert.equal(accessibleModuleForPath(modules, visibleModules, '/employee/data', 'overview').id, 'overview')
  assert.equal(accessibleModuleForPath(modules, visibleModules, '/not-found', 'overview').id, 'overview')
})
