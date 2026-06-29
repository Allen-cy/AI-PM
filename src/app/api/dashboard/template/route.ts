import { createDashboardTemplateWorkbook } from '../../../../features/dashboard/excel.ts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const buffer = createDashboardTemplateWorkbook();
  const body = new Uint8Array(buffer.length);
  body.set(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ai-pmo-dashboard-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
