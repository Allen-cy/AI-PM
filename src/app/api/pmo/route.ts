import { NextResponse } from 'next/server';
import {
  initialProjects,
  initialOKRs,
  governanceMetrics,
  prince2Gates,
  calculatePortfolioOverview,
  type ProjectHealth,
  type OKR,
  type GovernanceMetric,
  type PRINCE2Gate,
} from '@/lib/pmo';

// GET /api/pmo - Return PMO dashboard data
export async function GET() {
  const portfolioOverview = calculatePortfolioOverview(initialProjects);

  const data = {
    portfolio: portfolioOverview,
    projects: initialProjects,
    okrs: initialOKRs,
    metrics: governanceMetrics,
    prince2Gates,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(data);
}

// POST /api/pmo/okr - Create or update OKR
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate OKR data
    if (!body.objective || !body.keyResults || !Array.isArray(body.keyResults)) {
      return NextResponse.json(
        { error: 'Invalid OKR data. Required: objective, keyResults array' },
        { status: 400 }
      );
    }

    // Create new OKR
    const newOKR: OKR = {
      id: `OKR${String(initialOKRs.length + 1).padStart(3, '0')}`,
      objective: body.objective,
      status: body.status || 'on-track',
      owner: body.owner || 'PMO负责人',
      keyResults: body.keyResults.map((kr: any, index: number) => ({
        id: `KR${String(initialOKRs.length * 10 + index + 1).padStart(3, '0')}`,
        description: kr.description,
        target: kr.target,
        current: kr.current || 0,
        unit: kr.unit || '%',
        progress: kr.target > 0 ? Math.round(((kr.current || 0) / kr.target) * 100) : 0,
      })),
    };

    return NextResponse.json({
      success: true,
      okr: newOKR,
      message: 'OKR created successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}