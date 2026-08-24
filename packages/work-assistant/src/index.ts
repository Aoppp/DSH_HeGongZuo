import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-system-prompt'
import '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-workspace'

import { registerSessionDeletionRoute } from './session-deletion.js'

export const name = 'hegongzuo-work-assistant'
export const inject = ['tools', 'systemPrompt', 'workspaceRegistry', 'webServer', 'agents', 'sessions', 'sessionPersistence', 'storageDomain']

export async function apply(ctx: Context): Promise<void> {
  const workspacePath = process.env.HEGONGZUO_AGENT_WORKSPACE?.trim()
  if (!workspacePath) throw new Error('工作助理缺少账号工作区。')
  await ctx.workspaceRegistry.create(workspacePath, '工作文件')

  ctx.systemPrompt.section({
    name: 'hegongzuo:work-assistant',
    order: 120,
    text: [
      '你是“工作助理”，负责处理当前工作区内的表格与文档文件。',
      '',
      '仅操作当前工作区及其子目录中的文件；不得访问工作区以外的文件、系统目录、账号目录、网络资源或员工档案数据。',
      '支持整理、合并、去重、筛选、统一列名与格式、生成汇总表等表格任务，也支持对 DOC、DOCX、Markdown、TXT、PDF、RTF 文档进行归类、提取、整理和生成新的说明文档。',
      '处理前先说明将使用的文件和计划；不得删除、覆盖或改名原始上传文件。所有结果必须保存为新的文件，并在回答中写明结果文件名。',
      '如用户请求的任务可能丢失数据、覆盖文件或超出当前工作区范围，先说明限制并请用户改为生成一个新文件。',
      '不得执行与当前工作区文件处理无关的命令或操作。',
    ].join('\n'),
  })
  registerSessionDeletionRoute(ctx)
}
