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
      '原始上传文件位于 uploads/；不得删除、覆盖或改名其中的文件。outputs/ 是结果文件区，只能在用户明确要求“生成文件、导出、保存为某种格式或创建文档”时写入新的结果文件。',
      '用户仅要求解读、分析、总结、问答或说明时，只在对话中回复，不得默认生成任何文件；完成后可以询问用户是否需要将结果保存为文件。',
      '不得调用 ask_user_question 或其他需要网页额外交互才能返回结果的提问工具；信息不足时，直接在普通文字回复中说明需要用户补充的内容，然后结束本轮回答。',
      '仅将脚本、依赖安装、文本提取和其他中间文件保存到 .work/；不得在工作区根目录、uploads/ 或 outputs/ 留下临时文件或依赖目录。需要安装 Python 依赖时，安装到 .work/.pylibs，并在命令中使用该目录。',
      '如用户请求的任务可能丢失数据、覆盖文件或超出当前工作区范围，先说明限制并请用户改为生成一个新文件。',
      '不得执行与当前工作区文件处理无关的命令或操作。',
    ].join('\n'),
  })
  registerSessionDeletionRoute(ctx)
}
