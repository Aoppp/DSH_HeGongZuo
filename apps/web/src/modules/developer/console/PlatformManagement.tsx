import { Activity, Blocks, ChevronDown, Database, History, LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleId } from '../../../app/types'
import { readPlatformStatus, setPlatformModuleEnabled, type PlatformStatus } from './platform-api'

interface PlatformManagementProps {
  readonly onModuleSettingsUpdated: (disabledModuleIds: readonly ModuleId[]) => void
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function PlatformManagement({ onModuleSettingsUpdated }: PlatformManagementProps) {
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [changingModuleId, setChangingModuleId] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await readPlatformStatus()
      setStatus(next)
      onModuleSettingsUpdated(next.modules.filter((module) => !module.enabled).map((module) => module.id))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取平台状态。')
    } finally {
      setLoading(false)
    }
  }, [onModuleSettingsUpdated])

  useEffect(() => { void load() }, [load])

  async function toggleModule(moduleId: PlatformStatus['modules'][number]['id'], enabled: boolean, label: string) {
    const action = enabled ? '启用' : '停用'
    if (!window.confirm(`确认${action}“${label}”吗？${enabled ? '有对应权限的账号将看到该入口。' : '该入口及其业务接口将暂时不可使用。'}`)) return
    setChangingModuleId(moduleId)
    setError(null)
    try {
      const next = await setPlatformModuleEnabled(moduleId, enabled)
      setStatus(next)
      onModuleSettingsUpdated(next.modules.filter((module) => !module.enabled).map((module) => module.id))
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '模块状态更新失败。')
    } finally {
      setChangingModuleId(null)
    }
  }

  return (
    <>
      <section className="platform-management panel-card">
        <header className="platform-management__header">
          <div><h2>平台运行状态</h2><p>实时检查服务与账号运行空间。</p></div>
          <button className="employee-data__secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} /> 刷新</button>
        </header>
        {error && <div className="account-admin__error"><span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button></div>}
        {loading && !status ? <div className="account-admin__empty">正在读取平台状态…</div> : status && (
          <div className="platform-management__health">
            <article><span><Activity size={19} /></span><div><small>平台 API</small><strong>运行正常</strong></div></article>
            <article><span><Database size={19} /></span><div><small>数据服务</small><strong>{status.database === 'available' ? '连接正常' : '不可用'}</strong></div></article>
            <article><span><Blocks size={19} /></span><div><small>员工查询服务</small><strong>{status.agentRuntimes.available} / {status.agentRuntimes.expected} 可用</strong>{status.agentRuntimes.unavailable.length > 0 && <em>存在不可用运行空间</em>}</div></article>
          </div>
        )}
      </section>

      {status && <section className="platform-management panel-card">
        <header className="platform-management__header"><div><h2>模块管理</h2><p>启停业务入口；停用后对应业务接口也会拒绝访问。</p></div></header>
        <div className="platform-management__modules">
          {status.modules.map((module) => (
            <article key={module.id}>
              <div><strong>{module.label}</strong><small>{module.enabled ? '已启用' : '已停用'}{module.updatedAt ? ` · ${formatTime(module.updatedAt)}` : ''}</small></div>
              <button className={module.enabled ? 'employee-data__secondary' : 'employee-data__primary'} type="button" disabled={changingModuleId === module.id} onClick={() => void toggleModule(module.id, !module.enabled, module.label)}>
                {changingModuleId === module.id ? <LoaderCircle className="spin" size={15} /> : module.enabled ? '停用' : '启用'}
              </button>
            </article>
          ))}
        </div>
      </section>}

      {status && <section className="platform-management panel-card">
        <header className="platform-management__header"><div><h2>操作记录</h2><p>保留最近 30 条平台管理操作。</p></div><button className="employee-data__secondary platform-management__audit-toggle" type="button" onClick={() => setAuditOpen((open) => !open)} aria-expanded={auditOpen}><History size={15} />{auditOpen ? '收起记录' : '查看记录'}<ChevronDown className={auditOpen ? 'platform-management__audit-chevron platform-management__audit-chevron--open' : 'platform-management__audit-chevron'} size={15} /></button></header>
        {auditOpen && (status.auditLogs.length === 0 ? <div className="account-admin__empty">暂无平台管理操作记录。</div> : <div className="platform-management__audit">
          {status.auditLogs.map((log) => <article key={log.id}><div><strong>{log.action}</strong><small>{log.targetType} · {log.targetId}</small></div><span>{log.actorName ?? '已删除账号'} · {formatTime(log.createdAt)}</span></article>)}
        </div>)}
      </section>}
    </>
  )
}
