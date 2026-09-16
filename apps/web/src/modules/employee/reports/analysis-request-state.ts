/** 不同操作独立计数；旧结果只能结束自己的请求，不能覆盖后来的选择。 */
export class AnalysisRequestState {
  private revision = 0
  private pending = false
  start(): number | null {
    if (this.pending) return null
    this.pending = true
    return ++this.revision
  }
  replace(): number { return ++this.revision }
  current(revision: number): boolean { return this.revision === revision }
  finish(): void { this.pending = false }
  invalidate(): void { this.revision += 1 }
}
