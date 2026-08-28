export type MeetingMarkdownBlock =
  | { readonly type: 'heading'; readonly level: number; readonly text: string }
  | { readonly type: 'paragraph'; readonly lines: readonly string[] }
  | { readonly type: 'unordered-list'; readonly items: readonly string[] }
  | { readonly type: 'ordered-list'; readonly items: readonly string[] }
  | { readonly type: 'blockquote'; readonly lines: readonly string[] }
  | { readonly type: 'code'; readonly language: string; readonly text: string }
  | { readonly type: 'table'; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly type: 'separator' }

export function normalizeMeetingMarkdown(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  // 兼容上传端把整篇 Markdown 的换行二次转义为“\n”的情况，不改变正常多行正文中的代码文本。
  return normalized.includes('\n') || !normalized.includes('\\n')
    ? normalized
    : normalized.replaceAll('\\n', '\n').replaceAll('\\t', '\t')
}

function tableCells(line: string): string[] {
  const cells = line.trim().split('|')
  if (cells[0] === '') cells.shift()
  if (cells.at(-1) === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))
}

function isTableStart(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? ''
  return line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')
}

function startsBlock(lines: readonly string[], index: number): boolean {
  const trimmed = (lines[index] ?? '').trim()
  return /^#{1,6}\s+/.test(trimmed)
    || /^```/.test(trimmed)
    || /^[-*+]\s+/.test(trimmed)
    || /^\d+[.)]\s+/.test(trimmed)
    || /^>\s?/.test(trimmed)
    || /^([-*_])(?:\s*\1){2,}$/.test(trimmed)
    || isTableStart(lines, index)
}

export function parseMeetingMarkdown(text: string): MeetingMarkdownBlock[] {
  const lines = normalizeMeetingMarkdown(text).split('\n')
  const blocks: MeetingMarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (!trimmed) { index += 1; continue }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' })
      index += 1
      continue
    }

    const fence = /^```\s*([^\s`]*)/.exec(trimmed)
    if (fence) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test((lines[index] ?? '').trim())) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] ?? '', text: codeLines.join('\n') })
      continue
    }

    if (isTableStart(lines, index)) {
      const header = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*+]\s+/.test((lines[index] ?? '').trim())) {
        items.push((lines[index] ?? '').trim().replace(/^[-*+]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s+/.test((lines[index] ?? '').trim())) {
        items.push((lines[index] ?? '').trim().replace(/^\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test((lines[index] ?? '').trim())) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'blockquote', lines: quoteLines })
      continue
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      blocks.push({ type: 'separator' })
      index += 1
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && (lines[index] ?? '').trim() && !startsBlock(lines, index)) {
      paragraphLines.push(lines[index] ?? '')
      index += 1
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(line)
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines })
  }

  return blocks
}
