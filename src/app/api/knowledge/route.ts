import { NextResponse } from 'next/server';
import {
  generateMockAnswer,
  sessionStore,
  generateSessionId,
  type QASession,
  type KnowledgeSource,
} from '@/lib/knowledge';

// POST /api/knowledge/ask - Ask a question to the knowledge base
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, category, sessionId } = body;

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Invalid question. Required: question (string)' },
        { status: 400 }
      );
    }

    // Determine session
    let currentSessionId = sessionId;
    let session: QASession;

    if (currentSessionId && sessionStore.has(currentSessionId)) {
      // Use existing session
      session = sessionStore.get(currentSessionId)!;
    } else {
      // Create new session
      currentSessionId = generateSessionId();
      session = {
        id: currentSessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        category: category || 'general',
      };
      sessionStore.set(currentSessionId, session);
    }

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: question,
    });

    // Generate answer (mock RAG - in production this would call llmComplete with RAG context)
    const { answer, sources, confidence } = generateMockAnswer(question, category || session.category);

    // Add assistant message to session
    session.messages.push({
      role: 'assistant',
      content: answer,
      sources,
      confidence,
    });

    // Update session in store
    sessionStore.set(currentSessionId, session);

    return NextResponse.json({
      answer,
      sources: sources as KnowledgeSource[],
      confidence,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[knowledge/ask] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    );
  }
}

// GET /api/knowledge/categories - Get knowledge categories
export async function GET() {
  const { knowledgeCategories } = await import('@/lib/knowledge');

  return NextResponse.json({
    categories: knowledgeCategories,
    timestamp: new Date().toISOString(),
  });
}