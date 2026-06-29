'use client';

import React from 'react';
import Link from 'next/link';
import {
  initialProjects,
  initialOKRs,
  governanceMetrics,
  prince2Gates,
  calculatePortfolioOverview,
  getStatusColor,
  getTierColor,
  getOKRStatusLabel,
  getOKRStatusColor,
} from '@/lib/pmo';

export default function PMOPage() {
  const portfolio = calculatePortfolioOverview(initialProjects);

  // Get escalation projects (critical + concern)
  const escalationProjects = initialProjects.filter(
    p => p.overallStatus === 'critical' || p.overallStatus === 'concern'
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            PMO治理中心
          </h1>
          <Link href="/" className="btn-secondary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
            ← 返回首页
          </Link>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
          项目组合健康度监控 · OKR追踪 · PRINCE2合规 · 治理指标
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
        <button className="btn-primary">创建项目</button>
        <button className="btn-secondary">生成报告</button>
        <button className="btn-secondary">查看风险</button>
      </div>

      {/* Portfolio Overview Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card">
          <div className="stat-num" style={{ color: 'var(--accent2)' }}>{portfolio.totalProjects}</div>
          <div className="stat-label">活跃项目</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{portfolio.healthDistribution.healthy}</div>
          <div className="stat-label">健康项目</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: 'var(--amber)' }}>{portfolio.healthDistribution.concern}</div>
          <div className="stat-label">关注项目</div>
        </div>
        <div className="stat-card">
          <div className="stat-num" style={{ color: 'var(--red)' }}>{portfolio.healthDistribution.critical}</div>
          <div className="stat-label">危急项目</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Project Tier Classification */}
          <div className="card">
            <div className="section-title">
              <span>📊</span>
              项目分层分类
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {(['S', 'A', 'B', 'C'] as const).map(tier => (
                <div
                  key={tier}
                  style={{
                    background: 'var(--surface2)',
                    borderRadius: '10px',
                    padding: '16px',
                    textAlign: 'center',
                    border: `2px solid ${getTierColor(tier)}`,
                  }}
                >
                  <div
                    className="tag"
                    style={{
                      background: `${getTierColor(tier)}20`,
                      color: getTierColor(tier),
                      marginBottom: '8px',
                    }}
                  >
                    {tier}级
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                    {portfolio.tierDistribution[tier]}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '4px' }}>个项目</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text2)' }}>
              <div style={{ marginBottom: '4px' }}><span style={{ color: '#ef4444' }}>●</span> S级: 战略级(≥500万)</div>
              <div style={{ marginBottom: '4px' }}><span style={{ color: '#f59e0b' }}>●</span> A级: 重要级(100-500万)</div>
              <div style={{ marginBottom: '4px' }}><span style={{ color: '#3b82f6' }}>●</span> B级: 标准级(30-100万)</div>
              <div><span style={{ color: '#6b7280' }}>●</span> C级: 轻量级(&lt;30万)</div>
            </div>
          </div>

          {/* Health Status Distribution */}
          <div className="card">
            <div className="section-title">
              <span>📈</span>
              健康状态分布
            </div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'center' }}>
              {(['healthy', 'concern', 'critical'] as const).map(status => (
                <div key={status} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${getStatusColor(status === 'healthy' ? 'green' : status === 'concern' ? 'amber' : 'red')}15`,
                      border: `3px solid ${getStatusColor(status === 'healthy' ? 'green' : status === 'concern' ? 'amber' : 'red')}`,
                    }}
                  >
                    <span style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: getStatusColor(status === 'healthy' ? 'green' : status === 'concern' ? 'amber' : 'red')
                    }}>
                      {portfolio.healthDistribution[status]}
                    </span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text2)' }}>
                    {status === 'healthy' ? '健康' : status === 'concern' ? '关注' : '危急'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Governance Metrics */}
          <div className="card">
            <div className="section-title">
              <span>📏</span>
              治理指标
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {governanceMetrics.map(metric => (
                <div
                  key={metric.name}
                  style={{
                    background: 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '16px',
                    borderLeft: `4px solid ${getStatusColor(metric.status)}`,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '4px' }}>
                    {metric.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: getStatusColor(metric.status) }}>
                      {metric.value}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>{metric.unit}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text2)', marginLeft: '8px' }}>
                      / 目标 {metric.target}{metric.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Escalation Panel */}
          <div className="card">
            <div className="section-title">
              <span>🚨</span>
              待升级项目
              <span
                className="tag tag-amber"
                style={{ marginLeft: 'auto' }}
              >
                {escalationProjects.length} 个
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {escalationProjects.map(project => (
                <div
                  key={project.id}
                  style={{
                    background: 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    borderLeft: `4px solid ${
                      project.overallStatus === 'critical' ? 'var(--red)' : 'var(--amber)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{project.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                      进度: {project.scheduleStatus === 'green' ? '正常' : project.scheduleStatus === 'amber' ? '延迟' : '严重'}
                      | 预算: {project.budgetStatus === 'green' ? '正常' : project.budgetStatus === 'amber' ? '超支' : '严重'}
                    </div>
                  </div>
                  <div
                    className="tag"
                    style={{
                      background: `${getTierColor(project.tier)}20`,
                      color: getTierColor(project.tier),
                    }}
                  >
                    {project.tier}级
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* OKR Tracking Section */}
          <div className="card">
            <div className="section-title">
              <span>🎯</span>
              OKR追踪
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {initialOKRs.map(okr => (
                <div
                  key={okr.id}
                  style={{
                    background: 'var(--surface2)',
                    borderRadius: '10px',
                    padding: '16px',
                    border: `1px solid ${getOKRStatusColor(okr.status)}30`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 600 }}>{okr.objective}</div>
                    <div
                      className="tag"
                      style={{
                        background: `${getOKRStatusColor(okr.status)}20`,
                        color: getOKRStatusColor(okr.status),
                      }}
                    >
                      {getOKRStatusLabel(okr.status)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {okr.keyResults.map(kr => (
                      <div key={kr.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text2)' }}>{kr.description}</span>
                          <span>
                            <span style={{ fontWeight: 600 }}>{kr.current}</span>
                            <span style={{ color: 'var(--text2)' }}>/{kr.target}{kr.unit}</span>
                          </span>
                        </div>
                        <div
                          style={{
                            height: '6px',
                            background: 'var(--border)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${kr.progress}%`,
                              height: '100%',
                              background: getOKRStatusColor(okr.status),
                              borderRadius: '3px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text2)' }}>
                    负责人: {okr.owner}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PRINCE2 Compliance Checklist */}
          <div className="card">
            <div className="section-title">
              <span>✅</span>
              PRINCE2阶段门检查
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {prince2Gates.map(gate => (
                <div
                  key={gate.id}
                  style={{
                    background: 'var(--surface2)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background:
                        gate.status === 'completed'
                          ? 'var(--green)'
                          : gate.status === 'in-progress'
                          ? 'var(--amber)'
                          : 'var(--border)',
                      color: gate.status === 'pending' ? 'var(--text2)' : 'white',
                      flexShrink: 0,
                    }}
                  >
                    {gate.status === 'completed' ? '✓' : gate.status === 'in-progress' ? '▶' : '○'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{gate.stage}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{gate.description}</div>
                    {gate.status === 'in-progress' && (
                      <div style={{ marginTop: '8px', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--amber)' }}>●</span> 进行中
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Project Detail Cards */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="section-title">
          <span>📋</span>
          全部项目状态
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {initialProjects.map(project => (
            <div
              key={project.id}
              style={{
                background: 'var(--surface2)',
                borderRadius: '8px',
                padding: '12px',
                borderLeft: `4px solid ${getStatusColor(project.scheduleStatus)}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{project.name}</span>
                <span
                  className="tag"
                  style={{
                    background: `${getTierColor(project.tier)}20`,
                    color: getTierColor(project.tier),
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                  }}
                >
                  {project.tier}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['schedule', 'budget', 'quality'] as const).map(type => {
                  const statusKey = `${type}Status` as 'scheduleStatus' | 'budgetStatus' | 'qualityStatus';
                  return (
                    <span
                      key={type}
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: `${getStatusColor(project[statusKey])}20`,
                        color: getStatusColor(project[statusKey]),
                      }}
                    >
                      {type === 'schedule' ? '进度' : type === 'budget' ? '预算' : '质量'}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
