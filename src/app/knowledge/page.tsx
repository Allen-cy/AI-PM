'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { FeishuConfirmationInlinePanelClient } from '@/components/FeishuConfirmationInlinePanelClient';
import { IntegrationStatusPanelClient } from '@/components/IntegrationStatusPanelClient';
import { toAssistantMessage } from '@/features/rag/client-adapter';
import type { RagQueryResult } from '@/features/rag/types';
import {
  knowledgeCategories,
  suggestedQuestions,
  type QAMessage,
  type KnowledgeCategory,
} from '@/lib/knowledge';

export default function KnowledgePage() {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSources, setShowSources] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleQuestionClick = async (question: string) => {
    setInputValue(question);
    await sendQuestion(question);
  };

  const sendQuestion = async (question?: string) => {
    const questionToSend = question || inputValue.trim();
    if (!questionToSend || isLoading) return;

    setIsLoading(true);
    setInputValue('');

    // Add user message immediately
    const userMessage: QAMessage = { role: 'user', content: questionToSend };
    setMessages(prev => [...prev, userMessage]);

    try {
      const selectedDomain = knowledgeCategories.find(category => category.id === selectedCategory)?.name;
      const response = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: questionToSend,
          conversation_id: currentSessionId,
          ...(selectedDomain ? { filters: { domains: [selectedDomain] } } : {}),
        }),
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => ({})) as { code?: string; request_id?: string };
        throw new Error(`${problem.code ?? `HTTP_${response.status}`}${problem.request_id ? ` / ${problem.request_id}` : ''}`);
      }

      const data = await response.json() as RagQueryResult;
      setCurrentSessionId(data.trace_id);

      const assistantMessage = toAssistantMessage(data);
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: QAMessage = {
        role: 'assistant',
        content: `知识库请求失败：${error instanceof Error ? error.message : '未知错误'}。请稍后重试；如果持续出现，请把这条错误信息发给管理员定位。`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewSession = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setShowSources({});
  };

  const toggleSources = (index: number) => {
    setShowSources(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'var(--text2)';
    if (confidence >= 0.8) return 'var(--green)';
    if (confidence >= 0.6) return 'var(--amber)';
    return 'var(--red)';
  };

  const getConfidenceLabel = (confidence?: number) => {
    if (!confidence) return '未知';
    if (confidence >= 0.8) return '高置信度';
    if (confidence >= 0.6) return '中置信度';
    return '低置信度';
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            知识库与AI问答
          </h1>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link href="/knowledge/operations" className="btn-secondary" style={{ textDecoration: 'none' }}>
              知识运营
            </Link>
            <button className="btn-secondary" onClick={startNewSession}>
              新建会话
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
          基于27篇已审AI-PMO知识的可追溯问答 · 30题黄金评测 Top1 通过
        </p>
      </div>

      <IntegrationStatusPanelClient moduleName="知识库与AI问答" />
      <FeishuConfirmationInlinePanelClient moduleName="知识库与AI问答" />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
        {/* Left Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Categories */}
          <div className="card">
            <div className="section-title">
              <span>📚</span>
              知识分类
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => setSelectedCategory('all')}
                className={selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
              >
                全部知识库
              </button>
              {knowledgeCategories.map((cat: KnowledgeCategory) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={selectedCategory === cat.id ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    fontSize: '0.85rem',
                    padding: '8px 12px',
                  }}
                >
                  <span style={{ marginRight: '8px' }}>{cat.icon}</span>
                  {cat.name}
                  <span
                    className="tag tag-blue"
                    style={{ marginLeft: 'auto', fontSize: '0.7rem' }}
                  >
                    {cat.documentCount}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Suggested Questions */}
          <div className="card">
            <div className="section-title">
              <span>💡</span>
              推荐问题
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {suggestedQuestions.map((q, index) => (
                <button
                  key={index}
                  onClick={() => handleQuestionClick(q)}
                  className="btn-secondary"
                  style={{
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    padding: '10px 12px',
                    lineHeight: 1.4,
                    whiteSpace: 'normal',
                    height: 'auto',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <span>🛡️</span>
              当前检索边界
            </div>
            <div style={{ color: 'var(--text2)', fontSize: '0.8rem', lineHeight: 1.7 }}>
              <div>索引：27篇 reviewed 知识页</div>
              <div>模式：中文词元 + 元数据加权检索</div>
              <div>密级：最高 internal</div>
              <div>飞书：动作已接入，实时清单查询仍受限</div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 180px)',
            minHeight: '500px',
          }}
        >
          {/* Chat Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text2)',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🤖</div>
                <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                  AI知识库问答助手
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  选择知识分类或直接输入问题开始探索
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index}>
                {/* User Message */}
                {msg.role === 'user' && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--accent)',
                        color: 'white',
                        padding: '12px 16px',
                        borderRadius: '16px 16px 4px 16px',
                        maxWidth: '75%',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                )}

                {/* Assistant Message */}
                {msg.role === 'assistant' && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          flexShrink: 0,
                        }}
                      >
                        🤖
                      </div>
                      <div style={{ flex: 1 }}>
                        {/* Confidence Indicator */}
                        {msg.confidence !== undefined && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '8px',
                            }}
                          >
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: getConfidenceColor(msg.confidence),
                              }}
                            />
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: getConfidenceColor(msg.confidence),
                              }}
                            >
                              {getConfidenceLabel(msg.confidence)} · {Math.round(msg.confidence * 100)}%
                            </span>
                            {msg.answerStatus && (
                              <span className={`tag ${msg.answerStatus === 'answered' ? 'tag-green' : 'tag-amber'}`}>
                                {msg.answerStatus === 'answered' ? '已引用回答' : msg.answerStatus === 'forbidden' ? '权限受限' : '证据不足'}
                              </span>
                            )}
                            {msg.retrievalMode && (
                              <span className="tag tag-blue">{msg.retrievalMode}</span>
                            )}
                          </div>
                        )}

                        {/* Answer Content */}
                        <div
                          style={{
                            background: 'var(--surface2)',
                            padding: '16px',
                            borderRadius: '4px 16px 16px 16px',
                            fontSize: '0.9rem',
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {msg.content}
                        </div>

                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <button
                              onClick={() => toggleSources(index)}
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--text2)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>{showSources[index] ? '▼' : '▶'}</span>
                              引用文档 ({msg.sources.length})
                            </button>
                            {showSources[index] && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px',
                                }}
                              >
                                {msg.sources.map((source, sIndex) => (
                                  <div
                                    key={sIndex}
                                    style={{
                                      background: 'var(--surface2)',
                                      padding: '10px 12px',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: '4px',
                                      }}
                                    >
                                      <span style={{ fontWeight: 600, color: 'var(--accent2)' }}>
                                        {source.document}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: '0.7rem',
                                          color: 'var(--text2)',
                                        }}
                                      >
                                        相关度 {Math.round(source.relevance * 100)}%
                                      </span>
                                    </div>
                                    <div style={{ color: 'var(--text2)', fontSize: '0.75rem' }}>
                                      {source.excerpt}
                                    </div>
                                    <div style={{ color: 'var(--text2)', fontSize: '0.7rem', marginTop: '6px' }}>
                                      {source.pageId}{source.sourceIds?.length ? ` · ${source.sourceIds.join(', ')}` : ''}
                                      {source.authority ? ` · ${source.authority}` : ''}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                  }}
                >
                  🤖
                </div>
                <div
                  style={{
                    background: 'var(--surface2)',
                    padding: '16px',
                    borderRadius: '4px 16px 16px 16px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        animation: 'bounce 1s infinite',
                      }}
                    />
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        animation: 'bounce 1s infinite 0.2s',
                      }}
                    />
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        animation: 'bounce 1s infinite 0.4s',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: '16px',
              display: 'flex',
              gap: '12px',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="input"
              placeholder="输入您的项目管理问题..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendQuestion();
                }
              }}
              disabled={isLoading}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              onClick={() => sendQuestion()}
              disabled={isLoading || !inputValue.trim()}
            >
              发送
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
