import type { AttendanceRecord, EmployeeWorkRecordsSource, WorkReportRecord, WorkRecordsSnapshot } from './work-records-source.js'

function at(date: string, time: string): string {
  return `${date}T${time}:00+08:00`
}

export class MockEmployeeWorkRecordsSource implements EmployeeWorkRecordsSource {
  async snapshot(date: string): Promise<WorkRecordsSnapshot> {
    const reports: readonly WorkReportRecord[] = [
      {
        id: `demo-report-${date}-1`, externalUserId: 'demo-user-01', employeeName: '示例员工甲', departmentName: '运营部',
        templateName: '日报', submittedAt: at(date, '18:12'),
        fields: [
          { label: '今日完成', value: '完成客户资料整理并更新项目进度。' },
          { label: '明日计划', value: '跟进待确认事项，整理周会材料。' },
          { label: '问题与支持', value: '暂无。' },
        ],
      },
      {
        id: `demo-report-${date}-2`, externalUserId: 'demo-user-02', employeeName: '示例员工乙', departmentName: '研发部',
        templateName: '日报', submittedAt: at(date, '18:26'),
        fields: [
          { label: '今日完成', value: '完成数据校验和问题修复。' },
          { label: '明日计划', value: '继续联调并补充使用说明。' },
        ],
      },
      {
        id: `demo-report-${date}-3`, externalUserId: 'demo-user-03', employeeName: '示例员工丙', departmentName: '行政部',
        templateName: '日报', submittedAt: at(date, '17:58'),
        fields: [
          { label: '今日完成', value: '完成办公用品盘点和下月采购计划。' },
          { label: '明日计划', value: '整理供应商对账资料。' },
        ],
      },
    ]
    const attendance: readonly AttendanceRecord[] = [
      { id: `demo-checkin-${date}-1`, externalUserId: 'demo-user-01', employeeName: '示例员工甲', departmentName: '运营部', scheduledStart: '09:00', scheduledEnd: '18:00', checkInAt: at(date, '08:52'), checkOutAt: at(date, '18:10'), status: 'normal', location: '公司办公室' },
      { id: `demo-checkin-${date}-2`, externalUserId: 'demo-user-02', employeeName: '示例员工乙', departmentName: '研发部', scheduledStart: '09:00', scheduledEnd: '18:00', checkInAt: at(date, '09:13'), checkOutAt: at(date, '18:34'), status: 'late', location: '公司办公室' },
      { id: `demo-checkin-${date}-3`, externalUserId: 'demo-user-03', employeeName: '示例员工丙', departmentName: '行政部', scheduledStart: '09:00', scheduledEnd: '18:00', checkInAt: at(date, '08:47'), checkOutAt: at(date, '17:42'), status: 'early_leave', location: '公司办公室' },
      { id: `demo-checkin-${date}-4`, externalUserId: 'demo-user-04', employeeName: '示例员工丁', departmentName: '财务部', scheduledStart: '09:00', scheduledEnd: '18:00', checkInAt: null, checkOutAt: null, status: 'missing', location: null },
    ]
    return {
      date,
      source: 'mock',
      connectionStatus: 'demo',
      generatedAt: new Date().toISOString(),
      reports: { expected: 4, submitted: reports.length, missing: 1, records: reports },
      attendance: { expected: attendance.length, normal: attendance.filter((record) => record.status === 'normal').length, exceptions: attendance.filter((record) => record.status !== 'normal').length, records: attendance },
    }
  }
}
