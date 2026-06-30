import * as XLSX from "xlsx";
import { getTemplateDescriptor, templateRows } from "@/lib/template-center";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const template = getTemplateDescriptor(id);
  if (!template) {
    return Response.json({ error: "模板不存在" }, { status: 404 });
  }

  const rows = templateRows(id);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "说明": template.description }]);
  XLSX.utils.book_append_sheet(workbook, worksheet, template.title.slice(0, 28));
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(template.id)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
