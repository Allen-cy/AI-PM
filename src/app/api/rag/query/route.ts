import { queryRagWithAdditionalDocuments } from '../../../../features/rag/provider.ts';
import {
  listPublishedRiskRetrospectiveRagDocuments,
  recordRiskRetrospectiveRagUsage,
} from '../../../../features/risk/retrospective-assets.ts';
import { RagValidationError, validateRagQuery } from '../../../../features/rag/validation.ts';

export const runtime = 'nodejs';

function requestId(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  return incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

function problem(status: number, title: string, detail: string, id: string): Response {
  return Response.json(
    {
      type: `https://ai-pmo.local/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
      request_id: id,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': id,
      },
    },
  );
}

async function requireAuthenticatedApiUser() {
  try {
    const auth = await import('../../../../features/auth/server.ts');
    return await auth.requireAuthenticatedApiUser();
  } catch {
    return null;
  }
}

async function authorizeRiskKnowledgeRequest(request: Request) {
  const access = await import('../../../../features/risk/access.ts');
  return access.authorizeRiskRequest(request, 'read');
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
    const repository = await import('../../../../features/knowledge/lifecycle-repository.ts');
    return await repository.createKnowledgeOutputReference(input);
  } catch (error) {
    return { status: 'failed' as const, warning: error instanceof Error ? error.message : String(error), requestId: input.requestId };
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const user = await requireAuthenticatedApiUser();
  if (process.env.AUTH_REQUIRED === 'true' && !user) {
    return problem(401, 'Unauthorized', 'Please sign in before querying internal knowledge.', id);
  }
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return problem(400, 'Malformed JSON', 'Request body must be valid JSON.', id);
  }

  try {
    const input = validateRagQuery(body);
    const hasBusinessContext = new URL(request.url).searchParams.has('org_id');
    const access = user && hasBusinessContext ? await authorizeRiskKnowledgeRequest(request) : null;
    if (access && !access.ok) {
      return problem(access.status, 'Knowledge Scope Forbidden', access.detail || access.error, id);
    }
    const riskScope = access?.ok ? access.scope : undefined;
    const dynamicDocuments = riskScope
      ? await listPublishedRiskRetrospectiveRagDocuments(riskScope)
      : { status: 'succeeded' as const, documents: [] };
    const result = queryRagWithAdditionalDocuments(input, dynamicDocuments.documents);
    result.trace_id = id;
    const usage = await recordRiskRetrospectiveRagUsage({
      query: input.query,
      citations: result.citations,
      requestId: id,
      user,
      scope: riskScope,
    });
    if (usage.status === 'failed') {
      console.error(JSON.stringify({
        level: 'warn',
        event: 'risk.retrospective.usage.failed',
        request_id: id,
        warning: usage.warning,
      }));
    }
    const knowledgeReferences = [];
    for (const citation of result.citations.slice(0, 5)) {
      const saved = await saveKnowledgeOutputReference({
        outputType: 'ai_answer',
        outputId: `rag-query-${id}`,
        outputTitle: `RAG问答：${input.query.slice(0, 80)}`,
        moduleName: '知识库与AI问答',
        pageId: citation.page_id,
        citationText: `${citation.document}：${citation.excerpt}`,
        confidence: citation.relevance,
        user,
        requestId: id,
      });
      if (saved.status === 'succeeded') knowledgeReferences.push(saved.reference);
    }
    return Response.json({ ...result, knowledge_references: knowledgeReferences }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': id,
        'X-Knowledge-References': String(knowledgeReferences.length),
      },
    });
  } catch (error) {
    if (error instanceof RagValidationError) {
      return problem(error.status, 'Invalid RAG Query', error.message, id);
    }

    console.error(JSON.stringify({
      level: 'error',
      event: 'rag.query.failed',
      request_id: id,
      error: error instanceof Error ? error.name : 'UnknownError',
    }));
    return problem(500, 'RAG Query Failed', 'The query could not be processed.', id);
  }
}
