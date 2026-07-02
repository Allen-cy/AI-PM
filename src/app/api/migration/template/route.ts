import * as XLSX from "xlsx";
import { buildMigrationTemplateSheets } from "../../../../features/migration/package.ts";
import { migrationDataObjects } from "../../../../features/migration/readiness.ts";

export const runtime = "nodejs";

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 28);
}

export async function GET(): Promise<Response> {
  const workbook = XLSX.utils.book_new();
  for (const sheet of buildMigrationTemplateSheets()) {
    const worksheet = XLSX.utils.json_to_sheet([sheet.sampleRow], {
      header: sheet.headers,
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheet.name));
  }

  const guideRows = migrationDataObjects.map(object => ({
    数据对象: object.name,
    来源建议: object.source,
    目标模块: object.targetModule,
    必填字段: object.requiredFields.join("、"),
    质量检查: object.qualityChecks.join("；"),
  }));
  const guideSheet = XLSX.utils.json_to_sheet(guideRows);
  XLSX.utils.book_append_sheet(workbook, guideSheet, "迁移说明");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buffer.length);
  body.set(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"ai-pmo-migration-template.xlsx\"",
      "Cache-Control": "no-store",
    },
  });
}
