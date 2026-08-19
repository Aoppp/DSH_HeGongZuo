import {
  AlertCircle,
  Database,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'

import type { ModuleProps } from '../../app/types'
import { getAccountAgentRuntime } from '../../config/runtime'
import { buildConversation } from './conversation'
import { EmployeeDataManagement } from './EmployeeDataManagement'
import { MarkdownText } from './markdown'
import { useEmployeeAgent } from './use-employee-agent'
import './employee-agent.css'

const agentCapabilities = [
  { title: '在职员工查询', description: '按姓名、部门、岗位、学历等条件查询员工档案' },
  { title: '离职员工查询', description: '查询离职日期、离职原因与原任职信息' },
  { title: '组织关系', description: '查看部门成员与汇报关系' },
  { title: '统计分布', description: '各部门人数、学历、性别、司龄等分布统计' },
  { title: '合同与转正预警', description: '查询合同到期名单与转正提醒' },
]

export function EmployeeAgentModule({ user }: ModuleProps) {
  const [draft, setDraft] = useState('')
  const [showEmployeeData, setShowEmployeeData] = useState(false)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const agentRuntime = getAccountAgentRuntime(user.accountId)
  const agent = useEmployeeAgent(agentRuntime)
  const conversation = useMemo(() => buildConversation(agent.history), [agent.history])
  const activeSession = agent.sessions.find((session) => session.id === agent.activeSessionId)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [conversation.length])

  function submit(text = draft) {
    const content = text.trim()
    if (!content || agent.sending || agent.connectionState !== 'connected') return
    setDraft('')
    void agent.sendPrompt(content)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function deleteConversation(session: (typeof agent.sessions)[number]) {
    if (session.running) return
    const confirmed = window.confirm(`确定永久删除对话“${session.title}”吗？\n\n该对话及其后台记录将一并删除，且无法恢复。`)
    if (confirmed) void agent.deleteSession(session.id)
  }

  if (showEmployeeData) {
    return <EmployeeDataManagement onBack={() => setShowEmployeeData(false)} />
  }

  return (
    <div className="employee-agent module-page">
      <section className="agent-heading">
        <div>
          <h1>员工查询</h1>
          <p>查询员工、部门和组织关系。</p>
        </div>
        <div className="agent-heading__actions">
          <button className="employee-data-entry" type="button" onClick={() => setShowEmployeeData(true)}><Users size={16} /> 维护员工数据</button>
          <div className={`agent-connection agent-connection--${agent.connectionState}`}>
            <i />
            <span>{agent.connectionState === 'connected' ? '服务已连接' : agent.connectionState === 'error' ? '连接失败' : '正在连接'}</span>
          </div>
        </div>
      </section>

      <section className="agent-workbench">
        <aside className="agent-sessions">
          <button className="new-session-button" type="button" onClick={() => void agent.createSession().catch(() => undefined)} disabled={!agent.workspace}>
            <MessageSquarePlus size={16} /> 新建对话
          </button>
          <div className="agent-sessions__heading">最近对话</div>
          <div className="agent-session-list">
            {agent.sessions.length === 0 ? (
              <p className="agent-session-list__empty">还没有历史对话</p>
            ) : agent.sessions.map((session) => (
              <div className={`agent-session-item${session.id === agent.activeSessionId ? ' is-active' : ''}`} key={session.id}>
                <button
                  className="agent-session-select"
                  type="button"
                  onClick={() => void agent.selectSession(session.id)}
                >
                  <span>{session.title}</span>
                  <small>{session.running ? '正在处理' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(session.updatedAt)}</small>
                </button>
                <button
                  className="agent-session-delete"
                  type="button"
                  title={session.running ? '对话正在处理，暂时不能删除' : '删除对话'}
                  aria-label={`删除对话：${session.title}`}
                  disabled={session.running || agent.deletingSessionId !== null}
                  onClick={() => deleteConversation(session)}
                >
                  {agent.deletingSessionId === session.id ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="agent-conversation">
          <header className="agent-conversation__header">
            <div className="agent-identity">
              <span><Users size={19} /></span>
              <div><strong>员工查询</strong><small>员工信息服务</small></div>
            </div>
            {activeSession?.running && <div className="agent-runtime-state"><LoaderCircle className="spin" size={14} /> 正在查询</div>}
          </header>

          <div className="agent-message-list">
            {conversation.length === 0 ? (
              <div className="agent-welcome">
                <span className="agent-welcome__mark"><Users size={23} /></span>
                <h2>员工信息查询</h2>
                <p>输入自然语言问题，查询员工档案、组织关系与人事统计。</p>
                <div className="agent-capabilities">
                  {agentCapabilities.map((capability) => (
                    <div className="agent-capability" key={capability.title}>
                      <strong>{capability.title}</strong>
                      <span>{capability.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : conversation.map((message) => (
              <article className={`agent-message agent-message--${message.kind}`} key={message.id}>
                <div className="agent-message__avatar">
                  {message.kind === 'user' ? user.displayName.slice(0, 1) : message.kind === 'tool' ? <Wrench size={15} /> : message.kind === 'error' ? <AlertCircle size={15} /> : <Users size={16} />}
                </div>
                <div className="agent-message__content">
                  <div className="agent-message__meta">
                    <strong>{message.kind === 'user' ? user.displayName : message.kind === 'tool' ? '数据服务' : message.kind === 'error' ? '系统提示' : '员工查询'}</strong>
                    {message.label && <span>{message.label}</span>}
                  </div>
                  {message.kind === 'assistant' && message.text
                    ? <MarkdownText text={message.text} />
                    : <p>{message.text || '正在生成回答…'}</p>}
                  {message.state === 'running' && <LoaderCircle className="spin agent-message__spinner" size={13} />}
                </div>
              </article>
            ))}
            <div ref={messageEndRef} />
          </div>

          {agent.error && <div className="agent-error"><AlertCircle size={15} /><span>{agent.error}</span></div>}

          <div className="agent-composer">
            <div className="agent-composer__box">
              <textarea
                aria-label="查询员工信息"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={agent.connectionState === 'connected' ? '输入员工、部门或组织信息查询…' : '正在连接员工信息服务…'}
                rows={2}
                disabled={agent.connectionState !== 'connected'}
              />
              <button type="button" onClick={() => submit()} disabled={!draft.trim() || agent.sending || agent.connectionState !== 'connected'} title="发送">
                {agent.sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
            <p><Database size={12} /> 员工数据由系统统一管理 · Enter 发送，Shift + Enter 换行</p>
          </div>
        </div>
      </section>
    </div>
  )
}
