import { BriefcaseBusiness, FileUp, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ModuleProps } from '../../app/types'
import './recruitment.css'

type Job = { id:string; title:string; department:string; status:'open'|'closed'; candidates:number }
type Candidate = { id:string; fileName:string; mimeType:string; bucket:'priority'|'review'|'unrelated'; reasons:string[]; status:'pending'|'eliminated'|'restored' }
type JobDraft = { title:string; department:string; responsibilities:string; requiredConditions:string; preferredConditions:string; exclusionConditions:string; workLocation:string; educationRequirement:string; experienceRequirement:string }

const empty:JobDraft = { title:'', department:'', responsibilities:'', requiredConditions:'', preferredConditions:'', exclusionConditions:'', workLocation:'', educationRequirement:'', experienceRequirement:'' }

async function api<T>(path:string, init:RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials:'same-origin', headers:{ 'content-type':'application/json', ...(init.headers ?? {}) } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.error === 'string' ? body.error : `请求失败（${response.status}）`)
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}

function base64(file:File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',').at(-1) ?? '') : reject(new Error('读取简历失败。'))
    reader.onerror = () => reject(new Error('读取简历失败。'))
    reader.readAsDataURL(file)
  })
}

export function RecruitmentManagementModule(_props:ModuleProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [draft, setDraft] = useState<JobDraft | null>(null)
  const [message, setMessage] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const load = () => api<{ jobs:Job[] }>('/api/recruitment/jobs').then(data => setJobs(data.jobs)).catch(error => setMessage(error.message))
  const loadCandidates = (id:string) => api<{ candidates:Candidate[] }>(`/api/recruitment/jobs/${id}/candidates`).then(data => setCandidates(data.candidates)).catch(error => setMessage(error.message))

  useEffect(() => { load() }, [])
  function choose(job:Job) { setSelected(job); setCandidates([]); loadCandidates(job.id) }
  async function create() {
    if (!draft) return
    try {
      const data = await api<{ id:string }>('/api/recruitment/jobs', { method:'POST', body:JSON.stringify(draft) })
      const job = { id:data.id, title:draft.title, department:draft.department, status:'open' as const, candidates:0 }
      setDraft(null); await load(); setMessage('岗位已创建。'); choose(job)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  async function upload(files:FileList | null) {
    if (!selected || !files?.length) return
    const list = [...files]
    if (list.some(file => file.size > 5 * 1024 * 1024)) { setMessage('单份简历不能超过 5 MB。'); return }
    setFileBusy(true)
    try {
      let uploaded = 0
      for (const file of list) {
        const payload = { fileName:file.name, mimeType:file.type || 'application/octet-stream', base64:await base64(file) }
        const result = await api<{ count:number }>(`/api/recruitment/jobs/${selected.id}/candidates`, { method:'POST', body:JSON.stringify({ files:[payload] }) })
        uploaded += result.count
      }
      setMessage(`已上传 ${uploaded} 份简历，筛选结果已生成。`)
      loadCandidates(selected.id); load()
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setFileBusy(false); if (fileInput) fileInput.value = '' }
  }
  async function status(ids:string[], value:'eliminated'|'restored') {
    if (!selected || !ids.length) return
    if (value === 'eliminated' && !confirm(`确认淘汰 ${ids.length} 份简历？可在已淘汰中恢复。`)) return
    await api(`/api/recruitment/jobs/${selected.id}/candidates/${ids[0]}/status`, { method:'POST', body:JSON.stringify({ ids, status:value }) })
    loadCandidates(selected.id); setMessage(value === 'eliminated' ? '已更新为淘汰。' : '已恢复至人工复核。')
  }
  async function remove(id:string) {
    if (!selected || !confirm('确认永久删除这份简历及其筛选记录？')) return
    await api(`/api/recruitment/jobs/${selected.id}/candidates/${id}`, { method:'DELETE' })
    loadCandidates(selected.id); load(); setMessage('简历已删除。')
  }
  const buckets:[Candidate['bucket'], string][] = [['priority','优先查看'], ['review','人工复核'], ['unrelated','明显不匹配']]
  return <div className="recruitment module-page">
    <header><div><h1>招聘管理</h1><p>按岗位批量筛选简历，保留人工确认与恢复入口。</p></div><button className="recruitment__primary" onClick={() => setDraft(empty)}><Plus size={16}/>新建岗位</button></header>
    {message && <p className="recruitment__message">{message}</p>}
    <main><aside><h2>招聘岗位</h2>{jobs.map(job => <button className={selected?.id === job.id ? 'is-active' : ''} key={job.id} onClick={() => choose(job)}><strong>{job.title}</strong><span>{job.department || '未填写部门'} · {job.candidates} 份简历</span></button>)}{!jobs.length && <p>暂无岗位，请先新建。</p>}</aside>
      <section className="recruitment__content">{!selected ? <div className="recruitment__empty"><BriefcaseBusiness size={28}/><p>选择或新建一个岗位后开始筛选简历。</p></div> : <>
        <header><div><h2>{selected.title}</h2><span>{selected.department || '未填写部门'}</span></div><button className="recruitment__upload" disabled={fileBusy} onClick={() => fileInput?.click()}><FileUp size={16}/>{fileBusy ? '上传中…' : '上传简历'}</button><input ref={setFileInput} type="file" multiple accept=".pdf,.doc,.docx" onChange={event => void upload(event.target.files)}/></header>
        {buckets.map(([bucket, label]) => { const items = candidates.filter(candidate => candidate.bucket === bucket); return <section className="recruitment__bucket" key={bucket}><header><h3>{label}<small>{items.length}</small></h3>{bucket === 'unrelated' && items.some(item => item.status !== 'eliminated') && <button onClick={() => void status(items.filter(item => item.status !== 'eliminated').map(item => item.id), 'eliminated')}>一键淘汰</button>}</header>{items.map(candidate => <article className={candidate.status === 'eliminated' ? 'is-eliminated' : ''} key={candidate.id}><div><a href={`/api/recruitment/jobs/${selected.id}/candidates/${candidate.id}/file`} target="_blank" rel="noreferrer">{candidate.fileName}</a><p>{candidate.reasons.join(' ')}</p></div><div>{candidate.status === 'eliminated' ? <button onClick={() => void status([candidate.id], 'restored')}><RotateCcw size={14}/>恢复</button> : <button className="is-danger" onClick={() => void status([candidate.id], 'eliminated')}>淘汰</button>}<button className="recruitment__delete" onClick={() => void remove(candidate.id)} title="永久删除"><Trash2 size={15}/></button></div></article>)}{!items.length && <p className="recruitment__none">暂无简历</p>}</section> })}
      </>}</section></main>
    {draft && <div className="recruitment__modal"><button className="recruitment__backdrop" onClick={() => setDraft(null)}/><section><header><h2>新建招聘岗位</h2><button onClick={() => setDraft(null)}><X size={18}/></button></header>{Object.entries({ title:'岗位名称', department:'招聘部门', responsibilities:'岗位职责', requiredConditions:'必需条件（用顿号或换行分隔）', preferredConditions:'加分条件', exclusionConditions:'明确不考虑的情况', workLocation:'工作地点', educationRequirement:'学历要求', experienceRequirement:'工作经验要求' }).map(([key,label]) => <label key={key}>{label}<textarea rows={key === 'responsibilities' ? 4 : 2} value={draft[key as keyof JobDraft]} onChange={event => setDraft({ ...draft, [key]:event.target.value })}/></label>)}<footer><button onClick={() => setDraft(null)}>取消</button><button className="recruitment__primary" onClick={() => void create()}>创建岗位</button></footer></section></div>}
  </div>
}
