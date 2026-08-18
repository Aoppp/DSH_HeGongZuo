import {
  contractDaysLeft,
  employeeAge,
  tenureMonths,
  type EmployeeRecord,
  type EmploymentType,
} from './employee-data'

const employmentTypeZh: Record<EmploymentType, string> = {
  full_time: '合同工',
  part_time: '兼职',
  contractor: '外包',
  intern: '实习协议',
}

interface ExportColumn {
  readonly header: string
  readonly value: (employee: EmployeeRecord, index: number) => string | number
}

// 与原 Excel 列序一致，年龄/工龄/合同剩余天数为动态计算值
const exportColumns: readonly ExportColumn[] = [
  { header: '序号', value: (_employee, index) => index + 1 },
  { header: '所属公司', value: (employee) => employee.companyName ?? '' },
  { header: '姓名', value: (employee) => employee.displayName },
  { header: '入职时间', value: (employee) => employee.hireDate },
  { header: '试用期时长（月）', value: (employee) => employee.probationMonths ?? '' },
  { header: '预计转正日期', value: (employee) => employee.expectedRegularDate ?? '' },
  { header: '实际转正日期', value: (employee) => employee.actualRegularDate ?? '' },
  { header: '合同到期日期', value: (employee) => employee.contractEndDate ?? '' },
  { header: '合同剩余天数', value: (employee) => contractDaysLeft(employee.contractEndDate) ?? '' },
  { header: '一级部门', value: (employee) => employee.departmentName },
  { header: '二级部门', value: (employee) => employee.departmentLevel2 ?? '' },
  { header: '职位', value: (employee) => employee.jobTitle },
  { header: '用工类型', value: (employee) => employmentTypeZh[employee.employmentType] },
  { header: '性别', value: (employee) => employee.gender ?? '' },
  { header: '出生日期', value: (employee) => employee.birthDate ?? '' },
  { header: '身份证', value: (employee) => employee.idNumber ?? '' },
  { header: '年龄', value: (employee) => employeeAge(employee.birthDate) ?? '' },
  { header: '工龄（月）', value: (employee) => tenureMonths(employee.hireDate) ?? '' },
  { header: '联系方式', value: (employee) => employee.workPhone },
  { header: '邮箱', value: (employee) => employee.personalEmail ?? '' },
  { header: '企业邮箱', value: (employee) => employee.workEmail ?? '' },
  { header: '学历', value: (employee) => employee.education ?? '' },
  { header: '专业', value: (employee) => employee.major ?? '' },
  { header: '毕业学校', value: (employee) => employee.school ?? '' },
  { header: '毕业时间', value: (employee) => employee.graduationDate ?? '' },
  { header: '婚否', value: (employee) => employee.maritalStatus ?? '' },
  { header: '育否', value: (employee) => employee.hasChildren ?? '' },
  { header: '籍贯', value: (employee) => employee.hometown ?? '' },
  { header: '紧急联系人', value: (employee) => employee.emergencyContact ?? '' },
  { header: '紧急联系人电话', value: (employee) => employee.emergencyContactPhone ?? '' },
  { header: '居住住址', value: (employee) => employee.residentialAddress ?? '' },
  { header: '身份证地址', value: (employee) => employee.idAddress ?? '' },
  { header: '银行卡', value: (employee) => employee.bankAccount ?? '' },
  { header: '银行信息', value: (employee) => employee.bankName ?? '' },
  { header: '档案编号', value: (employee) => employee.archiveNo ?? '' },
  { header: '备注', value: (employee) => employee.notes ?? '' },
]

function todayText(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

// Excel 导出：exceljs 动态加载（Vite 拆包，不影响首屏）
export async function exportEmployeesToExcel(employees: readonly EmployeeRecord[]): Promise<void> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('王叔和在职')
  sheet.columns = exportColumns.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.header === '备注' || column.header.includes('住址') ? 36 : 16,
  }))
  employees.forEach((employee, index) => {
    sheet.addRow(exportColumns.map((column) => column.value(employee, index)))
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `王叔和在职员工-${todayText()}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

// PDF 导出：打开只读打印窗口，在系统打印对话框中选择“另存为 PDF”
export function exportEmployeesToPdf(employees: readonly EmployeeRecord[]): void {
  const printWindow = window.open('', '_blank', 'width=1400,height=900')
  if (!printWindow) return
  const headerCells = exportColumns.map((column) => `<th>${column.header}</th>`).join('')
  const rows = employees.map((employee, index) => {
    const cells = exportColumns.map((column) => `<td>${String(column.value(employee, index))}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>王叔和在职员工</title>
<style>
  body { margin: 18px; font-family: "PingFang SC", "Microsoft YaHei", sans-serif; color: #101828; }
  h1 { margin: 0 0 6px; font-size: 18px; }
  p { margin: 0 0 14px; color: #667085; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5px; table-layout: fixed; }
  th, td { border: 1px solid #cfd9e8; padding: 4px 5px; text-align: left; overflow-wrap: break-word; }
  th { background: #eef3fa; font-weight: 700; }
  @page { size: A4 landscape; margin: 10mm; }
</style>
</head>
<body>
<h1>王叔和在职员工</h1>
<p>共 ${employees.length} 人 · 导出日期 ${todayText()}</p>
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>${rows}</tbody>
</table>
<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 150) })</script>
</body>
</html>`)
  printWindow.document.close()
}
