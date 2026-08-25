const api = await fetch('http://127.0.0.1:4174/health', { signal: AbortSignal.timeout(4_000) })
if (!api.ok) throw new Error(`API 健康检查失败（HTTP ${api.status}）。`)
