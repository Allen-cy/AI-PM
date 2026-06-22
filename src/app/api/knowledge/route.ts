import { getRagService } from '../../../features/rag/provider.ts';
import { knowledgeCategories } from '../../../lib/knowledge.ts';

export const runtime = 'nodejs';

const categoryDomains: Record<string, string> = {
  governance: 'PMO治理',
  lifecycle: '项目全生命周期',
  finance: '业财一体化',
  'ai-pmo': 'AI-PMO能力',
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid question.' }, { status: 422 });
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.question !== 'string' || raw.question.trim().length === 0) {
    return Response.json({ error: 'Invalid question.' }, { status: 422 });
  }

  const category = typeof raw.category === 'string' ? raw.category : 'all';
  const domain = categoryDomains[category];
  const result = getRagService().query({
    query: raw.question.trim(),
    ...(domain ? { filters: { domains: [domain] } } : {}),
  });

  return Response.json({
    answer: result.answer,
    answerStatus: result.answer_status,
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
    confidence: result.confidence,
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId
      ? raw.sessionId
      : `session_${crypto.randomUUID()}`,
    retrieval: result.retrieval,
    traceId: result.trace_id,
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': result.trace_id,
    },
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    categories: knowledgeCategories,
    timestamp: new Date().toISOString(),
  });
}
