import { KeyRound, LoaderCircle, Pencil, Plus, Trash2, UserCog, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { AuthenticatedUser } from '../../app/types'
import {
  createAccount,
  deleteAccount,
  readAccounts,
  resetAccountPassword,
  setAccountStatus,
  updateAccount,
  type AccountRecord,
  type AccountRole,
} from './accounts-api'

const roleLabels: Record<AccountRole, string> = {
  owner: '老板',
  developer: '开发者',
}

interface AccountManagementProps {
  readonly user: AuthenticatedUser
  readonly onCurrentUserProfileUpdated?: (profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position'>) => void
}

type EditorMode = 'create' | 'edit' | null

export function AccountManagement({ user, onCurrentUserProfileUpdated }: AccountManagementProps) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [draft, setDraft] = useState<{ id?: string; accountId: string; displayName: string; position: string; role: AccountRole } | null>(null)
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
    setDraft({ accountId: '', displayName: '', position: '', role: 'owner' })
    setEditorMode('create')
    setFormError(null)
  }

  function openEdit(account: AccountRecord) {
    setDraft({ id: account.id, accountId: account.accountId, displayName: account.displayName, position: account.position, role: account.role })
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
          role: draft.role,
        })
        : draft.id ? await updateAccount(draft.id, {
          accountId: draft.accountId.trim(),
          displayName: draft.displayName.trim(),
          position: draft.position.trim(),
          role: draft.role,
        }) : null
      if (saved?.id === user.id) {
        onCurrentUserProfileUpdated?.({
          accountId: saved.accountId,
          displayName: saved.displayName,
          position: saved.position,
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

  async function removeAccount(account: AccountRecord) {
    if (!window.confirm(`确认删除账号「${account.displayName}」吗？删除后不可恢复，其登录会话与专属 Agent 运行时都会停止。`)) return
    try {
      await deleteAccount(account.id)
      setAccounts((current) => current.filter((item) => item.id !== account.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  return (
    <section className="account-admin panel-card">
      <header className="account-admin__header">
        <div className="account-admin__heading">
          <span><UserCog size={19} /></span>
          <div>
            <h2>账号管理</h2>
            <p>新增、停用、重置密码与分配权限。仅开发者可用。</p>
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
                <td><span className={`account-role account-role--${account.role}`}>{roleLabels[account.role]}</span></td>
                <td><span className={`account-status account-status--${account.status}`}>{account.status === 'active' ? '正常' : '已停用'}</span></td>
                <td><small>{account.createdAt.slice(0, 10)}</small></td>
                <td>
                  <div className="account-admin__row-actions">
                    <button type="button" title="编辑账号" onClick={() => openEdit(account)}><Pencil size={14} /></button>
                    <button type="button" title="重置为默认密码" onClick={() => void resetPassword(account)}><KeyRound size={14} /></button>
                    <button type="button" title={account.status === 'active' ? '停用账号' : '启用账号'} onClick={() => void toggleStatus(account)} disabled={account.id === user.id}>{account.status === 'active' ? '停用' : '启用'}</button>
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
              <div className="employee-editor__fields account-admin__fields">
                <label>姓名<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="如：张三" /></label>
                <label>账号名<input value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} placeholder="姓名拼音，如：zhangsan" /></label>
                <label>职位<input value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} placeholder="如：研发工程师、财务经理" /></label>
                <label className="account-admin__permission"><input type="checkbox" checked={draft.role === 'developer'} onChange={(event) => setDraft({ ...draft, role: event.target.checked ? 'developer' : 'owner' })} />开发者权限（可管理账号与开发控制台）</label>
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
