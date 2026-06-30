'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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

export default function PlanningPage() {
  const [activeTab, setActiveTab] = useState<TabType>('areas');
  const [selectedArea, setSelectedArea] = useState<KnowledgeArea | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('信息化项目');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdPlans, setCreatedPlans] = useState<CreatedPlan[]>([]);
  const [baselines, setBaselines] = useState<Record<string, { status: string; updatedAt: string }>>({});
  const [aiResult, setAiResult] = useState<{
    suggestions: string[];
    checklist: string[];
    warnings: string[];
  } | null>(null);

  const templateKeys = Object.keys(PLAN_TEMPLATES);
  const template = PLAN_TEMPLATES[selectedTemplate];

  const handleAreaClick = (area: KnowledgeArea) => {
    setSelectedArea(area);
  };

  const handleAIAssist = async () => {
    if (!selectedArea) return;

    setAiLoading(true);
    setShowAIAssistant(true);

    try {
      const response = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: template.type,
          knowledgeArea: selectedArea.id,
          context: {
            projectName: '示例项目',
            objectives: ['按时交付', '控制成本', '保证质量'],
          },
        }),
      });

      if (!response.ok) throw new Error('AI request failed');

      const data = await response.json();
      setAiResult(data);
    } catch (error) {
      console.error('AI Assistant error:', error);
      setAiResult({
        suggestions: [
          `${selectedArea.name}计划应先明确输入、方法和输出，再形成可审批的管理计划。`,
          '建议先复用当前项目类型模板，再根据项目等级裁剪控制强度。',
          '对需要跨部门协同的事项，应在计划中写清责任人、触发条件和升级路径。',
        ],
        checklist: selectedArea.outputs.map(output => `已定义${output}`),
        warnings: ['AI服务不可用时使用本地模板兜底；正式计划仍需项目经理和PMO复核。'],
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreatePlan = () => {
    if (!selectedArea) return;
    const areaTemplate = template?.areas[selectedArea.id];
    const plan: CreatedPlan = {
      id: `PLAN-${Date.now()}`,
      areaName: selectedArea.name,
      templateName: template.name,
      outputs: areaTemplate?.outputs ?? selectedArea.outputs,
      createdAt: new Date().toLocaleString('zh-CN'),
    };
    setCreatedPlans(prev => [plan, ...prev]);
    setMessage(`已创建${selectedArea.name}计划草案，输出项：${plan.outputs.join('、')}。`);
  };

  const handleSetBaseline = (baselineType: string) => {
    const label = baselineType === 'scope' ? '范围基准' : baselineType === 'schedule' ? '进度基准' : '成本基准';
    setBaselines(prev => ({
      ...prev,
      [baselineType]: { status: '已设置', updatedAt: new Date().toLocaleString('zh-CN') },
    }));
    setMessage(`已设置${label}草案。后续可接入飞书或Supabase保存正式基准版本。`);
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
                <button
                  className="btn-primary"
                  onClick={handleCreatePlan}
                  style={{
                    width: '100%',
                    background: 'var(--purple)',
                    marginTop: '16px',
                  }}
                >
                  创建{selectedArea.name}计划
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

              <div style={{ marginBottom: '16px' }}>
                <div className="label">基准状态</div>
                <span
                  className={baselines[baselineType] ? 'tag tag-green' : 'tag tag-amber'}
                  style={{ fontSize: '0.8rem' }}
                >
                  {baselines[baselineType]?.status ?? '待设置'}
                </span>
                {baselines[baselineType] && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text2)' }}>
                    更新时间：{baselines[baselineType].updatedAt}
                  </div>
                )}
              </div>

              <button
                className="btn-secondary"
                onClick={() => handleSetBaseline(baselineType)}
                style={{
                  width: '100%',
                  borderColor: 'var(--purple)',
                  color: 'var(--purple)',
                }}
              >
                设置{baselineType === 'scope' ? '范围' : baselineType === 'schedule' ? '进度' : '成本'}基准
              </button>
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
