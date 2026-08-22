// 开发控制台 / 账号管理。
import { KeyRound, LoaderCircle, Pencil, Plus, Trash2, UserCog, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { employeeManagementPermissionIds, platformManagementPermissionIds } from '@hegongzuo/employee-domain'

import type { AuthenticatedUser } from '../../../app/types'
import {
  createAccount,
  deleteAccount,
  readAccounts,
  resetAccountPassword,
  retryAccountInitialization,
  setAccountStatus,
  updateAccount,
  type AccountRecord,
  type AccountPermissionId,
} from './accounts-api'

interface AccountManagementProps {
  readonly user: AuthenticatedUser
  readonly onCurrentUserProfileUpdated?: (profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position' | 'permissions'>) => void
}

type EditorMode = 'create' | 'edit' | null
const employeePermissionLabels: Record<AccountPermissionId, string> = {
  'employee-data': '员工档案维护',
  'employee-query': '员工查询',
  'finance-management': '财务管理',
  'project-management': '项目管理',
  'management-cockpit': '管理驾驶舱',
  'platform-administration': '平台管理与账号管理',
}
const otherManagementPermissions = platformManagementPermissionIds.filter((permission) => !employeeManagementPermissionIds.includes(permission as typeof employeeManagementPermissionIds[number]))

export function AccountManagement({ user, onCurrentUserProfileUpdated }: AccountManagementProps) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [draft, setDraft] = useState<{ id?: string; accountId: string; displayName: string; position: string; permissions: AccountPermissionId[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await readAccounts())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  function openCreate() {
    setDraft({ accountId: '', displayName: '', position: '', permissions: [] })
    setEditorMode('create')
    setFormError(null)
  }

  function openEdit(account: AccountRecord) {
    setDraft({ id: account.id, accountId: account.accountId, displayName: account.displayName, position: account.position, permissions: [...account.permissions] })
    setEditorMode('edit')
    setFormError(null)
  }

  function closeEditor() {
    setEditorMode(null)
    setDraft(null)
    setFormError(null)
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    setFormError(null)
    try {
      const saved = editorMode === 'create'
        ? await createAccount({
          accountId: draft.accountId.trim(),
          displayName: draft.displayName.trim(),
          position: draft.position.trim(),
          permissions: draft.permissions,
        })
        : draft.id ? await updateAccount(draft.id, {
          accountId: draft.accountId.trim(),
          displayName: draft.displayName.trim(),
          position: draft.position.trim(),
          permissions: draft.permissions,
        }) : null
      if (saved?.id === user.id) {
        onCurrentUserProfileUpdated?.({
          accountId: saved.accountId,
          displayName: saved.displayName,
          position: saved.position,
          permissions: saved.permissions,
        })
      }
      closeEditor()
      await loadAccounts()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword(account: AccountRecord) {
    if (!window.confirm(`确认将「${account.displayName}」的密码重置为默认密码 wangshuhe123 吗？`)) return
    try {
      await resetAccountPassword(account.id)
      window.alert(`「${account.displayName}」的密码已重置为 wangshuhe123。`)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError))
    }
  }

  async function toggleStatus(account: AccountRecord) {
    const nextStatus = account.status === 'active' ? 'disabled' : 'active'
    const label = nextStatus === 'disabled' ? '停用' : '启用'
    if (nextStatus === 'disabled' && !window.confirm(`确认停用账号「${account.displayName}」吗？停用后该账号无法登录。`)) return
    try {
      const updated = await setAccountStatus(account.id, nextStatus)
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError))
      if (label === '启用') void loadAccounts()
    }
  }

  async function retryInitialization(account: AccountRecord) {
    try {
      const updated = await retryAccountInitialization(account.id)
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : String(retryError))
    }
  }

  async function removeAccount(account: AccountRecord) {
    if (!window.confirm(`确认删除账号「${account.displayName}」吗？删除后不可恢复，其登录会话与专属 Agent 运行时都会停止。`)) return
    try {
      await deleteAccount(account.id)
      setAccounts((current) => current.filter((item) => item.id !== account.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  function togglePermission(permission: AccountPermissionId, checked: boolean) {
    if (!draft) return
    setDraft({
      ...draft,
      permissions: checked ? [...new Set([...draft.permissions, permission])] : draft.permissions.filter((item) => item !== permission),
    })
  }

  return (
    <section className="account-admin panel-card">
      <header className="account-admin__header">
        <div className="account-admin__heading">
          <span><UserCog size={19} /></span>
          <div>
            <h2>账号管理</h2>
            <p>新增、停用、重置密码与分配账号功能权限。</p>
          </div>
        </div>
        <button className="employee-data__primary" type="button" onClick={openCreate}><Plus size={16} /> 新增账号</button>
      </header>

      {error && <div className="account-admin__error"><span>{error}</span><button type="button" onClick={() => void loadAccounts()}>重新加载</button></div>}

      <div className="account-admin__table-wrap">
        <table className="account-admin__table">
          <thead>
            <tr><th>姓名</th><th>登录名</th><th>职位</th><th>权限</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td><strong>{account.displayName}</strong>{account.id === user.id && <small>当前账号</small>}</td>
                <td><code>{account.accountId}</code></td>
                <td>{account.position || <span className="account-admin__muted">未填写</span>}</td>
                <td><small>{account.permissions.map((permission) => employeePermissionLabels[permission]).join(' · ') || '未开通功能'}</small></td>
                <td><span className={`account-status account-status--${account.status}`}>{account.status === 'active' ? '正常' : account.status === 'disabled' ? '已停用' : account.status === 'initializing' ? '初始化中' : '初始化失败'}</span></td>
                <td><small>{account.createdAt.slice(0, 10)}</small></td>
                <td>
                  <div className="account-admin__row-actions">
                    <button type="button" title="编辑账号" onClick={() => openEdit(account)}><Pencil size={14} /></button>
                    <button type="button" title="重置为默认密码" onClick={() => void resetPassword(account)}><KeyRound size={14} /></button>
                    <button type="button" title={account.status === 'active' ? '停用账号' : '启用账号'} onClick={() => void toggleStatus(account)} disabled={account.id === user.id}>{account.status === 'active' ? '停用' : '启用'}</button>
                    {account.status === 'initialization_failed' && <button type="button" title="重新初始化" onClick={() => void retryInitialization(account)}>重试初始化</button>}
                    <button type="button" className="account-admin__danger" title="删除账号" onClick={() => void removeAccount(account)} disabled={account.id === user.id}><Trash2 size={14} /> 删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="account-admin__empty">正在加载账号…</div>}
      </div>

      {editorMode && draft && (
        <div className="employee-editor" role="dialog" aria-modal="true" aria-label={editorMode === 'create' ? '新增账号' : '编辑账号'}>
          <button className="employee-editor__backdrop" type="button" aria-label="关闭" onClick={closeEditor} />
          <section className="employee-editor__panel">
            <header>
              <div><span>{editorMode === 'create' ? '新增账号' : '编辑账号'}</span><strong>{draft.displayName || '填写账号信息'}</strong></div>
              <button type="button" onClick={closeEditor} title="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={(event) => { event.preventDefault(); void saveDraft() }}>
              <div className="account-admin__form-section">
                <div className="account-admin__form-heading"><strong>基本信息</strong><span>用于登录与工作台展示</span></div>
                <div className="employee-editor__fields account-admin__fields">
                  <label>姓名<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="如：张三" /></label>
                  <label>账号名<input value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} placeholder="姓名拼音，如：zhangsan" /></label>
                  <label>职位<input value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} placeholder="如：研发工程师、财务经理" /></label>
                </div>
              </div>
              <div className="account-admin__form-section">
                <div className="account-admin__form-heading"><strong>功能权限</strong><span>开通后显示对应管理入口</span></div>
                <div className="account-admin__fields">
                  <fieldset className="account-admin__permissions">
                    <legend>员工管理</legend>
                    {employeeManagementPermissionIds.map((permission) => <label key={permission}><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={(event) => togglePermission(permission, event.target.checked)} />{employeePermissionLabels[permission]}</label>)}
                  </fieldset>
                  <fieldset className="account-admin__permissions">
                    <legend>管理与平台</legend>
                    {otherManagementPermissions.map((permission) => <label key={permission}><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={(event) => togglePermission(permission, event.target.checked)} />{employeePermissionLabels[permission]}</label>)}
                  </fieldset>
                </div>
              </div>
              <p className="account-admin__hint">登录名规则：姓名拼音（小写字母开头，可含数字）。新账号初始密码统一为 wangshuhe123，请告知使用者登录后自行修改。</p>
              {formError && <p className="employee-editor__error">{formError}</p>}
              <footer>
                <button className="employee-data__secondary" type="button" onClick={closeEditor}>取消</button>
                <button className="employee-data__primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : '保存'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
