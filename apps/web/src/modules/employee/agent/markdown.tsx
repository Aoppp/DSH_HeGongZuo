// 员工查询消息渲染。
import { type ReactNode } from 'react'

import { decodeHtmlEntities } from './html-entities'
import { parseMarkdownBlocks } from './markdown-blocks'

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
      return <code key={index}>{decodeHtmlEntities(part.slice(1, -1))}</code>
    }
    return decodeHtmlEntities(part)
  })
}

interface MarkdownTextProps {
  readonly text: string
}

export function MarkdownText({ text }: MarkdownTextProps) {
  return <div className="md-content">{parseMarkdownBlocks(text).map((block, blockIndex) => {
    if (block.type === 'code') {
      return <pre key={blockIndex}><code>{decodeHtmlEntities(block.text)}</code></pre>
    }
    if (block.type === 'table') {
      return (
        <div className="md-table-wrap" key={blockIndex}>
          <table>
            <thead>
              <tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    if (block.type === 'list') {
      return <ul key={blockIndex}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>
    }
    return (
      <p key={blockIndex}>
        {block.lines.map((paragraphLine, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInline(paragraphLine)}
          </span>
        ))}
      </p>
    )
  })}</div>
}
