import * as XLSX from "xlsx";
import { analyzeMigrationRows } from "../../../../features/migration/package.ts";
import { migrationDataObjects } from "../../../../features/migration/readiness.ts";
import { FileValidationError, validateSpreadsheetFile } from "../../../../features/security/file-validation.ts";

export const runtime = "nodejs";

const MAX_ROWS = 500;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvRows(text: string): Array<Record<string, unknown>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

async function parseRows(file: File): Promise<Array<Record<string, unknown>>> {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (extension === "csv") {
    return parseCsvRows(await file.text());
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const form = await request.formData();
    const file = form.get("file");
    const objectName = String(form.get("objectName") ?? "");

    if (!migrationDataObjects.some(item => item.name === objectName)) {
      return Response.json({
        status: "rejected",
        code: "MIGRATION_OBJECT_REQUIRED",
        detail: "请选择需要分析的数据对象。",
        request_id: requestId,
      }, { status: 422, headers: { "X-Request-Id": requestId } });
    }

    if (!(file instanceof File)) {
      return Response.json({
        status: "rejected",
        code: "MIGRATION_FILE_REQUIRED",
        detail: "请上传 xlsx、xls 或 csv 文件。",
        request_id: requestId,
      }, { status: 422, headers: { "X-Request-Id": requestId } });
    }

    validateSpreadsheetFile(file, { maxBytes: 5 * 1024 * 1024 });
    const rows = await parseRows(file);

    if (rows.length === 0) {
      return Response.json({
        status: "rejected",
        code: "MIGRATION_EMPTY_ROWS",
        detail: "文件中没有可分析的数据行。",
        request_id: requestId,
      }, { status: 422, headers: { "X-Request-Id": requestId } });
    }

    if (rows.length > MAX_ROWS) {
      return Response.json({
        status: "rejected",
        code: "MIGRATION_TOO_MANY_ROWS",
        detail: `试迁移分析最多支持 ${MAX_ROWS} 行，请先截取小批量样例。`,
        request_id: requestId,
      }, { status: 422, headers: { "X-Request-Id": requestId } });
    }

    const analysis = analyzeMigrationRows(objectName, rows);
    return Response.json({
      status: "succeeded",
      file_name: file.name,
      analysis,
      request_id: requestId,
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return Response.json({
        status: "rejected",
        code: error.code,
        detail: error.message,
        request_id: requestId,
      }, { status: error.status, headers: { "X-Request-Id": requestId } });
    }
    console.error(JSON.stringify({
      level: "error",
      event: "migration.analyze.failed",
      request_id: requestId,
      message: error instanceof Error ? error.message : "unknown",
    }));
    return Response.json({
      status: "error",
      code: "MIGRATION_ANALYZE_FAILED",
      detail: "迁移包分析失败，请检查文件格式后重试。",
      request_id: requestId,
    }, { status: 500, headers: { "X-Request-Id": requestId } });
  }
}
