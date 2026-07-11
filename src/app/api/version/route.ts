import { NextResponse } from "next/server";
import { APP_VERSION_INFO } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "ai-pm-system",
    ...APP_VERSION_INFO,
    environment: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || "unknown",
    gitRef: process.env.VERCEL_GIT_COMMIT_REF?.trim() || null,
  }, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
