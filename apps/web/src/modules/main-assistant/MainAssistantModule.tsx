import type { ModuleProps } from '../../app/types'
import { WorkspaceAssistant } from './WorkspaceAssistant'

export function MainAssistantModule(_props: ModuleProps) {
  return <WorkspaceAssistant
    title="和工作助手"
    description="在一个入口查询已授权的业务信息，或整理个人工作文件。"
    agentApiBasePath="/api/agents/main-assistant"
    filesApiBasePath="/api/main-assistant/files"
    runtimeId="main-assistant"
    emptyPrompt="例如：查询某位员工的任职信息，或上传文件后说明需要完成的整理任务。"
    inputPlaceholder="请输入需要查询或处理的事项…"
  />
}
