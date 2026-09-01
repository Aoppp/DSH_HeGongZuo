import type { SubmissionDashboard } from './report-analytics-api'

async function save(name: string, columns: readonly string[], rows: readonly (readonly (string | number)[])[]): Promise<void> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(name)
  sheet.columns = columns.map((header) => ({ header, key: header, width: Math.max(14, Math.min(40, header.length * 3)) }))
  rows.forEach((row) => sheet.addRow([...row]))
  sheet.getRow(1).font = { bold: true }
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = `${name}.xlsx`; link.click(); URL.revokeObjectURL(url)
}

export function exportMissing(dashboard: SubmissionDashboard): Promise<void> {
  return save(`未提交名单-${dashboard.date}`, ['姓名', '一级部门', '二级部门'], dashboard.employees.filter((item) => item.state === 'missing').map((item) => [item.name, item.department, item.departmentLevel2 ?? '']))
}
export function exportDelayed(dashboard: SubmissionDashboard): Promise<void> {
  return save(`延后提交名单-${dashboard.date}`, ['姓名', '一级部门', '二级部门', '日报份数'], dashboard.employees.filter((item) => item.state === 'delayed').map((item) => [item.name, item.department, item.departmentLevel2 ?? '', item.reportCount]))
}
