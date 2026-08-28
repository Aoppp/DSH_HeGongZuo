import type { ReactNode } from 'react'

import { parseMeetingMarkdown } from './meeting-markdown-parser'

const inlinePattern = /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g

function inline(text: string): ReactNode[] {
  return text.split(inlinePattern).map((part, index) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={index}>{part.slice(2, -2)}</del>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

export function MeetingMarkdown({ text }: { readonly text: string }) {
  return <div className="meeting-markdown">{parseMeetingMarkdown(text).map((block, index) => {
    if (block.type === 'heading') {
      const content = inline(block.text)
      if (block.level === 1) return <h1 key={index}>{content}</h1>
      if (block.level === 2) return <h2 key={index}>{content}</h2>
      return <h3 key={index}>{content}</h3>
    }
    if (block.type === 'code') return <pre key={index} data-language={block.language || undefined}><code>{block.text}</code></pre>
    if (block.type === 'table') return <div className="meeting-markdown__table" key={index}><table><thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>
    if (block.type === 'unordered-list') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>
    if (block.type === 'ordered-list') return <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ol>
    if (block.type === 'blockquote') return <blockquote key={index}>{block.lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</blockquote>
    if (block.type === 'separator') return <hr key={index} />
    return <p key={index}>{block.lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inline(line)}</span>)}</p>
  })}</div>
}
