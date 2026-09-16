import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { credentialRequest, type ServiceConfiguration } from './service-configuration-api'

interface Props {
  readonly service: ServiceConfiguration
  readonly action: 'replace' | 'apply'
  readonly onClose: () => void
  readonly onSaved: (message: string) => void
}

export function CredentialDialog({ service, action, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'verify' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [discard, setDiscard] = useState(false)

  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])

  function close() {
    if (busy) return
    if (key) { setDiscard(true); return }
    onClose()
  }

  async function submit(operation: 'verify' | 'save') {
    if (busy) return
    setBusy(operation); setError(''); setDiscard(false)
    try {
      if (action === 'apply') {
        await credentialRequest(`/${service.id}/apply`, { revision: service.revision, interrupt: true })
        onSaved('已提交重新连接任务，生效状态将自动刷新。')
      } else {
        await credentialRequest(`/${service.id}/${operation}`, { key: key.trim(), revision: service.revision })
        if (operation === 'verify') setVerified(true)
        else {
          setKey('')
          onSaved(service.id === 'assistant' ? '凭证已保存，后台正在同步。现有连接将在下次启动时使用新凭证。' : '凭证已保存，后续日报分析请求将使用新凭证。')
        }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作未完成，请稍后重试。') }
    finally { setBusy(null) }
  }

  return <dialog ref={dialog} className="service-credentials-dialog" aria-labelledby="credential-dialog-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit('save') }}>
      <header><h3 id="credential-dialog-title">{action === 'replace' ? '更换凭证' : '立即生效'} · {service.label}</h3><button className="employee-data__secondary" type="button" aria-label="关闭" disabled={Boolean(busy)} onClick={close}><X size={16} /></button></header>
      {action === 'replace' ? <>
        <label htmlFor="service-credential-input">新密钥</label>
        <input id="service-credential-input" type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" maxLength={512} value={key} disabled={Boolean(busy)} placeholder="输入新密钥，原密钥不会显示" onChange={(event) => { setKey(event.target.value); setVerified(false); setError('') }} />
        <p>保存时会再次验证连接，验证失败不会替换原配置。密钥仅保存在服务器，不会返回页面。</p>
        {service.id === 'assistant' && <p>默认不打断正在使用的连接。如需马上切换，可保存后选择“立即生效”。</p>}
        {verified && <p className="service-credentials__success" role="status">连接验证通过。此验证核验认证与连通性，不代表账户额度充足。</p>}
      </> : <p className="service-credentials__notice">此操作会重新连接正在运行的助手服务，可能中断尚未完成的回复。请确认当前无人正在处理重要任务，再继续。休眠服务不会被批量启动。</p>}
      {error && <p className="service-credentials__error" role="alert">{error}</p>}
      {busy && <p role="status">{busy === 'verify' ? '正在验证连接…' : action === 'apply' ? '正在提交生效任务…' : '正在验证并保存…'}</p>}
      {discard ? <div className="service-credentials__discard" role="alert"><p>新密钥尚未保存，是否放弃更改？</p><div><button className="employee-data__secondary" type="button" onClick={() => { setKey(''); onClose() }}>放弃更改</button><button className="employee-data__secondary" type="button" onClick={() => setDiscard(false)}>继续编辑</button></div></div> : <footer>
        <button className="employee-data__secondary" type="button" disabled={Boolean(busy)} onClick={close}>取消</button>
        {action === 'replace' && <button className="employee-data__secondary" type="button" disabled={Boolean(busy) || !key.trim()} onClick={() => void submit('verify')}>验证连接</button>}
        <button className="employee-data__primary" type="submit" disabled={Boolean(busy) || action === 'replace' && !key.trim()}>{action === 'replace' ? '验证并保存' : '确认重新连接'}</button>
      </footer>}
    </form>
  </dialog>
}
