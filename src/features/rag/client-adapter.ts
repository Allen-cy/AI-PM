import type { QAMessage } from '../../lib/knowledge.ts';
import type { RagQueryResult } from './types.ts';

export function toAssistantMessage(result: RagQueryResult): QAMessage {
  return {
    role: 'assistant',
    content: result.answer,
    confidence: result.confidence,
    answerStatus: result.answer_status,
    retrievalMode: result.retrieval.mode,
    traceId: result.trace_id,
    sources: result.citations.map(citation => ({
      document: citation.document,
      excerpt: citation.excerpt,
      relevance: citation.relevance,
      pageId: citation.page_id,
      sourceIds: citation.source_ids,
      locator: citation.locator,
      authority: citation.authority,
      confidentiality: citation.confidentiality,
    })),
  };
}
