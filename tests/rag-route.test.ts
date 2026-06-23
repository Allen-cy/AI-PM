import assert from 'node:assert/strict';
import test from 'node:test';

import { GET as getHealth } from '../src/app/api/rag/health/route.ts';
import { POST as queryRag } from '../src/app/api/rag/query/route.ts';
import { POST as queryLegacyKnowledge } from '../src/app/api/knowledge/route.ts';

test('POST /api/rag/query returns contract fields and request id header', async () => {
  const response = await queryRag(new Request('http://localhost/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'PMO三位一体中的PGG负责什么？' }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answer_status, 'answered');
  assert.equal(body.citations[0]?.page_id, 'KB-0001');
  assert.equal(response.headers.get('x-request-id'), body.trace_id);
});

test('POST /api/rag/query returns RFC 9457 validation errors', async () => {
  const response = await queryRag(new Request('http://localhost/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '' }),
  }));
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.status, 422);
  assert.equal(body.title, 'Invalid RAG Query');
  assert.equal(response.headers.get('x-request-id'), body.request_id);
});

test('POST /api/rag/query rejects malformed JSON with 400', async () => {
  const response = await queryRag(new Request('http://localhost/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.title, 'Malformed JSON');
});

test('GET /api/rag/health reports the deployed corpus', async () => {
  const response = await getHealth();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.page_count, 27);
  assert.equal(body.retrieval_mode, 'lexical-hybrid');
  assert.ok(response.headers.get('x-request-id'));
});

test('legacy knowledge endpoint delegates to the real corpus instead of mock answers', async () => {
  const response = await queryLegacyKnowledge(new Request('http://localhost/api/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'PGG EPG SQA如何分工？' }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answerStatus, 'answered');
  assert.equal(body.sources[0]?.pageId, 'KB-0001');
  assert.doesNotMatch(body.answer, /PMBOK第七版/);
});
