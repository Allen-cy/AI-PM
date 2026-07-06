import { NextResponse } from "next/server";
import { buildKnowledgeOperationDashboard } from "@/features/knowledge/operations";

export async function GET() {
  return NextResponse.json(buildKnowledgeOperationDashboard(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
