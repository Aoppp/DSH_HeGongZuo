export interface AnalysisSource { readonly header: string; readonly body: string }
export interface AnalysisCompletion { readonly content: string | null; readonly truncated: boolean }
export type AnalysisRequest = (instruction: string, source: string, maxTokens: number, retry?: boolean) => Promise<AnalysisCompletion>

export function sourceBatches(sources: readonly AnalysisSource[], maximumCharacters = 32_000): readonly (readonly AnalysisSource[])[] {
  const batches: AnalysisSource[][] = []
  let current: AnalysisSource[] = [], length = 0
  for (const source of sources) {
    const bodyLimit = maximumCharacters - source.header.length - 2
    if (bodyLimit < 2) throw new Error('日报来源标识过长。')
    // 单份长日报同样拆分，重复携带来源，不能直接截去尾部。
    let offset = 0
    do {
      let end = Math.min(offset + bodyLimit, source.body.length)
      const last = source.body.charCodeAt(end - 1)
      if (end < source.body.length && last >= 0xD800 && last <= 0xDBFF) end -= 1
      const part = { header: source.header, body: source.body.slice(offset, end) }
      const size = part.header.length + part.body.length + 2
      if (current.length && (length + size > maximumCharacters || current.length >= 28)) {
        batches.push(current); current = []; length = 0
      }
      current.push(part); length += size
      offset = end
    } while (offset < source.body.length)
  }
  if (current.length) batches.push(current)
  return batches
}

export async function mapAnalysisBatches<T, R>(items: readonly T[], action: (item: T) => Promise<R>, concurrency = 3): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0, failed = false, failure: unknown
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++
      try { results[index] = await action(items[index]!) } catch (error) { failed = true; failure = error }
    }
  }))
  if (failed) throw failure
  return results
}

// 多个用户同时生成时也限制外部请求并发；只排队少量请求，不无限占用内存。
export class AnalysisRequestQueue {
  private active = 0
  private readonly waiting: (() => void)[] = []
  async run<T>(action: () => Promise<T>): Promise<T> {
    if (this.active >= 3) {
      if (this.waiting.length >= 30) throw new Error('汇总任务较多，请稍后重试。')
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else this.active += 1
    try { return await action() } finally {
      const next = this.waiting.shift()
      if (next) next(); else this.active -= 1
    }
  }
}

export async function completeAnalysisBatch(request: AnalysisRequest, instruction: string, sources: readonly AnalysisSource[], depth = 0): Promise<readonly string[]> {
  const source = sources.map((item) => `${item.header}\n${item.body}`).join('\n\n')
  const first = await request(instruction, source, 2_600)
  if (first.content && !first.truncated) return [first.content]
  // 重试完整资料，绝不靠缩短输入掩盖输出截断。
  if (!first.content || source.length <= 4_000) {
    const retry = await request(instruction, source, 5_200, true)
    if (retry.content && !retry.truncated) return [retry.content]
  }
  if (depth >= 8 || source.length <= 4_000) throw new Error('本批日报未能完整生成，请稍后重试。')
  const middle = Math.ceil(sources.length / 2)
  const smaller = sources.length > 1
    ? [sources.slice(0, middle), sources.slice(middle)]
    : sourceBatches(sources, Math.max(4_000, Math.ceil(source.length / 2) + sources[0]!.header.length + 2))
  if (smaller.length < 2) throw new Error('本批日报未能完整生成，请稍后重试。')
  const results: string[] = []
  for (const part of smaller) results.push(...await completeAnalysisBatch(request, instruction, part, depth + 1))
  return results
}
