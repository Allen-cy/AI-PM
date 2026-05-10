import { NextRequest, NextResponse } from "next/server";
import { llmComplete, SYSTEM_PROMPTS } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { scene, systemPrompt, userMessage, temperature } = await request.json();

    if (!scene || !systemPrompt || !userMessage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await llmComplete(scene, systemPrompt, userMessage, { temperature });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}