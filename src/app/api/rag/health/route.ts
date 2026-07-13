import { getRagHealthWithAdditionalDocuments } from '../../../../features/rag/provider.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const id = crypto.randomUUID();
  const health = getRagHealthWithAdditionalDocuments(
    [],
    "动态风险知识按登录用户的业务范围在查询时加载，公共健康接口不汇总跨项目文档。",
  );
  return Response.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': id,
    },
  });
}
