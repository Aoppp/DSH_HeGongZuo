import type { ParagraphChild } from 'docx'

import { parseMeetingMarkdown } from './meeting-markdown-parser.ts'
import type { MeetingRecord } from './meeting-records-api.ts'

type MeetingExportView = 'summary' | 'transcript'
type DocxModule = typeof import('docx')

const inlinePattern = /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g
const documentFont = 'Microsoft YaHei'

function documentTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function inlineRuns(text: string, docx: DocxModule): ParagraphChild[] {
  const { ExternalHyperlink, TextRun } = docx
  return text.split(inlinePattern).filter(Boolean).map((part) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
    if (link) return new ExternalHyperlink({
      link: link[2] ?? '',
      children: [new TextRun({ text: link[1] ?? '', color: '2867A1', underline: {} })],
    })
    const bold = (part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))
    const strike = part.startsWith('~~') && part.endsWith('~~')
    const code = part.startsWith('`') && part.endsWith('`')
    const italics = !bold && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))
    const trim = bold || strike ? 2 : code || italics ? 1 : 0
    return new TextRun({
      text: trim ? part.slice(trim, -trim) : part,
      bold, strike, italics,
      font: code ? 'Consolas' : documentFont,
      ...(code ? { shading: { fill: 'EDF7F4' } } : {}),
    })
  })
}

function linesAsRuns(lines: readonly string[], docx: DocxModule): ParagraphChild[] {
  const children: ParagraphChild[] = []
  lines.forEach((line, index) => {
    if (index > 0) children.push(new docx.TextRun({ break: 1 }))
    children.push(...inlineRuns(line, docx))
  })
  return children
}

function contentBlocks(text: string, docx: DocxModule) {
  const { BorderStyle, HeadingLevel, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx
  return parseMeetingMarkdown(text).map((block) => {
    if (block.type === 'heading') return new Paragraph({
      heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      children: inlineRuns(block.text, docx), spacing: { before: block.level === 1 ? 260 : 200, after: 100 },
    })
    if (block.type === 'code') return new Paragraph({
      children: [new TextRun({ text: block.text, font: 'Consolas', size: 18 })],
      shading: { fill: 'F3F5F7' }, spacing: { before: 100, after: 100 }, indent: { left: 240, right: 240 },
    })
    if (block.type === 'table') {
      const border = { style: BorderStyle.SINGLE, size: 1, color: 'DCE3E9' }
      const row = (cells: readonly string[], header: boolean) => new TableRow({
        tableHeader: header, cantSplit: true,
        children: block.header.map((_, index) => new TableCell({
          ...(header ? { shading: { fill: 'F3F6F8' } } : {}),
          margins: { top: 90, bottom: 90, left: 110, right: 110 },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: cells[index] ?? '', bold: header, font: documentFont })] })],
        })),
      })
      return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(block.header, true), ...block.rows.map((cells) => row(cells, false))] })
    }
    if (block.type === 'unordered-list' || block.type === 'ordered-list') return block.items.map((item) => new Paragraph({
      children: inlineRuns(item, docx),
      ...(block.type === 'unordered-list' ? { bullet: { level: 0 } } : { numbering: { reference: 'meeting-numbering', level: 0 } }),
      spacing: { after: 60 },
    }))
    if (block.type === 'blockquote') return new Paragraph({
      children: linesAsRuns(block.lines, docx),
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '79AD9F', space: 8 } },
      shading: { fill: 'F5F9F8' }, indent: { left: 240 }, spacing: { before: 100, after: 100 },
    })
    if (block.type === 'separator') return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E1E6ED', space: 8 } }, spacing: { before: 100, after: 100 },
    })
    return new Paragraph({ children: linesAsRuns(block.lines, docx), spacing: { after: 100, line: 340 } })
  }).flat()
}

function metadataTable(record: MeetingRecord, docx: DocxModule) {
  const { BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'DCE3E9' }
  const rows: readonly [string, string][] = [
    ['会议编号', record.id],
    ['会议时间', `${documentTime(record.startedAt)} — ${documentTime(record.endedAt)}`],
    ['会议模式', record.mode === 'chinese' ? '中文' : '双语'],
    ['参会人员', record.participants.length ? record.participants.map((item) => item.name).join('、') : '未记录'],
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1800, 7200],
    rows: rows.map(([label, value]) => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: 'F3F6F8' }, borders: { top: border, bottom: border, left: border, right: border }, margins: { top: 90, bottom: 90, left: 110, right: 110 }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: documentFont })] })] }),
      new TableCell({ width: { size: 80, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border }, margins: { top: 90, bottom: 90, left: 110, right: 110 }, children: [new Paragraph({ children: [new TextRun({ text: value, font: documentFont })] })] }),
    ] })),
  })
}

export function meetingWordFilename(record: MeetingRecord, view: MeetingExportView): string {
  const safeTitle = record.title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || '未命名会议'
  return `${record.id}_${safeTitle}_${view === 'summary' ? '会议摘要' : '会议原文'}.docx`
}

export async function createMeetingWordBlob(record: MeetingRecord, view: MeetingExportView): Promise<Blob> {
  const docx = await import('docx')
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = docx
  const label = view === 'summary' ? '会议摘要' : '会议原文'
  const content = view === 'summary' ? record.summary ?? '' : record.transcript
  const wordDocument = new Document({
    title: `${record.title} - ${label}`, creator: '和工作',
    numbering: { config: [{ reference: 'meeting-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left', style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] }] },
    styles: { default: { document: { run: { font: documentFont, size: 21 }, paragraph: { spacing: { after: 100, line: 340 } } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, alignment: 'center', children: [new TextRun({ text: record.title, bold: true, font: documentFont })], spacing: { after: 180 } }),
        metadataTable(record, docx),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: label, bold: true, font: documentFont })], spacing: { before: 300, after: 140 } }),
        ...(content.trim() ? contentBlocks(content, docx) : [new Paragraph({ children: [new TextRun({ text: `暂无${label}`, color: '7A8699', font: documentFont })] })]),
      ],
    }],
  })
  return Packer.toBlob(wordDocument)
}

export async function exportMeetingRecordToWord(record: MeetingRecord, view: MeetingExportView): Promise<void> {
  const blob = await createMeetingWordBlob(record, view)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = meetingWordFilename(record, view)
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
