import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const apiTemplatePath = 'deploy/systemd/hegongzuo-api.service.template'
const agentTemplatePath = 'deploy/systemd/hegongzuo-agent@.service.template'
const requiredTemplates = [
  apiTemplatePath,
  agentTemplatePath,
  'deploy/systemd/hegongzuo-health.service.template',
  'deploy/systemd/hegongzuo-health.timer.template',
  'deploy/systemd/hegongzuo-alert@.service.template',
  'deploy/systemd/hegongzuo-agent-sync.service.template',
  'deploy/systemd/hegongzuo-agent-sync.path.template',
  'deploy/systemd/hegongzuo-sync-agent-units.sh.template',
  'deploy/systemd/journald.conf.d/hegongzuo.conf.template',
]
const requiredApiSettings = ['MemoryMax=', 'CPUQuota=', 'TasksMax=', 'LimitNOFILE=', 'OnFailure=']
const requiredAgentSettings = ['MemoryMax=', 'CPUQuota=', 'TasksMax=', 'LimitNOFILE=', 'OnFailure=', 'run-agent-runtime.mjs']

for (const relativePath of requiredTemplates) await access(path.join(root, relativePath))
const apiTemplate = await readFile(path.join(root, apiTemplatePath), 'utf8')
const agentTemplate = await readFile(path.join(root, agentTemplatePath), 'utf8')
for (const setting of requiredApiSettings) if (!apiTemplate.includes(setting)) throw new Error(`API 服务模板缺少 ${setting}`)
for (const setting of requiredAgentSettings) if (!agentTemplate.includes(setting)) throw new Error(`账号运行时模板缺少 ${setting}`)
console.log('生产 systemd 模板检查通过。')
