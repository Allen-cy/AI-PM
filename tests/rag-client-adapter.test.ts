import assert from 'node:assert/strict';
import test from 'node:test';

import { toAssistantMessage } from '../src/features/rag/client-adapter.ts';
import type { RagQueryResult } from '../src/features/rag/types.ts';

test('maps RAG contract citations into knowledge chat sources', () => {
  const result: RagQueryResult = {
    answer: '证据化回答',
    answer_status: 'answered',
    confidence: 0.9,
    citations: [{
      source_id: 'SRC-0001',
      source_ids: ['SRC-0001'],
      page_id: 'KB-0001',
      document: 'PMO三位一体运营模型',
      locator: 'page=KB-0001',
      excerpt: 'PGG负责一线交付。',
      authority: 'primary',
      confidentiality: 'internal',
      relevance: 0.92,
    }],
    retrieval: {
      mode: 'lexical-hybrid',
      provider: 'local-corpus',
      index_version: '2026-06-22.10',
      result_count: 1,
    },
    trace_id: 'trace-12345678',
    schema_version: '1.0',
  };

  const message = toAssistantMessage(result);

  assert.equal(message.content, '证据化回答');
  assert.equal(message.answerStatus, 'answered');
  assert.equal(message.sources?.[0]?.pageId, 'KB-0001');
  assert.deepEqual(message.sources?.[0]?.sourceIds, ['SRC-0001']);
  assert.equal(message.retrievalMode, 'lexical-hybrid');
});
