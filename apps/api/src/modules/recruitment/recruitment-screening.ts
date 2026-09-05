import type { RecruitmentJobInput } from './recruitment-input.js'
export type ScreeningBucket = 'priority' | 'review' | 'unrelated'
function terms(value: string): string[] { return [...new Set(value.split(/[、，,;；\n\r/]+/).map((v) => v.trim().toLocaleLowerCase('zh-CN')).filter((v) => v.length >= 2))] }
export function screenResume(job: RecruitmentJobInput, source: string): { bucket: ScreeningBucket; reasons: string[] } {
  const text = source.toLocaleLowerCase('zh-CN')
  if (!text) return { bucket: 'review', reasons: ['未能提取简历文本，需人工复核原始简历。'] }
  const required = terms(job.requiredConditions); const preferred = terms(job.preferredConditions); const excluded = terms(job.exclusionConditions)
  const matchedRequired = required.filter((term) => text.includes(term)); const matchedPreferred = preferred.filter((term) => text.includes(term)); const matchedExcluded = excluded.filter((term) => text.includes(term))
  if (matchedExcluded.length) return { bucket: 'unrelated', reasons: [`命中岗位排除条件：${matchedExcluded.join('、')}。`] }
  if (required.length && matchedRequired.length === 0) return { bucket: 'unrelated', reasons: ['未发现岗位必需条件中的相关经历或技能。'] }
  if (!required.length && !matchedPreferred.length) return { bucket: 'review', reasons: ['岗位尚未设置可用于自动筛选的必需或加分条件，需人工复核。'] }
  if (matchedRequired.length === required.length || matchedPreferred.length >= 2) return { bucket: 'priority', reasons: [`匹配必需条件：${matchedRequired.join('、') || '—'}。`, ...(matchedPreferred.length ? [`匹配加分条件：${matchedPreferred.join('、')}。`] : [])] }
  return { bucket: 'review', reasons: [`部分匹配必需条件：${matchedRequired.join('、') || '未发现'}。`, ...(matchedPreferred.length ? [`匹配加分条件：${matchedPreferred.join('、')}。`] : ['\n请人工核对岗位职责相关性。'])] }
}
