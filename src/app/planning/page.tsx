'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from '@/features/operating-model/client-context';
import {
  PMBOK_KNOWLEDGE_AREAS,
  PLAN_TEMPLATES,
  getIntegrationDependencies,
  type KnowledgeArea,
} from '@/lib/planning';

type TabType = 'areas' | 'baselines' | 'integration';

interface CreatedPlan {
  id: string;
  areaName: string;
  templateName: string;
  outputs: string[];
  createdAt: string;
}

interface PersistedArtifact {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'changes_requested' | 'superseded';
  version: number;
  title: string;
  content: Record<string, unknown>;
  updated_at?: string;
}

interface PersistedBaseline extends PersistedArtifact {
  baseline_type: 'scope' | 'schedule' | 'cost';
  baseline_value?: number | null;
  currency?: string | null;
  effective_date?: string | null;
}

export default function PlanningPage() {
  const [activeTab, setActiveTab] = useState<TabType>('areas');
  const [selectedArea, setSelectedArea] = useState<KnowledgeArea | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('信息化项目');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdPlans, setCreatedPlans] = useState<CreatedPlan[]>([]);
  const [managementPlan, setManagementPlan] = useState<PersistedArtifact | null>(null);
  const [baselines, setBaselines] = useState<Record<string, PersistedBaseline>>({});
  const [projectName, setProjectName] = useState('');
  const [sourceState, setSourceState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [baselineDrafts, setBaselineDrafts] = useState<Record<string, { summary: string; value: string; currency: string; effectiveDate: string }>>({
    scope: { summary: '', value: '', currency: '', effectiveDate: '' },
    schedule: { summary: '', value: '', currency: '', effectiveDate: '' },
    cost: { summary: '', value: '', currency: 'CNY', effectiveDate: '' },
  });
  const [aiResult, setAiResult] = useState<{
    suggestions: string[];
    checklist: string[];
    warnings: string[];
  } | null>(null);

  const templateKeys = Object.keys(PLAN_TEMPLATES);
  const template = PLAN_TEMPLATES[selectedTemplate];

  const loadPlanningData = useCallback(async () => {
    setSourceState('loading');
    try {
      const params = await loadCurrentBusinessContextSearchParams();
      if (!params.get('project_id') || !params.get('business_role')) throw new Error('请先在顶部选择已授权的项目和业务角色。');
      const response = await fetch(`/api/planning?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as { project?: { name?: string }; plans?: PersistedArtifact[]; baselines?: PersistedBaseline[]; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || '规划数据读取失败');
      setProjectName(payload.project?.name || '当前项目');
      const plan = payload.plans?.[0] ?? null;
      setManagementPlan(plan);
      const sections = plan?.content?.sections && typeof plan.content.sections === 'object' ? plan.content.sections as Record<string, { area_name?: string; outputs?: string[]; narrative?: string; updated_at?: string }> : {};
      setCreatedPlans(Object.entries(sections).map(([id, section]) => ({ id, areaName: section.area_name || id, templateName: String(plan?.content?.template_name || '项目管理计划'), outputs: section.outputs || [], createdAt: section.updated_at ? new Date(section.updated_at).toLocaleString('zh-CN') : '已持久化' })));
      const baselineMap: Record<string, PersistedBaseline> = {};
      for (const baseline of payload.baselines || []) {
        baselineMap[baseline.baseline_type] = baseline;
        setBaselineDrafts(previous => ({ ...previous, [baseline.baseline_type]: { summary: String(baseline.content?.summary || ''), value: baseline.baseline_value == null ? '' : String(baseline.baseline_value), currency: baseline.currency || (baseline.baseline_type === 'cost' ? 'CNY' : ''), effectiveDate: baseline.effective_date || '' } }));
      }
      setBaselines(baselineMap);
      setSourceState('ready');
    } catch (error) {
      setSourceState('unavailable');
      setMessage(error instanceof Error ? error.message : '规划数据源不可用');
      setManagementPlan(null); setBaselines({}); setCreatedPlans([]); setProjectName('');
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadPlanningData(), 0);
    const reload = () => void loadPlanningData();
    window.addEventListener('ai-pmo:project-context-changed', reload);
    window.addEventListener('ai-pmo:business-context-changed', reload);
    window.addEventListener('ai-pmo:data-class-changed', reload);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener('ai-pmo:project-context-changed', reload);
      window.removeEventListener('ai-pmo:business-context-changed', reload);
      window.removeEventListener('ai-pmo:data-class-changed', reload);
    };
  }, [loadPlanningData]);

  const writeContext = (expectedVersion: number) => {
    const context = readStoredBusinessContext();
    const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId) return null;
    return { project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: expectedVersion, idempotency_key: `v63:planning:${projectId}:${crypto.randomUUID()}` };
  };

  const postPlanning = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json() as { detail?: string; error?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || '规划操作失败');
    await loadPlanningData();
  };

  const handleAreaClick = (area: KnowledgeArea) => {
    setSelectedArea(area);
    const sections = managementPlan?.content?.sections && typeof managementPlan.content.sections === 'object' ? managementPlan.content.sections as Record<string, { narrative?: string }> : {};
    setPlanDraft(sections[area.id]?.narrative || '');
    setAiResult(null);
  };

  const handleAIAssist = async () => {
    if (!selectedArea) return;

    setAiLoading(true);
    setShowAIAssistant(true);

    try {
      const contextParams = await loadCurrentBusinessContextSearchParams();
      const response = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'assist',
          project_id: contextParams.get('project_id'),
          business_role: contextParams.get('business_role'),
          data_class: contextParams.get('data_class'),
          project_type: template.type,
          knowledge_area: selectedArea.id,
          context: {
            project_name: projectName,
            user_plan_input: planDraft,
            required_outputs: selectedArea.outputs,
          },
        }),
      });

      const data = await response.json() as { suggestions: string[]; checklist: string[]; warnings: string[]; detail?: string; error?: string };
      if (!response.ok) throw new Error(data.detail || data.error || 'AI规划失败');
      setAiResult(data);
    } catch (error) {
      setAiResult(null);
      setMessage(`AI规划不可用：${error instanceof Error ? error.message : '未知错误'}。系统未使用伪造兜底结果。`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!selectedArea) return;
    if (!planDraft.trim()) { setMessage('请先录入该知识领域的实际规划内容。'); return; }
    const context = writeContext(managementPlan?.version ?? 0);
    if (!context) { setMessage('请先选择已授权的当前项目。'); return; }
    const areaTemplate = template?.areas[selectedArea.id];
    const priorSections = managementPlan?.content?.sections && typeof managementPlan.content.sections === 'object' ? managementPlan.content.sections as Record<string, unknown> : {};
    setSaving('save_management_plan');
    try {
      await postPlanning({ operation: 'save_management_plan', ...context, title: `${projectName}-${template.name}`, source_type: aiResult ? 'ai_assisted' : 'human_input', content: { template_name: template.name, project_type: template.type, sections: { ...priorSections, [selectedArea.id]: { area_name: selectedArea.name, narrative: planDraft.trim(), inputs: selectedArea.planningInputs, tools_techniques: selectedArea.toolsTechniques, outputs: areaTemplate?.outputs ?? selectedArea.outputs, ai_suggestions: aiResult, updated_at: new Date().toISOString() } } } });
      setMessage(`已将${selectedArea.name}计划保存到Supabase正式管理计划。`);
    } catch (error) { setMessage(`管理计划保存失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setSaving(null); }
  };

  const handleSetBaseline = async (baselineType: string) => {
    const label = baselineType === 'scope' ? '范围基准' : baselineType === 'schedule' ? '进度基准' : '成本基准';
    const draft = baselineDrafts[baselineType];
    if (!draft?.summary.trim() || !draft.effectiveDate) { setMessage(`请先录入${label}内容和生效日期。`); return; }
    if (baselineType === 'cost' && (!draft.value || !draft.currency)) { setMessage('成本基准必须录入金额和币种。'); return; }
    const context = writeContext(baselines[baselineType]?.version ?? 0);
    if (!context) { setMessage('请先选择已授权的当前项目。'); return; }
    setSaving(`save_${baselineType}`);
    try {
      await postPlanning({ operation: 'save_baseline', ...context, baseline_type: baselineType, title: `${projectName}-${label}`, content: { summary: draft.summary.trim(), source: 'human_input' }, baseline_value: baselineType === 'cost' ? Number(draft.value) : null, currency: baselineType === 'cost' ? draft.currency : null, effective_date: draft.effectiveDate });
      setMessage(`${label}草稿已保存到Supabase，尚需提交和人工审批。`);
    } catch (error) { setMessage(`${label}保存失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setSaving(null); }
  };

  const transitionPlan = async (transition: string) => {
    if (!managementPlan) return;
    const context = writeContext(managementPlan.version);
    if (!context) return;
    if (['approve', 'reject', 'request_changes'].includes(transition) && !reviewComment.trim()) { setMessage('审批动作必须填写意见。'); return; }
    setSaving(`plan_${transition}`);
    try { await postPlanning({ operation: 'transition_artifact', ...context, artifact_id: managementPlan.id, transition, comment: reviewComment.trim() }); setReviewComment(''); setMessage('管理计划状态已更新并写入审计轨迹。'); }
    catch (error) { setMessage(`管理计划流转失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setSaving(null); }
  };

  const transitionBaseline = async (baselineType: string, transition: string) => {
    const baseline = baselines[baselineType];
    if (!baseline) return;
    const context = writeContext(baseline.version);
    if (!context) return;
    if (['approve', 'reject', 'request_changes'].includes(transition) && !reviewComment.trim()) { setMessage('审批动作必须填写意见。'); return; }
    setSaving(`${baselineType}_${transition}`);
    try { await postPlanning({ operation: 'transition_baseline', ...context, baseline_id: baseline.id, transition, comment: reviewComment.trim() }); setReviewComment(''); setMessage('基准状态已更新并写入审计轨迹。'); }
    catch (error) { setMessage(`基准流转失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setSaving(null); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'var(--green)';
      case 'in-progress':
        return 'var(--amber)';
      default:
        return 'var(--text2)';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'in-progress':
        return '进行中';
      default:
        return '待开始';
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem' }}>📋</span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>规划中心</h1>
            <span className="tag tag-purple">PMBOK 10知识领域</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
              ← 返回首页
            </Link>
            <button
              className="btn-primary"
              onClick={handleAIAssist}
              disabled={!selectedArea || aiLoading}
              style={{
                background: 'var(--purple)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {aiLoading ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'pulse 1s infinite' }}>⏳</span>
                  AI分析中...
                </>
              ) : (
                <>
                  <span>🤖</span>
                  AI规划助手
                </>
              )}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
          基于PMBOK知识体系的项目规划中心 · 支持信息化/课程开发/工程基建/运营服务四类项目
        </p>
        <div style={{ marginTop: 10, fontSize: '0.8rem', color: sourceState === 'ready' ? 'var(--green)' : sourceState === 'loading' ? 'var(--accent)' : 'var(--amber)' }}>
          {sourceState === 'ready' ? `${projectName} · Supabase正式规划数据已连接` : sourceState === 'loading' ? '正在读取当前项目规划数据…' : '规划数据源不可用，请检查项目上下文或数据库迁移'}
          {managementPlan ? ` · 管理计划 ${managementPlan.status} v${managementPlan.version}` : ''}
        </div>
        {message && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: 'var(--purple)', fontSize: '0.85rem' }}>
            {message}
          </div>
        )}
      </div>

      <section className="card" style={{ marginBottom: 24, borderColor: 'rgba(139,92,246,0.35)' }}>
        <div className="section-title" style={{ color: 'var(--purple)' }}>
          <span>🧭</span>
          项目经理实战工作流
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 16 }}>
          这里不是理论说明页。使用者需要录入项目事实、交接资料、相关方、风险、计划和规则，系统再生成可下载的诊断报告、行动清单和最佳实践输出。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Link href="/planning/takeover" className="card card-hover" style={{ textDecoration: 'none', color: 'var(--text)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>🔄</div>
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>中途接手项目如何开展</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.8rem', lineHeight: 1.7 }}>
              基于“中途接手的项目.xmind”，覆盖交接双方、组织过程资产、当前进展、项目难点、相关方和隐形信息，输出接手诊断报告。
            </p>
          </Link>
          <Link href="/planning/new-project" className="card card-hover" style={{ textDecoration: 'none', color: 'var(--text)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>🚀</div>
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>新项目接手最佳实践</h2>
            <p style={{ color: 'var(--text2)', fontSize: '0.8rem', lineHeight: 1.7 }}>
              融合新项目接手XMind、项目管理20步和项目最佳实践路径，形成从了解全局到监控收尾的实操工作流。
            </p>
          </Link>
        </div>
      </section>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        {[
          { id: 'areas', label: '知识领域', icon: '📚' },
          { id: 'baselines', label: '基准管理', icon: '📏' },
          { id: 'integration', label: '整合规划', icon: '🔗' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}
            style={{
              background: activeTab === tab.id ? 'var(--purple)' : undefined,
            }}
          >
            <span style={{ marginRight: '6px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template Selector */}
      <div
        className="card"
        style={{
          marginBottom: '24px',
          background: 'var(--surface2)',
          borderColor: 'var(--purple)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="section-title" style={{ color: 'var(--purple)' }}>
              <span>📋</span>
              计划模板选择
            </div>
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
              选择项目类型，自动生成对应的规划模板
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {templateKeys.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedTemplate(key)}
                className={selectedTemplate === key ? 'btn-primary' : 'btn-secondary'}
                style={{
                  background: selectedTemplate === key ? 'var(--purple)' : undefined,
                  fontSize: '0.85rem',
                  padding: '8px 16px',
                }}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'areas' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left: Knowledge Areas Grid */}
          <div>
            <div className="section-title">
              <span>📚</span>
              PMBOK 10知识领域
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {PMBOK_KNOWLEDGE_AREAS.map((area) => (
                <button
                  key={area.id}
                  onClick={() => handleAreaClick(area)}
                  className="card card-hover"
                  style={{
                    cursor: 'pointer',
                    textAlign: 'left',
                    borderColor: selectedArea?.id === area.id ? 'var(--purple)' : undefined,
                    boxShadow: selectedArea?.id === area.id ? '0 0 0 2px var(--purple)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{area.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{area.name}</div>
                      <div style={{ color: 'var(--text2)', fontSize: '0.7rem' }}>{area.alias}</div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text2)',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {area.description}
                  </div>
                  {template?.areas[area.id] && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        background: 'rgba(139, 92, 246, 0.15)',
                        color: getStatusColor(template.areas[area.id].status),
                        width: 'fit-content',
                      }}
                    >
                      {getStatusLabel(template.areas[area.id].status)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Selected Area Details */}
          <div>
            {selectedArea ? (
              <div className="card" style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <span style={{ fontSize: '2rem' }}>{selectedArea.icon}</span>
                  <div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{selectedArea.name}</h2>
                    <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{selectedArea.alias}</span>
                  </div>
                </div>

                <p style={{ color: 'var(--text2)', marginBottom: '20px', lineHeight: 1.6 }}>
                  {selectedArea.description}
                </p>

                {/* Planning Inputs */}
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--purple)' }}>
                    <span>📥</span>
                    规划输入 (Inputs)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedArea.planningInputs.map((input, idx) => (
                      <span key={idx} className="tag tag-purple" style={{ fontSize: '0.75rem' }}>
                        {input}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tools & Techniques */}
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--cyan)' }}>
                    <span>⚙️</span>
                    工具与技术 (Tools & Techniques)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedArea.toolsTechniques.map((tool, idx) => (
                      <span key={idx} className="tag" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--cyan)', fontSize: '0.75rem' }}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Outputs */}
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--green)' }}>
                    <span>📤</span>
                    输出 (Outputs)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedArea.outputs.map((output, idx) => (
                      <span key={idx} className="tag tag-green" style={{ fontSize: '0.75rem' }}>
                        {output}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Create Plan Button */}
                <div style={{ marginTop: 16 }}>
                  <label className="label">{selectedArea.name}实际规划内容（用户输入）</label>
                  <textarea className="input" rows={7} value={planDraft} onChange={(event) => setPlanDraft(event.target.value)} placeholder="请录入目标、边界、责任人、执行方法、检查频率、升级路径和预期输出。AI建议只能辅助，不能代替实际输入。" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <button
                  className="btn-primary"
                  onClick={() => void handleCreatePlan()}
                  disabled={Boolean(saving) || Boolean(managementPlan && !['draft', 'changes_requested', 'rejected'].includes(managementPlan.status))}
                  style={{
                    width: '100%',
                    background: 'var(--purple)',
                    marginTop: '16px',
                  }}
                >
                  {saving === 'save_management_plan' ? '保存中…' : `保存${selectedArea.name}计划`}
                </button>

                {createdPlans.length > 0 && (
                  <div style={{ marginTop: 20, padding: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>最近创建的计划草案</div>
                    {createdPlans.slice(0, 3).map(plan => (
                      <div key={plan.id} style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 6 }}>
                        {plan.areaName} · {plan.templateName} · {plan.createdAt}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8 }}>管理计划正式流转</div>
                  <textarea className="input" rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="审批、拒绝或退回修改时填写意见" style={{ width: '100%', marginBottom: 8, resize: 'vertical' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => void transitionPlan('submit')} disabled={Boolean(saving) || managementPlan?.status !== 'draft'}>提交审批</button>
                    <button className="btn-secondary" onClick={() => void transitionPlan('approve')} disabled={Boolean(saving) || managementPlan?.status !== 'submitted'} style={{ color: 'var(--green)' }}>批准</button>
                    <button className="btn-secondary" onClick={() => void transitionPlan('request_changes')} disabled={Boolean(saving) || managementPlan?.status !== 'submitted'} style={{ color: 'var(--amber)' }}>退回修改</button>
                    <button className="btn-secondary" onClick={() => void transitionPlan('reject')} disabled={Boolean(saving) || managementPlan?.status !== 'submitted'} style={{ color: 'var(--red)' }}>拒绝</button>
                    <button className="btn-secondary" onClick={() => void transitionPlan('revise')} disabled={Boolean(saving) || !managementPlan || !['changes_requested', 'rejected'].includes(managementPlan.status)}>重新修订</button>
                  </div>
                </div>

                {/* Integration Dependencies */}
                <div style={{ marginTop: '20px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--purple)' }}>
                    🔗 关联领域
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                    与 {getIntegrationDependencies(selectedArea.id).length} 个领域存在数据依赖关系
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="card"
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text2)',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>👈</div>
                <div style={{ fontSize: '1rem', marginBottom: '8px' }}>请选择知识领域</div>
                <div style={{ fontSize: '0.85rem' }}>
                  点击左侧卡片查看详细规划内容
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Baseline Management Tab */}
      {activeTab === 'baselines' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
          {['scope', 'schedule', 'cost'].map((baselineType) => (
            <div key={baselineType} className="card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>
                  {baselineType === 'scope' ? '📐' : baselineType === 'schedule' ? '⏱️' : '💰'}
                </span>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    {baselineType === 'scope' ? '范围基准' : baselineType === 'schedule' ? '进度基准' : '成本基准'}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>
                    {baselineType === 'scope' ? 'Scope Baseline' : baselineType === 'schedule' ? 'Schedule Baseline' : 'Cost Baseline'}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '16px', lineHeight: 1.6 }}>
                {baselineType === 'scope' && '定义项目范围边界，作为测量项目绩效的依据。包括WBS、工作包、范围说明书。'}
                {baselineType === 'schedule' && '定义项目进度计划，作为测量项目进度绩效的依据。包括里程碑、甘特图、活动清单。'}
                {baselineType === 'cost' && '定义项目预算分配，作为测量项目成本绩效的依据。包括预算分解、成本基准。'}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">基准内容（用户输入）</label>
                <textarea className="input" rows={5} value={baselineDrafts[baselineType]?.summary || ''} onChange={(event) => setBaselineDrafts(previous => ({ ...previous, [baselineType]: { ...previous[baselineType], summary: event.target.value } }))} placeholder={baselineType === 'scope' ? '录入范围说明、WBS边界、验收标准和排除项' : baselineType === 'schedule' ? '录入计划起止、里程碑、关键路径和进度控制规则' : '录入预算构成、控制账户、储备和成本控制规则'} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                <label className="label" style={{ marginTop: 10 }}>生效日期</label>
                <input className="input" type="date" value={baselineDrafts[baselineType]?.effectiveDate || ''} onChange={(event) => setBaselineDrafts(previous => ({ ...previous, [baselineType]: { ...previous[baselineType], effectiveDate: event.target.value } }))} style={{ width: '100%' }} />
                {baselineType === 'cost' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 10 }}>
                    <input className="input" type="number" min="0" step="0.01" value={baselineDrafts.cost?.value || ''} onChange={(event) => setBaselineDrafts(previous => ({ ...previous, cost: { ...previous.cost, value: event.target.value } }))} placeholder="基准金额" />
                    <select className="input" value={baselineDrafts.cost?.currency || 'CNY'} onChange={(event) => setBaselineDrafts(previous => ({ ...previous, cost: { ...previous.cost, currency: event.target.value } }))}><option value="CNY">CNY</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div className="label">基准状态</div>
                <span
                  className={baselines[baselineType] ? 'tag tag-green' : 'tag tag-amber'}
                  style={{ fontSize: '0.8rem' }}
                >
                  {baselines[baselineType]?.status ?? '未保存'}
                </span>
                {baselines[baselineType] && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text2)' }}>
                    版本：v{baselines[baselineType].version} · 更新时间：{baselines[baselineType].updated_at ? new Date(baselines[baselineType].updated_at!).toLocaleString('zh-CN') : '—'}
                  </div>
                )}
              </div>

              <button
                className="btn-secondary"
                onClick={() => void handleSetBaseline(baselineType)}
                disabled={Boolean(saving) || Boolean(baselines[baselineType] && !['draft', 'changes_requested', 'rejected'].includes(baselines[baselineType].status))}
                style={{
                  width: '100%',
                  borderColor: 'var(--purple)',
                  color: 'var(--purple)',
                }}
              >
                {saving === `save_${baselineType}` ? '保存中…' : `保存${baselineType === 'scope' ? '范围' : baselineType === 'schedule' ? '进度' : '成本'}基准草稿`}
              </button>
              <textarea className="input" rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="审批意见（审批、拒绝或退回修改时必填）" style={{ width: '100%', marginTop: 10, resize: 'vertical' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => void transitionBaseline(baselineType, 'submit')} disabled={Boolean(saving) || baselines[baselineType]?.status !== 'draft'}>提交</button>
                <button className="btn-secondary" onClick={() => void transitionBaseline(baselineType, 'approve')} disabled={Boolean(saving) || baselines[baselineType]?.status !== 'submitted'} style={{ color: 'var(--green)' }}>批准</button>
                <button className="btn-secondary" onClick={() => void transitionBaseline(baselineType, 'request_changes')} disabled={Boolean(saving) || baselines[baselineType]?.status !== 'submitted'} style={{ color: 'var(--amber)' }}>退回</button>
                <button className="btn-secondary" onClick={() => void transitionBaseline(baselineType, 'reject')} disabled={Boolean(saving) || baselines[baselineType]?.status !== 'submitted'} style={{ color: 'var(--red)' }}>拒绝</button>
                <button className="btn-secondary" onClick={() => void transitionBaseline(baselineType, 'revise')} disabled={Boolean(saving) || !baselines[baselineType] || !['changes_requested', 'rejected'].includes(baselines[baselineType].status)}>修订</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integration Planning Tab */}
      {activeTab === 'integration' && (
        <div className="card">
          <div className="section-title">
            <span>🔗</span>
            整合规划视图
          </div>
          <p style={{ color: 'var(--text2)', marginBottom: '24px', fontSize: '0.9rem' }}>
            展示PMBOK 10个知识领域之间的依赖关系和集成点
          </p>

          {/* Integration Flow */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '20px',
              background: 'var(--surface2)',
              borderRadius: '12px',
            }}
          >
            {/* Top row - core areas */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {['scope', 'schedule', 'cost'].map((areaId) => {
                const area = PMBOK_KNOWLEDGE_AREAS.find((a) => a.id === areaId);
                return (
                  <div
                    key={areaId}
                    className="card"
                    style={{
                      padding: '12px 20px',
                      textAlign: 'center',
                      minWidth: '120px',
                      borderColor: 'var(--purple)',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{area?.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{area?.name}</div>
                  </div>
                );
              })}
            </div>

            {/* Arrow */}
            <div style={{ textAlign: 'center', color: 'var(--purple)', fontSize: '1.5rem' }}>↓</div>

            {/* Center - Integration */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div
                className="card"
                style={{
                  padding: '16px 32px',
                  textAlign: 'center',
                  borderColor: 'var(--purple)',
                  background: 'rgba(139, 92, 246, 0.1)',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>🔗</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--purple)' }}>整合管理</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '4px' }}>Integration</div>
              </div>
            </div>

            {/* Arrow */}
            <div style={{ textAlign: 'center', color: 'var(--purple)', fontSize: '1.5rem' }}>↓</div>

            {/* Bottom row - supporting areas */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {['quality', 'resource', 'communications', 'risk', 'procurement', 'stakeholder'].map((areaId) => {
                const area = PMBOK_KNOWLEDGE_AREAS.find((a) => a.id === areaId);
                return (
                  <div
                    key={areaId}
                    style={{
                      padding: '10px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      textAlign: 'center',
                      minWidth: '100px',
                    }}
                  >
                    <div style={{ fontSize: '1rem', marginBottom: '2px' }}>{area?.icon}</div>
                    <div style={{ fontWeight: 500, fontSize: '0.75rem' }}>{area?.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Integration Dependencies Table */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>依赖关系矩阵</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text2)' }}>领域</th>
                    <th style={{ padding: '10px', textAlign: 'center', color: 'var(--text2)' }}>依赖</th>
                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text2)' }}>关联输出</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { from: '整合管理', to: '全部领域', output: '项目管理计划、项目章程' },
                    { from: '范围管理', to: '进度/成本', output: '范围基准 → 进度/成本估算输入' },
                    { from: '进度管理', to: '成本/资源', output: '进度计划 → 资源需求/成本估算输入' },
                    { from: '成本管理', to: '采购/风险', output: '成本基准 → 采购预算/风险储备' },
                    { from: '风险管理', to: '全部领域', output: '风险登记册 → 影响所有领域' },
                  ].map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--surface2)' }}>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{row.from}</td>
                      <td style={{ padding: '10px', textAlign: 'center', color: 'var(--purple)' }}>{row.to}</td>
                      <td style={{ padding: '10px', color: 'var(--text2)' }}>{row.output}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Overlay */}
      {showAIAssistant && selectedArea && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAIAssistant(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>AI规划助手</h3>
                <span className="tag tag-purple">{selectedArea.name}</span>
              </div>
              <button
                onClick={() => setShowAIAssistant(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text2)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
                <div style={{ color: 'var(--text2)' }}>正在分析{selectedArea.name}的规划要点...</div>
              </div>
            ) : aiResult ? (
              <div>
                {/* Suggestions */}
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--purple)' }}>
                    💡 规划建议
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {aiResult.suggestions.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '10px 12px',
                          background: 'var(--surface2)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                        }}
                      >
                        <span style={{ color: 'var(--purple)', fontWeight: 700 }}>→</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checklist */}
                <div style={{ marginBottom: '20px' }}>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--cyan)' }}>
                    ✅ 规划检查清单
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiResult.checklist.map((c, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--surface2)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span style={{ color: 'var(--cyan)' }}>☐</span>
                        {c}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warnings */}
                <div>
                  <div className="section-title" style={{ fontSize: '0.95rem', color: 'var(--amber)' }}>
                    ⚠️ 常见陷阱
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiResult.warnings.map((w, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          borderLeft: '3px solid var(--amber)',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          color: 'var(--amber)',
                        }}
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
