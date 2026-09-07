import { Bell, CheckCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Notification { readonly id: string; readonly title: string; readonly content: string; readonly targetPath: string; readonly createdAt: string; readonly readAt: string | null }
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { ...init, credentials: 'same-origin' }); if (!response.ok) throw new Error('通知读取失败。'); return response.json() as Promise<T> }

export function NotificationBell() {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<readonly Notification[]>([]); const [unread, setUnread] = useState(0)
  const load = () => { void request<{ notifications: readonly Notification[]; unread: number }>('/api/notifications').then((result) => { setItems(result.notifications); setUnread(result.unread) }).catch(() => undefined) }
  useEffect(() => { load(); const timer = window.setInterval(load, 5 * 60 * 1000); return () => window.clearInterval(timer) }, [])
  const mark = (id: string) => { void request(`/api/notifications/${id}/read`, { method: 'POST' }).then(() => { setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item)); setUnread((value) => Math.max(0, value - 1)) }) }
  const markAll = () => { void request('/api/notifications/read-all', { method: 'POST' }).then(() => { setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); setUnread(0) }) }
  return <div className="notification-bell"><button type="button" className="icon-button notification-bell__trigger" aria-label={`通知，共 ${unread} 条未读`} title="通知" onClick={() => setOpen((value) => !value)}><Bell size={18} />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</button>{open && <section className="notification-bell__panel"><header><div><strong>通知</strong><small>{unread ? `${unread} 条未读` : '全部已读'}</small></div><div><button type="button" onClick={markAll}><CheckCheck size={14} />全部已读</button><button type="button" aria-label="关闭" onClick={() => setOpen(false)}><X size={16} /></button></div></header>{items.length ? <ul>{items.map((item) => <li key={item.id} className={item.readAt ? '' : 'is-unread'}><button type="button" onClick={() => { mark(item.id); setOpen(false); window.history.pushState(null, '', item.targetPath); window.dispatchEvent(new PopStateEvent('popstate')) }}><strong>{item.title}</strong><span>{item.content}</span><small>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></button></li>)}</ul> : <p>暂无通知</p>}</section>}</div>
}
