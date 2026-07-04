import { getRagHealthWithAdditionalDocuments } from '../../../../features/rag/provider.ts';
import { listPublishedRiskRetrospectiveRagDocuments } from '../../../../features/risk/retrospective-assets.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const id = crypto.randomUUID();
  const dynamicDocuments = await listPublishedRiskRetrospectiveRagDocuments();
  const health = getRagHealthWithAdditionalDocuments(
    dynamicDocuments.documents,
    dynamicDocuments.status === "succeeded" ? undefined : dynamicDocuments.warning,
  );
  return Response.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': id,
    },
  });
}
