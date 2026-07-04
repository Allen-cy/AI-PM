export type KnowledgeStatus = 'draft' | 'reviewed' | 'published' | 'deprecated' | 'archived';
export type Confidentiality = 'public' | 'internal' | 'confidential' | 'restricted';
export type RagAnswerStatus = 'answered' | 'insufficient_evidence' | 'forbidden' | 'error';

export interface RagDocument {
  page_id: string;
  title: string;
  type: string;
  status: KnowledgeStatus;
  authority: string;
  confidentiality: Confidentiality;
  domains: string[];
  aliases: string[];
  tags: string[];
  source_refs: string[];
  content: string;
}

export interface RagFilters {
  domains?: string[];
  confidentiality_max?: Confidentiality;
  status?: KnowledgeStatus[];
}

export interface RagQueryInput {
  query: string;
  filters?: RagFilters;
  conversation_id?: string;
  top_k?: number;
  include_debug?: boolean;
}

export interface RagCitation {
  source_id: string | null;
  source_ids: string[];
  page_id: string;
  document: string;
  locator: string;
  excerpt: string;
  authority: string;
  confidentiality: Confidentiality;
  relevance: number;
}

export interface RagQueryResult {
  answer: string;
  answer_status: RagAnswerStatus;
  confidence: number;
  citations: RagCitation[];
  retrieval: {
    mode: 'lexical-hybrid';
    provider: 'local-corpus';
    index_version: string;
    result_count: number;
  };
  trace_id: string;
  schema_version: '1.0';
}

export interface RagHealth {
  status: 'ok' | 'degraded';
  provider: 'local-corpus';
  index_version: string;
  page_count: number;
  chunk_count: number;
  embedded_chunk_count: number;
  retrieval_mode: 'lexical-hybrid';
  generated_at: string;
  dynamic_document_count?: number;
  dynamic_warning?: string;
}

export interface RagService {
  query(input: RagQueryInput): RagQueryResult;
  health(): RagHealth;
}
