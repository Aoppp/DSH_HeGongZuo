// 开发控制台模块入口。
import { Blocks, CheckCircle2, Database, Layers3, Server } from 'lucide-react'

import { platformModules } from '../../../app/module-registry'
import type { ModuleProps } from '../../../app/types'
import { AccountManagement } from './AccountManagement'
import './developer-console.css'

export function DeveloperConsoleModule({ user, onUserProfileUpdated }: ModuleProps) {
  return (
    <div className="developer-console module-page">
      <section className="developer-console__heading">
        <h1>平台管理</h1>
        <p>统一管理账号权限、模块配置与服务状态。</p>
      </section>

      <section className="developer-status-grid">
        <article><span><Server size={20} /></span><div><small>查询服务运行时</small><strong>员工查询服务</strong><p>通过平台访问控制连接</p></div></article>
        <article><span><Database size={20} /></span><div><small>员工数据</small><strong>待开发</strong><p>待开发</p></div></article>
        <article><span><Blocks size={20} /></span><div><small>平台模块</small><strong>{platformModules.length} 个已注册</strong><p>注册表统一管理</p></div></article>
      </section>

      <AccountManagement
        user={user}
        {...(onUserProfileUpdated ? { onCurrentUserProfileUpdated: onUserProfileUpdated } : {})}
      />

      <section className="module-inventory panel-card">
        <header><div><span><Layers3 size={19} /></span><div><h2>模块清单</h2><p>导航、访问范围和组件均来自同一注册表</p></div></div></header>
        <div>
          {platformModules.map((module) => {
            const Icon = module.icon
            return (
              <article key={module.id}>
                <span><Icon size={18} /></span>
                <div><strong>{module.label}</strong><small>{module.id}</small></div>
                <p>{module.requiredPermission ?? '所有已登录账号'}</p>
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
          <li><span>3</span><p>通过 <code>requiredPermission</code> 声明账号需要开通的功能权限。</p></li>
        </ol>
      </section>
    </div>
  )
}
