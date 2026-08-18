import { Blocks, CheckCircle2, Code2, Database, Layers3, Server } from 'lucide-react'

import { platformModules } from '../../app/module-registry'
import type { ModuleProps } from '../../app/types'
import { getAccountAgentRuntime } from '../../config/runtime'
import { AccountManagement } from './AccountManagement'
import './developer-console.css'

export function DeveloperConsoleModule({ user }: ModuleProps) {
  const agentRuntime = getAccountAgentRuntime(user.accountId)
  return (
    <div className="developer-console module-page">
      <section className="developer-console__heading">
        <span className="eyebrow"><Code2 size={15} /> 仅开发者可见</span>
        <h1>开发控制台</h1>
        <p>当前只展示与模块化结构和员工查询服务集成相关的必要信息。</p>
      </section>

      <section className="developer-status-grid">
        <article><span><Server size={20} /></span><div><small>查询服务运行时</small><strong>DSH 0.1.0-rc.6</strong><p>{agentRuntime?.apiBasePath ?? '未配置服务运行时'}</p></div></article>
        <article><span><Database size={20} /></span><div><small>员工数据</small><strong>10 条 Mock 记录</strong><p>synthetic-non-personal</p></div></article>
        <article><span><Blocks size={20} /></span><div><small>平台模块</small><strong>{platformModules.length} 个已注册</strong><p>注册表统一管理</p></div></article>
      </section>

      <AccountManagement user={user} />

      <section className="module-inventory panel-card">
        <header><div><span><Layers3 size={19} /></span><div><h2>模块清单</h2><p>导航、访问范围和组件均来自同一注册表</p></div></div></header>
        <div>
          {platformModules.map((module) => {
            const Icon = module.icon
            return (
              <article key={module.id}>
                <span><Icon size={18} /></span>
                <div><strong>{module.label}</strong><small>{module.id}</small></div>
                <p>{module.allowedRoles.map((role) => role === 'owner' ? '老板' : '开发者').join(' · ')}</p>
                <CheckCircle2 size={17} />
              </article>
            )
          })}
        </div>
      </section>

      <section className="architecture-note panel-card">
        <h2>如何增删功能</h2>
        <ol>
          <li><span>1</span><p>在 <code>src/modules</code> 中新增或删除独立功能目录。</p></li>
          <li><span>2</span><p>在 <code>module-registry.ts</code> 中增加或删除一条模块注册。</p></li>
          <li><span>3</span><p>通过 <code>allowedRoles</code> 声明哪些账号角色可以看到该模块。</p></li>
        </ol>
      </section>
    </div>
  )
}
