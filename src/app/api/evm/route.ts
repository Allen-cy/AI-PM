// EVM API Route - AI-enhanced Earned Value Management analysis

import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

interface EVMTaskInput {
  period: string;
  plannedValue: number;   // PV
  actualCost: number;     // AC
  completionPercent: number; // 0-100
}

interface EVMRequest {
  projectName: string;
  tasks: EVMTaskInput[];
  budgetAtCompletion: number;
}

interface EVMResponse {
  ev: number;
  pv: number;
  ac: number;
  cv: number;
  sv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  aiReasoning: string;
}

const EVM_SYSTEM_PROMPT = `你是资深项目管理专家，精通挣值管理（EVM, Earned Value Management）。

## EVM核心公式：
- EV（挣值）= Σ(PV_i × 完成百分比_i) — 每个时期的计划价值乘以完成百分比之和
- PV = Σ各时期计划价值之和
- AC = Σ各时期实际成本之和
- SV（进度偏差）= EV - PV
- CV（成本偏差）= EV - AC
- SPI（进度绩效指数）= EV / PV
- CPI（成本绩效指数）= EV / AC
- EAC（完工估算）= BAC / CPI
- ETC（完工尚需）= EAC - AC

## 分析维度：
1. 进度状态：SPI > 1 超前，SPI = 1 正常，SPI < 1 落后
2. 成本状态：CPI > 1 节约， CPI = 1 正常， CPI < 1 超支
3. 完工预测：EAC与BAC的偏差分析
4. 风险识别：进度和成本双重风险

## 输出要求：
返回JSON格式：
{
  "ev": 挣值总数（万元）,
  "pv": 计划价值总数（万元）,
  "ac": 实际成本总数（万元）,
  "sv": 进度偏差（万元）,
  "cv": 成本偏差（万元）,
  "spi": 进度绩效指数（小数）,
  "cpi": 成本绩效指数（小数）,
  "eac": 完工估算（万元）,
  "etc": 完工尚需估算（万元）,
  "aiReasoning": "详细的中文推理分析，说明项目当前状态、偏差原因、风险点和预测"
}`;

export async function POST(request: NextRequest) {
  try {
    const body: EVMRequest = await request.json();
    const { projectName, tasks, budgetAtCompletion } = body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "需要提供任务数据（tasks数组）" },
        { status: 400 }
      );
    }

    // Calculate EV = sum of (PV_i × completion_i)
    const totalPV = tasks.reduce((sum, t) => sum + t.plannedValue, 0);
    const totalAC = tasks.reduce((sum, t) => sum + t.actualCost, 0);
    const totalEV = tasks.reduce((sum, t) => sum + (t.plannedValue * t.completionPercent / 100), 0);

    const sv = totalEV - totalPV;
    const cv = totalEV - totalAC;
    const spi = totalPV > 0 ? totalEV / totalPV : 0;
    const cpi = totalAC > 0 ? totalEV / totalAC : 0;
    const eac = cpi > 0 ? budgetAtCompletion / cpi : budgetAtCompletion;
    const etc = eac - totalAC;

    // Build task data string for LLM
    const taskDataStr = tasks
      .map(t => `- ${t.period}: PV=${t.plannedValue}万, AC=${t.actualCost}万, 完成率=${t.completionPercent}% → EV=${(t.plannedValue * t.completionPercent / 100).toFixed(1)}万`)
      .join("\n");

    const userMessage = `项目名称：${projectName}
BAC（完工预算）：${budgetAtCompletion}万元

各时期数据：
${taskDataStr}

计算结果：
- ΣPV = ${totalPV}万
- ΣAC = ${totalAC}万
- ΣEV = ${totalEV.toFixed(1)}万

请进行EVM分析，输出JSON格式的完整结果。`;

    // Call llmComplete with scene="evm"
    const response = await llmComplete(
      "evm",
      EVM_SYSTEM_PROMPT,
      userMessage,
      { temperature: 0.1 }
    );

    // Parse JSON from response
    let evmResult: EVMResponse;
    try {
      const content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evmResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法解析LLM返回的JSON结果");
      }
    } catch (parseError) {
      console.error("[EVM API] Parse error:", parseError);
      return NextResponse.json(
        {
          error: "LLM返回格式错误",
          rawResponse: response.content,
          // Fallback to calculated values
          ev: totalEV,
          pv: totalPV,
          ac: totalAC,
          cv,
          sv,
          spi,
          cpi,
          eac,
          etc,
          aiReasoning: "AI解析失败，使用本地计算结果。",
        },
        { status: 200 }
      );
    }

    // Ensure we have the calculated values
    evmResult.ev = totalEV;
    evmResult.pv = totalPV;
    evmResult.ac = totalAC;
    evmResult.cv = cv;
    evmResult.sv = sv;
    evmResult.spi = spi;
    evmResult.cpi = cpi;
    evmResult.eac = eac;
    evmResult.etc = etc;

    return NextResponse.json(evmResult);
  } catch (error) {
    console.error("[EVM API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "EVM计算失败" },
      { status: 500 }
    );
  }
}