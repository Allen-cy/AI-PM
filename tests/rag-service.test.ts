import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRagService } from '../src/features/rag/local-rag-service.ts';
import { getRagService } from '../src/features/rag/provider.ts';
import { validateRagQuery } from '../src/features/rag/validation.ts';
import type { RagDocument } from '../src/features/rag/types.ts';

const documents: RagDocument[] = [
  {
    page_id: 'KB-0001',
    title: 'PMO三位一体运营模型',
    type: 'governance',
    status: 'reviewed',
    authority: 'primary',
    confidentiality: 'internal',
    domains: ['PMO治理'],
    aliases: ['PGG-EPG-SQA模型'],
    tags: ['AI-PMO/knowledge'],
    source_refs: ['SRC-0001'],
    content: '有效PMO同时具备一线交付、流程与工具改进、独立数据评价三类能力。PGG负责重点项目交付，EPG负责过程改进，SQA负责独立评价。',
  },
  {
    page_id: 'KB-0007',
    title: '项目业财一体化数据链',
    type: 'concept',
    status: 'reviewed',
    authority: 'primary',
    confidentiality: 'internal',
    domains: ['业财一体化'],
    aliases: ['项目经营数据链'],
    tags: ['AI-PMO/finance'],
    source_refs: ['SRC-0011'],
    content: '合同、回款计划、应收、实收和核销必须形成可追溯的数据链，并关联项目、里程碑、成本和利润。',
  },
];

test('returns an evidence-grounded answer with a stable page citation', () => {
  const service = createLocalRagService({ documents, indexVersion: 'test-1' });
  const result = service.query({ query: 'PMO的PGG、EPG和SQA如何分工？' });

  assert.equal(result.answer_status, 'answered');
  assert.equal(result.citations[0]?.page_id, 'KB-0001');
  assert.deepEqual(result.citations[0]?.source_ids, ['SRC-0001']);
  assert.match(result.answer, /一线交付|过程改进|独立评价/);
  assert.equal(result.retrieval.provider, 'local-corpus');
  assert.notEqual(result.trace_id, '');
});

test('uses domain filters before ranking', () => {
  const service = createLocalRagService({ documents, indexVersion: 'test-1' });
  const result = service.query({
    query: '合同回款和核销是什么关系？',
    filters: { domains: ['业财一体化'] },
  });

  assert.equal(result.answer_status, 'answered');
  assert.equal(result.citations[0]?.page_id, 'KB-0007');
});

test('refuses questions that require live project data', () => {
  const service = createLocalRagService({ documents, indexVersion: 'test-1' });
  const result = service.query({ query: '当前所有项目中，下周到期且回款逾期的有哪些？' });

  assert.equal(result.answer_status, 'insufficient_evidence');
  assert.equal(result.citations.length, 0);
  assert.match(result.answer, /实时|飞书/);
});

test('blocks internal evidence when the caller is limited to public content', () => {
  const service = createLocalRagService({ documents, indexVersion: 'test-1' });
  const result = service.query({
    query: 'PGG和SQA如何分工？',
    filters: { confidentiality_max: 'public' },
  });

  assert.equal(result.answer_status, 'forbidden');
  assert.equal(result.citations.length, 0);
});

test('validates empty and oversized questions at the boundary', () => {
  assert.throws(() => validateRagQuery({ query: '   ' }), /query/);
  assert.throws(() => validateRagQuery({ query: 'a'.repeat(2001) }), /2000/);
});

test('reports corpus health without claiming vector or hybrid retrieval', () => {
  const service = createLocalRagService({ documents, indexVersion: 'test-1' });
  const health = service.health();

  assert.equal(health.status, 'ok');
  assert.equal(health.page_count, 2);
  assert.equal(health.embedded_chunk_count, 0);
  assert.equal(health.retrieval_mode, 'keyword');
});

test('loads the reviewed ten-page production corpus', () => {
  const service = getRagService();
  const result = service.query({ query: 'PGG EPG SQA三类能力如何形成闭环？' });

  assert.equal(service.health().page_count, 10);
  assert.equal(result.answer_status, 'answered');
  assert.equal(result.citations[0]?.page_id, 'KB-0001');
  assert.doesNotMatch(result.citations[0]?.excerpt ?? '', /2026-06-22|证据时间线/);
  assert.match(result.citations[0]?.excerpt ?? '', /有效PMO|一线交付|流程与工具改进/);
});
