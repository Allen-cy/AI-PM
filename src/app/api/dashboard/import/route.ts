import { parseDashboardWorkbook } from '../../../../features/dashboard/excel.ts';
import { FileValidationError, validateSpreadsheetFile } from '../../../../features/security/file-validation.ts';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return Response.json({
        status: 'rejected',
        code: 'DASHBOARD_IMPORT_FILE_REQUIRED',
        request_id: requestId,
      }, { status: 422, headers: { 'X-Request-Id': requestId } });
    }
    const name = file.name || '导入文件.xlsx';
    validateSpreadsheetFile(file, { maxBytes: 5 * 1024 * 1024 });
    const data = parseDashboardWorkbook(await file.arrayBuffer(), name);
    return Response.json({
      status: 'succeeded',
      data,
      request_id: requestId,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return Response.json({
        status: 'rejected',
        code: error.code,
        detail: error.message,
        request_id: requestId,
      }, { status: error.status, headers: { 'X-Request-Id': requestId } });
    }
    console.error(JSON.stringify({
      level: 'error',
      event: 'dashboard.import.failed',
      request_id: requestId,
      message: error instanceof Error ? error.message : 'unknown',
    }));
    return Response.json({
      status: 'error',
      code: 'DASHBOARD_IMPORT_FAILED',
      request_id: requestId,
    }, { status: 500, headers: { 'X-Request-Id': requestId } });
  }
}
