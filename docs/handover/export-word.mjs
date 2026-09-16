// 文档生成工具：只读取交接 Markdown，复用项目现有 docx 依赖，不访问数据库或线上服务。
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const {
  AlignmentType, Bookmark, BorderStyle, Document, Footer, Header, HeadingLevel,
  InternalHyperlink, LevelFormat, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} = require('docx')

const source = new URL('./PROJECT_HANDOVER.md', import.meta.url)
const output = new URL('../../和工作项目开发与运维交接文档.docx', import.meta.url)
const markdown = await readFile(source, 'utf8')
const lines = markdown.replaceAll('\r\n', '\n').split('\n')
const colors = { green: '2F8C78', dark: '163F3A', text: '172522', muted: '60706C', light: 'EDF7F4', border: 'DDE8E5' }
const bodyFont = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei', cs: 'Calibri' }
const codeFont = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft YaHei', cs: 'Consolas' }
const pageWidth = 11906
const margin = 1134
const contentWidth = pageWidth - margin * 2
const chapters = lines.filter((line) => /^## /.test(line)).map((line, index) => ({ title: line.slice(3), anchor: `chapter_${index + 1}` }))

function inline(text, extra = {}) {
  const pieces = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)
  return pieces.map((piece) => {
    if (piece.startsWith('`') && piece.endsWith('`')) return new TextRun({ text: piece.slice(1, -1), font: codeFont, size: 18, color: colors.dark, ...extra })
    if (piece.startsWith('**') && piece.endsWith('**')) return new TextRun({ text: piece.slice(2, -2), bold: true, ...extra })
    return new TextRun({ text: piece, ...extra })
  })
}

function paragraph(text, options = {}) {
  return new Paragraph({ children: inline(text), spacing: { after: 120, line: 300 }, widowControl: true, ...options })
}

function grid(rows) {
  const count = rows[0].length
  const proportions = count === 3 ? [0.34, 0.30, 0.36] : Array.from({ length: count }, () => 1 / count)
  const widths = proportions.map((portion) => Math.floor(contentWidth * portion))
  widths[count - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0)
  const border = { style: BorderStyle.SINGLE, size: 4, color: colors.border }
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((row, index) => new TableRow({
      tableHeader: index === 0,
      cantSplit: true,
      children: row.map((cell, cellIndex) => new TableCell({
        width: { size: widths[cellIndex], type: WidthType.DXA },
        margins: { top: 100, bottom: 100, left: 115, right: 115 },
        shading: { type: ShadingType.CLEAR, fill: index === 0 ? colors.light : index % 2 === 0 ? 'F8FAF9' : 'FFFFFF' },
        children: [new Paragraph({
          children: inline(cell, { size: 18, bold: index === 0, color: index === 0 ? colors.dark : colors.text }),
          spacing: { after: 0, line: 260 }, widowControl: true,
        })],
      })),
    })),
  })
}

function codeBlock(code) {
  return code.map((line) => new Paragraph({
    children: [new TextRun({ text: line || ' ', font: codeFont, size: 17, color: colors.dark })],
    spacing: { after: 0, before: 0, line: 240 },
    shading: { type: ShadingType.CLEAR, fill: 'F3F6F5' },
    indent: { left: 120, right: 120 },
    widowControl: true,
  }))
}

const children = [
  new Paragraph({ children: [new TextRun({ text: 'HEGONGZUO / INTERNAL HANDOVER', color: colors.green, size: 22, bold: true })], spacing: { before: 1000, after: 480 } }),
  new Paragraph({ children: [new TextRun({ text: '和工作平台', size: 58, color: colors.dark, bold: true })], spacing: { after: 200 } }),
  new Paragraph({ children: [new TextRun({ text: '开发与运维交接文档', size: 38, color: colors.dark, bold: true })], spacing: { after: 360 } }),
  paragraph('架构 · 业务规则 · 接口 · 部署 · 风险 · 接手清单', { spacing: { after: 520 } }),
  grid([
    ['项目基线', '交接说明'],
    ['编制日期', '2026 年 9 月 16 日（北京时间）'],
    ['业务版本', 'v5.91 / b90f7f5'],
    ['适用对象', '继任开发、运维及业务负责人'],
    ['正式网站', 'https://hgzuo.com'],
    ['保密要求', '仅内部流转；秘密值另行安全移交'],
  ]),
  paragraph('本文件以实际代码与只读部署核对为依据。已实现、待确认与建议改进分别说明，不将规划当作完成结果。', { spacing: { before: 400, after: 180 } }),
  new Paragraph({ text: '阅读导航', heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 240 } }),
  paragraph('点击下列章节可跳转；也可使用 Word / WPS 的导航窗格按标题浏览。'),
  ...chapters.map((chapter) => new Paragraph({
    children: [new InternalHyperlink({ anchor: chapter.anchor, children: [new TextRun({ text: chapter.title, color: colors.green, size: 22 })] })],
    spacing: { after: 120, line: 270 },
  })),
]

let chapterIndex = 0
let index = lines.findIndex((line) => /^## /.test(line))
let tables = 1
while (index < lines.length) {
  const line = lines[index]
  if (!line.trim()) { index += 1; continue }
  if (line.startsWith('```')) {
    const code = []
    index += 1
    while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++])
    index += 1
    children.push(...codeBlock(code), paragraph(''))
    continue
  }
  if (line.startsWith('|')) {
    const rows = []
    while (index < lines.length && lines[index].startsWith('|')) {
      const cells = lines[index++].slice(1, -1).split('|').map((cell) => cell.trim())
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue
      rows.push(cells)
    }
    if (!rows.every((row) => row.length === rows[0].length)) throw new Error('Markdown 表格列数不一致')
    children.push(grid(rows), paragraph(''))
    tables += 1
    continue
  }
  const heading = /^(#{2,4})\s+(.+)$/.exec(line)
  if (heading) {
    const level = heading[1].length - 1
    const title = heading[2]
    const runs = level === 1
      ? [new Bookmark({ id: chapters[chapterIndex++].anchor, children: [new TextRun(title)] })]
      : inline(title)
    children.push(new Paragraph({
      children: runs,
      heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      pageBreakBefore: level === 1,
      keepNext: true,
      spacing: { before: level === 1 ? 0 : 240, after: 160 },
    }))
    index += 1
    continue
  }
  if (/^- /.test(line)) {
    children.push(paragraph(line.slice(2), { numbering: { reference: 'handover-bullet', level: 0 }, spacing: { after: 100, line: 290 } }))
    index += 1
    continue
  }
  if (/^\d+\. /.test(line)) {
    children.push(paragraph(line, { indent: { left: 300, hanging: 300 }, spacing: { after: 110, line: 290 } }))
    index += 1
    continue
  }
  const parts = [line]
  index += 1
  while (index < lines.length && lines[index].trim() && !/^(#{2,4} |```|\||- |\d+\. )/.test(lines[index])) parts.push(lines[index++])
  children.push(paragraph(parts.join(' ')))
}

const document = new Document({
  title: '和工作平台开发与运维交接文档',
  subject: '项目架构、业务规则、接口、运维与继任开发交接',
  creator: '和工作项目',
  description: '依据 v5.91 / b90f7f5 与 2026-09-16 只读环境核对编制，不含秘密值。',
  styles: {
    default: {
      document: { run: { font: bodyFont, size: 21, color: colors.text, language: { value: 'zh-CN', eastAsia: 'zh-CN' } }, paragraph: { spacing: { after: 120, line: 300 } } },
      heading1: { run: { font: bodyFont, size: 34, bold: true, color: colors.dark }, paragraph: { keepNext: true } },
      heading2: { run: { font: bodyFont, size: 26, bold: true, color: colors.green }, paragraph: { keepNext: true } },
      heading3: { run: { font: bodyFont, size: 23, bold: true, color: colors.dark }, paragraph: { keepNext: true } },
    },
  },
  numbering: { config: [{ reference: 'handover-bullet', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 180 } } } }] }] },
  sections: [{
    properties: { titlePage: true, page: { size: { width: pageWidth, height: 16838 }, margin: { top: margin, right: margin, bottom: margin, left: margin, header: 500, footer: 500 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: '和工作  /  开发与运维交接', size: 17, color: colors.muted })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.border, space: 7 } } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '内部资料   ·   ', size: 17, color: colors.muted }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: colors.muted }), new TextRun({ text: ' / ', size: 17, color: colors.muted }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: colors.muted })] })] }) },
    children,
  }],
})

await writeFile(output, await Packer.toBuffer(document))
console.log(`已生成：${fileURLToPath(output)}\n章节：${chapters.length}；表格：${tables}；源文档字符数：${markdown.length}`)
