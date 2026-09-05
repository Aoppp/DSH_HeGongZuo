import assert from 'node:assert/strict'
import test from 'node:test'

import { screenResume } from '../dist/modules/recruitment/recruitment-screening.js'

const job = {
  title: '前端工程师', department: '', responsibilities: '',
  requiredConditions: 'React、TypeScript', preferredConditions: 'Vite、测试',
  exclusionConditions: '无开发经验', workLocation: '', educationRequirement: '', experienceRequirement: '',
}

test('简历筛选将完全匹配归入优先查看', () => {
  assert.equal(screenResume(job, '熟悉 React、TypeScript，使用 Vite 并编写测试。').bucket, 'priority')
})

test('简历筛选将明确排除和无必需条件匹配归入明显不匹配', () => {
  assert.equal(screenResume(job, '无开发经验，负责行政事务。').bucket, 'unrelated')
  assert.equal(screenResume(job, '有多年行政经验。').bucket, 'unrelated')
})

test('无法提取文本的简历必须保留为人工复核', () => {
  const result = screenResume(job, '')
  assert.equal(result.bucket, 'review')
  assert.match(result.reasons[0], /人工复核/)
})
