// 员工查询消息渲染。
import { type ReactNode } from 'react'

// 轻量 Markdown 渲染：加粗、斜体、行内代码、表格、无序列表、代码块与段落。
// 所有文本先做 HTML 转义，避免模型输出注入脚本。
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const inlinePattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g

function renderInline(text: string): ReactNode[] {
  const parts = text.split(inlinePattern)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{renderInline(part.slice(2, -2))}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{renderInline(part.slice(1, -1))}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{escapeHtml(part.slice(1, -1))}</code>
    }
    return escapeHtml(part)
  })
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(line)
}

interface MarkdownTextProps {
  readonly text: string
}

export function MarkdownText({ text }: MarkdownTextProps) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    // 代码块
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={blocks.length}><code>{escapeHtml(codeLines.join('\n'))}</code></pre>,
      )
      continue
    }

    // 表格：以 | 开头，且下一行是分隔行
    if (trimmed.startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? '')) {
      const headerCells = parseTableRow(trimmed)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push(parseTableRow((lines[index] ?? '').trim()))
        index += 1
      }
      blocks.push(
        <div className="md-table-wrap" key={blocks.length}>
          <table>
            <thead>
              <tr>{headerCells.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // 无序列表
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? '').trim())) {
        items.push((lines[index] ?? '').trim().replace(/^[-*]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={blocks.length}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>,
      )
      continue
    }

    // 空行跳过
    if (trimmed === '') {
      index += 1
      continue
    }

    // 普通段落：聚合到下一个空行/块级标记
    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      const currentTrimmed = current.trim()
      if (currentTrimmed === '' || currentTrimmed.startsWith('```') || currentTrimmed.startsWith('|')
        || /^[-*]\s+/.test(currentTrimmed)) {
        break
      }
      paragraphLines.push(current)
      index += 1
    }
    blocks.push(
      <p key={blocks.length}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(paragraphLine)}
          </span>
        ))}
      </p>,
    )
  }

  return <div className="md-content">{blocks}</div>
}
