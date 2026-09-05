import { Save, UserRoundPlus, X } from 'lucide-react'

export type CandidateStage = 'none'|'to_contact'|'interview_scheduled'|'interviewing'|'pending_offer'|'hired'|'declined'
export type PipelineCandidate = { id:string; jobId:string; fileName:string; candidateStage:CandidateStage; candidateNotes:string; jobTitle:string; jobDepartment:string }

const labels:Record<Exclude<CandidateStage,'none'>,string> = { to_contact:'待联系', interview_scheduled:'已约面', interviewing:'面试中', pending_offer:'待录用', hired:'已录用', declined:'不考虑' }

export function CandidatePool({ candidates, onChange, onClose }: { readonly candidates:readonly PipelineCandidate[]; readonly onChange:(candidate:PipelineCandidate, stage:CandidateStage, notes:string) => Promise<void>; readonly onClose:(candidate:PipelineCandidate) => Promise<void> }) {
  return <section className="recruitment__pipeline"><header><div><h2>候选名单</h2><p>集中推进已标记候选人的招聘阶段与跟进记录。</p></div><span>{candidates.length} 人</span></header><div className="recruitment__pipeline-list">{candidates.length ? candidates.map(candidate => <CandidateRow key={candidate.id} candidate={candidate} onChange={onChange} onClose={onClose}/>) : <p className="recruitment__none">暂无候选人</p>}</div></section>
}

function CandidateRow({ candidate, onChange, onClose }: { readonly candidate:PipelineCandidate; readonly onChange:(candidate:PipelineCandidate, stage:CandidateStage, notes:string) => Promise<void>; readonly onClose:(candidate:PipelineCandidate) => Promise<void> }) {
  let stage = candidate.candidateStage; let notes = candidate.candidateNotes
  return <article className="recruitment__pipeline-row"><div className="recruitment__pipeline-person"><strong>{candidate.fileName}</strong><span>{candidate.jobTitle}{candidate.jobDepartment ? ` · ${candidate.jobDepartment}` : ''}</span></div><select aria-label="招聘阶段" defaultValue={stage} onChange={event => { stage = event.target.value as CandidateStage }}><option value="to_contact">待联系</option><option value="interview_scheduled">已约面</option><option value="interviewing">面试中</option><option value="pending_offer">待录用</option><option value="hired">已录用</option><option value="declined">不考虑</option></select><textarea aria-label="跟进备注" defaultValue={notes} placeholder="填写跟进备注" onChange={event => { notes = event.target.value }}/><div className="recruitment__pipeline-actions"><button onClick={() => void onChange(candidate,stage,notes)}><Save size={14}/>保存</button><button onClick={() => void onClose(candidate)} title="撤回候选"><X size={15}/>撤回</button></div></article>
}

export const candidateStageLabel = labels
