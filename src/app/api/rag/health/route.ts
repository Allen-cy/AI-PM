import { getRagService } from '../../../../features/rag/provider.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const id = crypto.randomUUID();
  return Response.json(getRagService().health(), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': id,
    },
  });
}
