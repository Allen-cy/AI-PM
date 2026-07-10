import { getRagService } from '../../../features/rag/provider.ts';
import { knowledgeCategories } from '../../../lib/knowledge.ts';

export const runtime = 'nodejs';

const categoryDomains: Record<string, string> = {
  governance: 'PMO治理',
  lifecycle: '项目全生命周期',
  finance: '业财一体化',
  'ai-pmo': 'AI-PMO能力',
};

async function requireAuthenticatedApiUser() {
  try {
    const auth = await import('../../../features/auth/server.ts');
    return await auth.requireAuthenticatedApiUser();
  } catch {
    return null;
  }
}

async function saveKnowledgeOutputReference(input: {
  outputType: 'ai_answer';
  outputId: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  citationText: string;
  confidence: number;
  user: Awaited<ReturnType<typeof requireAuthenticatedApiUser>>;
  requestId: string;
}) {
  try {
    const repository = await import('../../../features/knowledge/lifecycle-repository.ts');
    return await repository.createKnowledgeOutputReference(input);
  } catch (error) {
    return { status: 'failed' as const, warning: error instanceof Error ? error.message : String(error), requestId: input.requestId };
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireAuthenticatedApiUser();
  if (process.env.AUTH_REQUIRED === 'true' && !user) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
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
  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId
    ? raw.sessionId
    : `session_${crypto.randomUUID()}`;
  const result = getRagService().query({
    query: raw.question.trim(),
    ...(domain ? { filters: { domains: [domain] } } : {}),
  });
  const knowledgeReferences = [];
  for (const citation of result.citations.slice(0, 5)) {
    const saved = await saveKnowledgeOutputReference({
      outputType: 'ai_answer',
      outputId: `${sessionId}-${result.trace_id}`,
      outputTitle: `知识库问答：${raw.question.trim().slice(0, 80)}`,
      moduleName: '知识库与AI问答',
      pageId: citation.page_id,
      citationText: `${citation.document}：${citation.excerpt}`,
      confidence: citation.relevance,
      user,
      requestId: result.trace_id,
    });
    if (saved.status === 'succeeded') knowledgeReferences.push(saved.reference);
  }

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
    sessionId,
    retrieval: result.retrieval,
    knowledgeReferences,
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
  const user = await requireAuthenticatedApiUser();
  if (process.env.AUTH_REQUIRED === 'true' && !user) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return Response.json({
    categories: knowledgeCategories,
    timestamp: new Date().toISOString(),
  });
}
