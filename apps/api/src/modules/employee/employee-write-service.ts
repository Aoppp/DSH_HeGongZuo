import type { Pool } from 'pg'
import { HttpError } from '../../http/http.js'
import { inTransaction } from '../../storage/transaction.js'
import { writeAudit, type AuditActor } from '../platform/audit-writer.js'
import { employeeAuditDetail } from './employee-audit.js'
import type { EmployeeInput } from './employee-input.js'
import { PostgresEmployeeRepository } from './employee-repository.js'
import { isCalendarDate } from './work-records/work-records-source.js'

export class EmployeeWriteService {
  constructor(private readonly pool: Pool) {}

  create(input: EmployeeInput, actor: AuditActor) {
    if (input.status === 'inactive' && (!input.departureDate || input.departureDate < input.hireDate)) throw new HttpError(400, '请填写不早于入职日期的离职日期。')
    return inTransaction(this.pool, async (client) => {
      const employee = await new PostgresEmployeeRepository(this.pool, client).create(input)
      await writeAudit(client, actor, '新增员工档案', '员工', employee.id, employeeAuditDetail(null, employee, input.resume != null))
      return employee
    })
  }

  update(id: string, input: EmployeeInput, actor: AuditActor) {
    return inTransaction(this.pool, async (client) => {
      const repository = new PostgresEmployeeRepository(this.pool, client)
      const previous = await repository.get(id, true)
      if (!previous) throw new HttpError(404, '员工不存在。')
      const departureDate = input.departureDate === undefined ? previous.departureDate : input.departureDate
      if (input.status === 'inactive' && (!departureDate || departureDate < input.hireDate)) throw new HttpError(400, '请填写不早于入职日期的离职日期。')
      const employee = await repository.update(id, input)
      if (!employee) throw new HttpError(404, '员工不存在。')
      const detail = employeeAuditDetail(previous, employee, input.resume !== undefined)
      if (detail.changedFields.length) await writeAudit(client, actor, detail.changedFields.length === 1 && detail.changedFields[0] === '员工简历' ? '更新员工简历' : '编辑员工档案', '员工', id, detail)
      return employee
    })
  }

  depart(id: string, date: string, reason: string, actor: AuditActor) {
    return inTransaction(this.pool, async (client) => {
      const repository = new PostgresEmployeeRepository(this.pool, client)
      const previous = await repository.get(id, true)
      if (!previous) throw new HttpError(404, '员工不存在。')
      if (!isCalendarDate(date) || date < previous.hireDate) throw new HttpError(400, '离职日期无效或早于入职日期。')
      const employee = await repository.depart(id, date, reason)
      if (!employee) throw new HttpError(404, '员工不存在。')
      await writeAudit(client, actor, '办理员工离职', '员工', id, employeeAuditDetail(previous, employee))
      return employee
    })
  }
}
