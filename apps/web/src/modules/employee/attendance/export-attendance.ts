import type { EmployeeAttendanceSnapshot } from '../work-records/work-records-api'

export async function exportAttendance(records: EmployeeAttendanceSnapshot['attendance']['records'], date: string): Promise<void> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('打卡记录')
  sheet.columns = [
    { header: '员工', key: 'employeeName', width: 18 }, { header: '部门', key: 'departmentName', width: 20 },
    { header: '实际上班', key: 'checkInAt', width: 16 }, { header: '实际下班', key: 'checkOutAt', width: 16 },
    { header: '考勤状态', key: 'status', width: 16 }, { header: '上班地点', key: 'checkInLocation', width: 24 }, { header: '下班地点', key: 'checkOutLocation', width: 24 },
  ]
  const label = { normal: '正常', late: '迟到', late_severe: '迟到（超过15分钟）', early_leave: '早退', missing: '缺卡', leave: '请假' } as const
  for (const record of records) sheet.addRow({ ...record, checkInAt: record.checkInState === 'leave' ? '请假' : record.checkInAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(record.checkInAt)) : '—', checkOutAt: record.checkOutState === 'leave' ? '请假' : record.checkOutAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(record.checkOutAt)) : '—', status: label[record.status], checkInLocation: record.checkInLocation ?? '—', checkOutLocation: record.checkOutLocation ?? '—' })
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2869AA' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  link.download = `考勤记录-${date}.xlsx`
  link.click()
  URL.revokeObjectURL(link.href)
}
