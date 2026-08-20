import { agentRuntimeRegistry } from './agent-runtime-registry.mjs'

const agents = await agentRuntimeRegistry()
if (agents.length === 0) throw new Error('未发现任何 Agent 清单。')
console.log(`Agent 注册表检查通过：${agents.map((agent) => agent.id).join('、')}。`)
