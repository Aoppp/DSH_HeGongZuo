import { useMemo, useState } from 'react'

import { employeePasteColumns, parseEmployeePaste, type EmployeePasteValues } from './employee-paste-parser'
import './employee-paste-recognition.css'

interface EmployeePasteRecognitionProps { readonly onApply: (values: EmployeePasteValues) => void }

export function EmployeePasteRecognition({ onApply }: EmployeePasteRecognitionProps) {
  const [text, setText] = useState('')
  const result = useMemo(() => text ? parseEmployeePaste(text) : null, [text])
  return <aside className="employee-paste-recognition">
    <div className="employee-paste-recognition__heading"><strong>粘贴识别</strong><span>固定 {employeePasteColumns.length} 列，一次一名员工</span></div>
    <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder="从 Excel 选中一行并粘贴到这里，空单元格也必须包含在选区内。" aria-label="粘贴员工信息" />
    {result && <div className="employee-paste-recognition__result">
      <strong className={result.errors.length ? 'is-error' : 'is-valid'}>{result.errors.length ? `识别到 ${result.cells.length} 列` : `已正确识别 ${result.cells.length} 列`}</strong>
      {result.errors.map((error) => <p className="is-error" key={error}>{error}</p>)}
      {result.warnings.map((warning) => <p className="is-warning" key={warning}>{warning}</p>)}
      {result.values && <dl><div><dt>姓名</dt><dd>{result.values.displayName || '未填写'}</dd></div><div><dt>公司</dt><dd>{result.values.companyName || '未填写'}</dd></div><div><dt>入职日期</dt><dd>{result.values.hireDate || '未填写'}</dd></div><div><dt>部门 / 职位</dt><dd>{[result.values.departmentName, result.values.jobTitle].filter(Boolean).join(' / ') || '未填写'}</dd></div></dl>}
    </div>}
    <button type="button" disabled={!result?.values} onClick={() => result?.values && onApply(result.values)}>填入员工表单</button>
    <details><summary>查看固定列顺序</summary><ol>{employeePasteColumns.map((column) => <li key={column}>{column}</li>)}</ol></details>
  </aside>
}
