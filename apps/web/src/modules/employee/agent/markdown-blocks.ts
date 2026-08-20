// 员工查询消息的轻量 Markdown 分块。解析器必须在每轮循环推进游标，避免流式半成品导致死循环。
export type MarkdownBlock =
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'table'; readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly type: 'list'; readonly items: readonly string[] }
  | { readonly type: 'paragraph'; readonly lines: readonly string[] }

function tableCells(line: string): string[] {
  const cells = line.trim().split('|')
  if (cells[0] === '') cells.shift()
  if (cells.at(-1) === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(line)
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return (lines[index] ?? '').trim().startsWith('|')
    && index + 1 < lines.length
    && isTableSeparator(lines[index + 1] ?? '')
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', text: codeLines.join('\n') })
      continue
    }

    if (isTableStart(lines, index)) {
      const header = tableCells(trimmed)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? '').trim())) {
        items.push((lines[index] ?? '').trim().replace(/^[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }

    if (trimmed === '') {
      index += 1
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      const currentTrimmed = current.trim()
      if (currentTrimmed === '' || currentTrimmed.startsWith('```')
        || /^[-*]\s+/.test(currentTrimmed) || isTableStart(lines, index)) {
        break
      }
      paragraphLines.push(current)
      index += 1
    }

    // 防御性推进：即使未来增加新的块类型，也不能让同一行被无限重复解析。
    if (paragraphLines.length === 0) {
      paragraphLines.push(line)
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines })
  }

  return blocks
}
