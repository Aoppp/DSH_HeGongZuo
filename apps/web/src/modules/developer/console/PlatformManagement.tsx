import { Activity, Blocks, Check, ChevronDown, Copy, Database, Download, History, KeyRound, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleId } from '../../../app/types'
import { SkeletonCards, SkeletonList } from '../../../components/Skeleton'
import { createMeetingUploadCredential, deleteMeetingUploadCredential, readAuditLogs, readMeetingUploadCredentials, readPlatformStatus, setPlatformModuleEnabled, type AuditLog, type MeetingUploadCredential, type PlatformStatus } from './platform-api'

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
  const [modulesOpen, setModulesOpen] = useState(true)
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditLogs, setAuditLogs] = useState<readonly AuditLog[]>([])
  const [auditCursor, setAuditCursor] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [meetingCredentials, setMeetingCredentials] = useState<readonly MeetingUploadCredential[]>([])
  const [credentialName, setCredentialName] = useState('')
  const [credentialEditorOpen, setCredentialEditorOpen] = useState(false)
  const [credentialFormError, setCredentialFormError] = useState<string | null>(null)
  const [newMeetingToken, setNewMeetingToken] = useState<string | null>(null)
  const [newMeetingTokenId, setNewMeetingTokenId] = useState<string | null>(null)
  const [creatingToken, setCreatingToken] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [next, credentials] = await Promise.all([readPlatformStatus(), readMeetingUploadCredentials()])
      setStatus(next)
      setMeetingCredentials(credentials)
      onModuleSettingsUpdated(next.modules.filter((module) => !module.enabled).map((module) => module.id))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取平台状态。')
    } finally {
      setLoading(false)
    }
  }, [onModuleSettingsUpdated])

  useEffect(() => { void load() }, [load])

  const loadAuditLogs = useCallback(async (cursor: string | null, append = false) => {
    setAuditLoading(true)
    try {
      const page = await readAuditLogs(cursor)
      setAuditLogs((current) => append ? [...current, ...page.logs] : page.logs)
      setAuditCursor(page.nextCursor)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取操作记录。')
    } finally {
      setAuditLoading(false)
    }
  }, [])

  function toggleAudit() {
    setAuditOpen((open) => {
      const next = !open
      if (next && auditLogs.length === 0 && !auditLoading) void loadAuditLogs(null)
      return next
    })
  }

  async function createToken() {
    const name = credentialName.trim()
    if (!name) { setCredentialFormError('请填写凭证名称。'); return }
    setCreatingToken(true); setCredentialFormError(null); setCopiedToken(false)
    try { const result = await createMeetingUploadCredential(name); setMeetingCredentials((current) => [result, ...current]); setNewMeetingToken(result.token); setNewMeetingTokenId(result.id); setCredentialName(''); setCredentialEditorOpen(false) }
    catch (reason) { setCredentialFormError(reason instanceof Error ? reason.message : '会议上传凭证生成失败。') }
    finally { setCreatingToken(false) }
  }

  function openCredentialEditor() {
    setCredentialName('')
    setCredentialFormError(null)
    setCredentialEditorOpen(true)
  }

  function closeCredentialEditor() {
    if (creatingToken) return
    setCredentialEditorOpen(false)
    setCredentialFormError(null)
  }

  async function copyToken() {
    if (!newMeetingToken) return
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(newMeetingToken)
      else { const input = document.createElement('textarea'); input.value = newMeetingToken; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); if (!document.execCommand('copy')) throw new Error('copy failed'); input.remove() }
      setCopiedToken(true)
    } catch { setError('无法自动复制，请选中凭证文本后手动复制。') }
  }

  async function removeToken(credential: MeetingUploadCredential) {
    if (!window.confirm(`确认删除“${credential.name}”吗？使用该凭证的翻译脚本将立即无法上传。`)) return
    try { await deleteMeetingUploadCredential(credential.id); setMeetingCredentials((current) => current.filter((item) => item.id !== credential.id)); if (newMeetingTokenId === credential.id) { setNewMeetingToken(null); setNewMeetingTokenId(null) } }
    catch (reason) { setError(reason instanceof Error ? reason.message : '会议上传凭证删除失败。') }
  }

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
        {loading && !status ? <SkeletonCards count={3} /> : status && (
          <div className="platform-management__health">
            <article><span><Activity size={19} /></span><div><small>平台 API</small><strong>运行正常</strong></div></article>
            <article><span><Database size={19} /></span><div><small>数据服务</small><strong>{status.database === 'available' ? '连接正常' : '不可用'}</strong></div></article>
            <article><span><Blocks size={19} /></span><div><small>功能运行空间</small><strong>{status.agentRuntimes.running} 个运行中，{status.agentRuntimes.idle} 个待命</strong>{status.agentRuntimes.unavailable.length > 0 && <em>存在不可用运行空间</em>}</div></article>
          </div>
        )}
      </section>

      {status && <section className="platform-management panel-card">
        <header className="platform-management__header"><div><h2>模块管理</h2><p>启停业务入口；停用后对应业务接口也会拒绝访问。</p></div><button className="employee-data__secondary platform-management__collapse-toggle" type="button" onClick={() => setModulesOpen((open) => !open)} aria-expanded={modulesOpen}>{modulesOpen ? '收起' : '展开'}<ChevronDown className={modulesOpen ? 'platform-management__audit-chevron platform-management__audit-chevron--open' : 'platform-management__audit-chevron'} size={15} /></button></header>
        {modulesOpen && <div className="platform-management__modules">
          {status.modules.map((module) => (
            <article key={module.id}>
              <div><strong>{module.label}</strong><small>{module.enabled ? '已启用' : '已停用'}{module.updatedAt ? ` · ${formatTime(module.updatedAt)}` : ''}</small></div>
              <button className={module.enabled ? 'employee-data__secondary' : 'employee-data__primary'} type="button" disabled={changingModuleId === module.id} onClick={() => void toggleModule(module.id, !module.enabled, module.label)}>
                {changingModuleId === module.id ? <LoaderCircle className="spin" size={15} /> : module.enabled ? '停用' : '启用'}
              </button>
            </article>
          ))}
        </div>}
      </section>}

      {status && <section className="platform-management panel-card">
        <header className="platform-management__header"><div><h2>会议上传凭证</h2><p>供线下会议电脑上传会议记录，只具备上传能力。</p></div><button className="employee-data__secondary" type="button" onClick={openCredentialEditor}><KeyRound size={15} />生成凭证</button></header>
        <div className="platform-management__credential">{newMeetingToken && <div className="platform-management__token"><p>请立即复制，刷新或离开页面后不再完整显示。</p><code>{newMeetingToken}</code><button type="button" onClick={() => void copyToken()}>{copiedToken ? <Check size={14} /> : <Copy size={14} />}{copiedToken ? '已复制' : '复制'}</button></div>}<div className="platform-management__credential-list">{meetingCredentials.length === 0 ? <p>尚未创建会议上传凭证。</p> : meetingCredentials.map((credential) => <article key={credential.id}><div><strong>{credential.name}</strong><small>{credential.tokenHint} · 创建于 {formatTime(credential.createdAt)}{credential.lastUsedAt ? ` · 最后使用 ${formatTime(credential.lastUsedAt)}` : ' · 尚未使用'}</small></div><button className="developer-console__danger-action" type="button" title="删除凭证" onClick={() => void removeToken(credential)}><Trash2 size={14} />删除</button></article>)}</div></div>
      </section>}

      {credentialEditorOpen && <div className="platform-management__credential-dialog" role="dialog" aria-modal="true" aria-label="命名会议上传凭证"><button className="platform-management__credential-backdrop" type="button" aria-label="取消生成" onClick={closeCredentialEditor} /><form onSubmit={(event) => { event.preventDefault(); void createToken() }}><header><div><small>会议上传凭证</small><strong>为新凭证命名</strong></div><button type="button" title="关闭" onClick={closeCredentialEditor}><span aria-hidden="true">×</span></button></header><label>凭证名称<input autoFocus value={credentialName} maxLength={80} placeholder="如：会议室电脑" onChange={(event) => setCredentialName(event.target.value)} /></label><p>名称仅用于区分不同设备，不会影响上传接口。</p>{credentialFormError && <div className="platform-management__credential-error">{credentialFormError}</div>}<footer><button className="employee-data__secondary" type="button" onClick={closeCredentialEditor} disabled={creatingToken}>取消</button><button className="employee-data__primary" type="submit" disabled={creatingToken || !credentialName.trim()}>{creatingToken ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}生成</button></footer></form></div>}

      {status && <section className="platform-management panel-card">
        <header className="platform-management__header"><div><h2>操作记录</h2><p>审计记录长期保留，按需加载。</p></div><div className="platform-management__audit-actions"><a className="employee-data__secondary platform-management__audit-export" href="/api/platform/audit-logs/export"><Download size={15} />导出全部 CSV</a><button className="employee-data__secondary platform-management__audit-toggle" type="button" onClick={toggleAudit} aria-expanded={auditOpen}><History size={15} />{auditOpen ? '收起记录' : '查看记录'}<ChevronDown className={auditOpen ? 'platform-management__audit-chevron platform-management__audit-chevron--open' : 'platform-management__audit-chevron'} size={15} /></button></div></header>
        {auditOpen && (auditLoading && auditLogs.length === 0 ? <SkeletonList count={5} /> : auditLogs.length === 0 ? <div className="account-admin__empty">暂无平台管理操作记录。</div> : <><div className="platform-management__audit">
          {auditLogs.map((log) => <article key={log.id}><div><strong>{log.action}</strong><small>{log.targetType} · {log.targetId}{auditFields(log.detail) ? ` · 修改：${auditFields(log.detail)}` : ''}</small></div><span>{log.actorName ?? '已删除账号'} · {formatTime(log.createdAt)}</span></article>)}
        </div>{auditCursor && <button className="employee-data__secondary platform-management__audit-more" type="button" disabled={auditLoading} onClick={() => void loadAuditLogs(auditCursor, true)}>{auditLoading ? <LoaderCircle className="spin" size={15} /> : '加载更多记录'}</button>}</>)}
      </section>}
    </>
  )
}

function auditFields(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object' || !('changedFields' in detail)) return null
  const fields = (detail as { changedFields?: unknown }).changedFields
  return Array.isArray(fields) && fields.every((field) => typeof field === 'string') ? fields.join('、') : null
}
