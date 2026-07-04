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

async function getOptionalCurrentUser() {
  try {
    const auth = await import('../../../../features/auth/server.ts');
    return await auth.getCurrentUser();
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return problem(400, 'Malformed JSON', 'Request body must be valid JSON.', id);
  }

  try {
    const input = validateRagQuery(body);
    const dynamicDocuments = await listPublishedRiskRetrospectiveRagDocuments();
    const result = queryRagWithAdditionalDocuments(input, dynamicDocuments.documents);
    result.trace_id = id;
    const usage = await recordRiskRetrospectiveRagUsage({
      query: input.query,
      citations: result.citations,
      requestId: id,
      user: await getOptionalCurrentUser(),
    });
    if (usage.status === 'failed') {
      console.error(JSON.stringify({
        level: 'warn',
        event: 'risk.retrospective.usage.failed',
        request_id: id,
        warning: usage.warning,
      }));
    }
    return Response.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': id,
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
