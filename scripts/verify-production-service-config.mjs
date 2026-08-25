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
  'deploy/systemd/hegongzuo-agent-reconcile.service.template',
  'deploy/systemd/hegongzuo-agent-reconcile.timer.template',
  'deploy/systemd/hegongzuo-sync-agent-units.sh.template',
  'deploy/systemd/journald.conf.d/hegongzuo.conf.template',
]
const requiredApiSettings = ['MemoryMax=', 'CPUQuota=', 'TasksMax=', 'LimitNOFILE=', 'OnFailure=', 'ProtectHome=false']
const requiredAgentSettings = ['MemoryMax=', 'CPUQuota=', 'TasksMax=', 'LimitNOFILE=', 'OnFailure=', 'run-agent-runtime.mjs', 'BindReadOnlyPaths=/home/__DEPLOY_USER__/.cache/node/corepack']

for (const relativePath of requiredTemplates) await access(path.join(root, relativePath))
const apiTemplate = await readFile(path.join(root, apiTemplatePath), 'utf8')
const agentTemplate = await readFile(path.join(root, agentTemplatePath), 'utf8')
for (const setting of requiredApiSettings) if (!apiTemplate.includes(setting)) throw new Error(`API 服务模板缺少 ${setting}`)
for (const setting of requiredAgentSettings) if (!agentTemplate.includes(setting)) throw new Error(`账号运行时模板缺少 ${setting}`)
const agentSyncPathTemplate = await readFile(path.join(root, 'deploy/systemd/hegongzuo-agent-sync.path.template'), 'utf8')
const agentSyncScriptTemplate = await readFile(path.join(root, 'deploy/systemd/hegongzuo-sync-agent-units.sh.template'), 'utf8')
if (!agentSyncPathTemplate.includes('agent-restart-request') || !agentSyncScriptTemplate.includes('agent-restart-request')) throw new Error('账号运行时同步模板缺少能力包更新重启机制。')
if (!agentSyncPathTemplate.includes('agent-activation-request') || !agentSyncScriptTemplate.includes('agent-activation-request')) throw new Error('账号运行时同步模板缺少按需启动机制。')
if (!agentSyncScriptTemplate.includes('IDLE_TIMEOUT_SECONDS=1800') || !agentSyncScriptTemplate.includes('systemctl stop')) throw new Error('账号运行时同步模板缺少空闲回收机制。')
if (agentSyncScriptTemplate.includes('enable --now')) throw new Error('账号运行时同步模板仍会常驻启动全部实例。')
console.log('生产 systemd 模板检查通过。')
