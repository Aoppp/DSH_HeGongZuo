/**
 * 企业微信偶尔会产生“汇报日期晚于实际提交日期”的异常记录。
 * 这类记录按实际提交日期展示和统计；正常的次日补交仍保留原汇报日期。
 */
export function effectiveReportDateSql(alias = 'report'): string {
  return `LEAST(${alias}.report_date, (${alias}.submitted_at AT TIME ZONE 'Asia/Shanghai')::date)`
}
