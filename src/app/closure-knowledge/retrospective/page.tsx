"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type Candidate = { id:string; candidate_type:string; title:string; summary:string; status:string };
type RecommendationRequest = { id:string; scenario:string; trigger_type:string; recommendations:Record<string,unknown>; created_at:string };
type Workspace = { error?:string; detail?:string; candidates?:Candidate[]; recommendation_requests?:RecommendationRequest[] };
function lines(value:string){return value.split("\n").map(item=>item.trim()).filter(Boolean);}

export default function RetrospectiveKnowledgePage(){
  const [context,setContext]=useState<StoredBusinessContext|null>(null);
  const [projectId,setProjectId]=useState("");
  const [data,setData]=useState<Workspace>({});
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [reviewNote,setReviewNote]=useState("");
  const [form,setForm]=useState({objectives:"",outcomes:"",deviations:"",rootCauses:"",keyDecisions:"",actionEffects:"",lessons:"",applicability:"",templateGaps:"",governanceSuggestions:"",evidenceIds:"",ownerUserId:"",dueAt:""});
  const [recommend,setRecommend]=useState({triggerType:"manual",sourceId:"",scenario:"milestone_delay",tags:""});
  const queryFor=useCallback((active:StoredBusinessContext,id:string)=>{const query=businessContextSearchParams(active,readStoredDataClass());query.set("project_id",id);return query;},[]);
  const load=useCallback(async(active:StoredBusinessContext,id:string)=>{try{const response=await fetch(`/api/closure-knowledge/automation?${queryFor(active,id)}`,{cache:"no-store"});const body=await response.json() as Workspace;if(!response.ok)throw new Error(body.detail||body.error||"知识自动化工作区加载失败");setData(body);}catch(error){setNotice(error instanceof Error?error.message:"加载失败");}},[queryFor]);
  useEffect(()=>{const timer=window.setTimeout(()=>{const stored=readStoredBusinessContext();const current=readStoredCurrentProject();if(stored&&current){setContext(stored);setProjectId(current);void load(stored,current);}else setNotice("请先在顶部选择业务身份和当前项目。");},0);return()=>window.clearTimeout(timer);},[load]);
  async function mutate(body:Record<string,unknown>,success:string){if(!context||!projectId)return;setBusy(true);setNotice("");try{const response=await fetch(`/api/closure-knowledge/automation?${queryFor(context,projectId)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||"操作失败");setNotice(success);await load(context,projectId);}catch(error){setNotice(error instanceof Error?error.message:"操作失败");}finally{setBusy(false);}}
  async function submit(){await mutate({operation:"submit_retrospective",objectives:form.objectives,outcomes:form.outcomes,deviations:form.deviations,root_causes:form.rootCauses,key_decisions:form.keyDecisions,action_effects:form.actionEffects,lessons:form.lessons,applicability_conditions:form.applicability,template_gaps:form.templateGaps,governance_suggestions:form.governanceSuggestions,evidence_ids:lines(form.evidenceIds),improvement_owner_user_id:form.ownerUserId,improvement_due_at:form.dueAt?new Date(form.dueAt).toISOString():""},"复盘已提交并生成待人工评审的知识、改进、模板和规则候选。");}

  return <main style={{minHeight:"100vh",background:"var(--bg)"}}>
    <header style={{padding:"15px 28px",borderBottom:"1px solid var(--border)",background:"var(--surface)",display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}><Link href="/closure-knowledge" style={{color:"var(--text2)",textDecoration:"none"}}>← 返回收尾与知识</Link><strong>项目复盘与知识自动化</strong>{projectId&&<span className="tag tag-purple">项目 {projectId}</span>}</header>
    <div style={{maxWidth:1320,margin:"0 auto",padding:28}}>
      <section className="card" style={{marginBottom:18}}><h1 style={{fontSize:"1.4rem"}}>项目复盘与知识自动化</h1><p style={{color:"var(--text2)",lineHeight:1.8,marginTop:8}}>使用者输入目标、结果、偏差、根因、关键决策、行动效果、经验和证据；系统把它们结构化成候选。所有候选必须由 PMO/质量人工评审后才能发布，不会把AI总结直接变成制度。</p></section>
      {notice&&<section className="card" style={{marginBottom:18,borderColor:"rgba(245,158,11,.45)"}}>{notice}</section>}
      <section className="card" style={{marginBottom:18}}><h2>提交有输入、有证据的复盘</h2><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
        <textarea className="input" placeholder="项目目标*" value={form.objectives} onChange={e=>setForm({...form,objectives:e.target.value})}/><textarea className="input" placeholder="实际结果*" value={form.outcomes} onChange={e=>setForm({...form,outcomes:e.target.value})}/>
        <textarea className="input" placeholder="主要偏差" value={form.deviations} onChange={e=>setForm({...form,deviations:e.target.value})}/><textarea className="input" placeholder="根因*" value={form.rootCauses} onChange={e=>setForm({...form,rootCauses:e.target.value})}/>
        <textarea className="input" placeholder="关键决策" value={form.keyDecisions} onChange={e=>setForm({...form,keyDecisions:e.target.value})}/><textarea className="input" placeholder="行动及实际效果" value={form.actionEffects} onChange={e=>setForm({...form,actionEffects:e.target.value})}/>
        <textarea className="input" placeholder="经验教训*" value={form.lessons} onChange={e=>setForm({...form,lessons:e.target.value})}/><textarea className="input" placeholder="适用条件*" value={form.applicability} onChange={e=>setForm({...form,applicability:e.target.value})}/>
        <textarea className="input" placeholder="现有模板缺口" value={form.templateGaps} onChange={e=>setForm({...form,templateGaps:e.target.value})}/><textarea className="input" placeholder="治理规则建议" value={form.governanceSuggestions} onChange={e=>setForm({...form,governanceSuggestions:e.target.value})}/>
        <textarea className="input" placeholder="已核验证据 UUID，一行一个*" value={form.evidenceIds} onChange={e=>setForm({...form,evidenceIds:e.target.value})}/><div style={{display:"grid",gap:8}}><input className="input" placeholder="改进责任人 UUID" value={form.ownerUserId} onChange={e=>setForm({...form,ownerUserId:e.target.value})}/><input className="input" type="datetime-local" value={form.dueAt} onChange={e=>setForm({...form,dueAt:e.target.value})}/></div>
      </div><button className="btn-primary" disabled={busy} style={{marginTop:10}} onClick={()=>void submit()}>提交复盘并生成候选</button></section>
      <section className="card" style={{marginBottom:18}}><h2>候选人工评审</h2><input className="input" style={{width:"100%",marginTop:10}} placeholder="评审意见（批准/驳回必填）" value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/><div style={{display:"grid",gap:10,marginTop:12}}>{(data.candidates??[]).map(item=><article key={item.id} style={{padding:12,border:"1px solid var(--border)",borderRadius:10}}><div style={{display:"flex",justifyContent:"space-between"}}><strong>{item.title}</strong><span className="tag tag-blue">{item.candidate_type} · {item.status}</span></div><p style={{color:"var(--text2)",whiteSpace:"pre-wrap",marginTop:6}}>{item.summary}</p><div style={{display:"flex",gap:8,marginTop:10}}>{item.status==="pending_review"&&<><button className="btn-primary" disabled={busy} onClick={()=>void mutate({operation:"review_candidate",candidate_id:item.id,decision:"approve",review_note:reviewNote},"候选已批准，尚未发布。")}>批准候选</button><button className="btn-secondary" disabled={busy} onClick={()=>void mutate({operation:"review_candidate",candidate_id:item.id,decision:"reject",review_note:reviewNote},"候选已驳回。")}>驳回</button></>}{item.status==="approved"&&<button className="btn-primary" disabled={busy} onClick={()=>void mutate({operation:"materialize_candidate",candidate_id:item.id},"候选已转为知识草稿/改进行动，仍需既有知识发布流程复核。")}>生成知识草稿或改进行动</button>}</div></article>)}</div></section>
      <section className="card" style={{marginBottom:18}}><h2>相似案例、模板与历史决策</h2><p style={{color:"var(--text2)",marginTop:6}}>新项目启动或出现异常时，按项目等级、类型、场景与标签计算匹配理由，并记录是否采纳和效果。</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginTop:10}}><select className="input" value={recommend.triggerType} onChange={e=>setRecommend({...recommend,triggerType:e.target.value})}><option value="new_project">新项目启动</option><option value="management_signal">管理异常</option><option value="manual">人工查询</option></select><input className="input" placeholder="触发来源ID，可空" value={recommend.sourceId} onChange={e=>setRecommend({...recommend,sourceId:e.target.value})}/><input className="input" placeholder="场景，例如milestone_delay" value={recommend.scenario} onChange={e=>setRecommend({...recommend,scenario:e.target.value})}/><input className="input" placeholder="标签，逗号分隔" value={recommend.tags} onChange={e=>setRecommend({...recommend,tags:e.target.value})}/></div><button className="btn-primary" disabled={busy} style={{marginTop:10}} onClick={()=>void mutate({operation:"recommend_knowledge",trigger_type:recommend.triggerType,trigger_source_id:recommend.sourceId,scenario:recommend.scenario,tags:recommend.tags.split(",").map(item=>item.trim()).filter(Boolean)},"相似知识、模板和历史决策已生成并登记复用跟踪。")}>生成可解释推荐</button><div style={{display:"grid",gap:10,marginTop:12}}>{(data.recommendation_requests??[]).map(item=><article key={item.id} style={{padding:12,border:"1px solid var(--border)",borderRadius:10}}><strong>{item.trigger_type} · {item.scenario}</strong><small style={{marginLeft:8}}>{new Date(item.created_at).toLocaleString("zh-CN")}</small><pre style={{whiteSpace:"pre-wrap",fontSize:".75rem",background:"var(--surface2)",padding:10,borderRadius:8,marginTop:8}}>{JSON.stringify(item.recommendations,null,2)}</pre></article>)}</div></section>
    </div>
  </main>;
}

