import { readFileSync } from 'node:fs'

import type {
  EmployeeDataset,
  EmployeeRecord,
} from '@hegongzuo/employee-domain'

const defaultFixtureUrl = new URL(
  './data/employees.mock.json',
  import.meta.url,
)

function isEmployeeRecord(value: unknown): value is EmployeeRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.displayName === 'string' &&
    (typeof record.workEmail === 'string' || record.workEmail === null) &&
    typeof record.departmentName === 'string' &&
    typeof record.jobTitle === 'string' &&
    typeof record.status === 'string' &&
    typeof record.responsibilities === 'string' &&
    (record.resumeFileName === null || typeof record.resumeFileName === 'string') &&
    (record.resumeMimeType === null || typeof record.resumeMimeType === 'string') &&
    (record.resumeSize === null || typeof record.resumeSize === 'number')
  )
}

export function loadEmployeeDataset(
  fixtureUrl: URL = defaultFixtureUrl,
): EmployeeDataset {
  const parsed: unknown = JSON.parse(readFileSync(fixtureUrl, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TypeError('员工数据集必须是 JSON 对象。')
  }

  const candidate = parsed as Record<string, unknown>
  const metadata = candidate.metadata as Record<string, unknown> | undefined
  if (
    metadata?.source !== 'synthetic' ||
    metadata.classification !== 'synthetic-non-personal'
  ) {
    throw new TypeError('当前插件只允许加载明确标记的虚构员工数据。')
  }
  if (
    !Array.isArray(candidate.employees) ||
    !candidate.employees.every(isEmployeeRecord)
  ) {
    throw new TypeError('员工数据集包含无效记录。')
  }
  if (metadata.recordCount !== candidate.employees.length) {
    throw new TypeError('员工数据集记录数与 metadata.recordCount 不一致。')
  }

  return parsed as EmployeeDataset
}
