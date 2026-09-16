import { ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SkeletonList } from '../../../components/Skeleton'
import { CredentialDialog } from './CredentialDialog'
import { credentialRequest, serviceStateLabels, type ServiceConfiguration } from './service-configuration-api'
import './service-configuration.css'

export function ServiceConfigurationPanel() {
  const [open, setOpen] = useState(false)
  const [services, setServices] = useState<readonly ServiceConfiguration[] | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [editor, setEditor] = useState<{ service: ServiceConfiguration; action: 'replace' | 'apply' } | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const result = await credentialRequest<{ services: ServiceConfiguration[] }>('', undefined, controller.signal)
        if (!controller.signal.aborted) { setServices(result.services); setError('') }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '服务状态读取失败。') }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void load(), 8000) }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [open, refresh])

  async function retry(service: ServiceConfiguration) {
    setRetrying(true); setError('')
    try { await credentialRequest(`/${service.id}/apply`, { revision: service.revision, interrupt: false }); setMessage('已提交重新同步，不中断现有连接。'); setRefresh((value) => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败。') }
    finally { setRetrying(false) }
  }

  return <section className="platform-management panel-card">
    <header className="platform-management__header"><div><h2>服务配置</h2><p>管理助手与日报分析的访问凭证。</p></div><div className="platform-management__audit-actions">
      <button type="button" className="employee-data__secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? '收起' : '展开'}<ChevronDown size={15} className={open ? 'platform-management__audit-chevron platform-management__audit-chevron--open' : 'platform-management__audit-chevron'} /></button>
      {open && <button className="employee-data__secondary" type="button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} />刷新</button>}
    </div></header>
    {open && <div className="service-credentials">
      {error && <p className="service-credentials__error" role="alert">{error}</p>}
      {message && <p className="service-credentials__success" role="status">{message}</p>}
      {!services ? !error && <SkeletonList count={2} /> : services.map((service) => <article key={service.id}>
        <div className="service-credentials__info"><h3>{service.label}<span className={`service-credentials__badge service-credentials__badge--${service.state}`}>{service.configured ? serviceStateLabels[service.state] : '未配置'}</span></h3>
          <p>{service.id === 'assistant' ? '用于和工作助手与员工查询。' : '独立用于日报汇总与内容查询。'}</p>
          <small>{service.updatedAt ? `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(service.updatedAt))} · ${service.updatedBy}` : '尚未通过页面更换'}</small>
          {service.state === 'waiting' && <p className="service-credentials__notice">{service.pending} 个正在使用的连接仍使用旧凭证，下次启动会自动更新。确认全部生效后再停用旧凭证。</p>}
          {service.state === 'failed' && <p className="service-credentials__error">凭证已保存，但后台同步未完成，可重新同步。</p>}
          {service.state === 'unknown' && <p className="service-credentials__notice">部分服务暂时无法确认状态，请刷新或检查平台运行状态。</p>}
          {service.state === 'unavailable' && <p className="service-credentials__error">配置保护文件不可用，请联系管理员检查或恢复备份，不要重新创建保护文件。</p>}
        </div>
        <div className="service-credentials__actions">
          <button className="employee-data__secondary" type="button" disabled={service.state === 'unavailable'} onClick={() => setEditor({ service, action: 'replace' })}>更换密钥</button>
          {service.id === 'assistant' && service.revision && service.state !== 'effective' && service.state !== 'applying' && service.state !== 'unavailable' && <>
            <button className="employee-data__secondary" type="button" disabled={retrying} onClick={() => void retry(service)}>重新同步</button>
            <button className="employee-data__secondary" type="button" disabled={retrying} onClick={() => setEditor({ service, action: 'apply' })}>立即生效</button>
          </>}
        </div>
      </article>)}
    </div>}
    {editor && <CredentialDialog service={editor.service} action={editor.action} onClose={() => setEditor(null)} onSaved={(nextMessage) => { setEditor(null); setMessage(nextMessage); setRefresh((value) => value + 1) }} />}
  </section>
}
