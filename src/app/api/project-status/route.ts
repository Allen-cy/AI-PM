// 项目继续接口 - 支持上下文续接的任务执行
import { NextRequest, NextResponse } from "next/server";

const PROJECT_STATUS = {
  version: "2.0",
  lastUpdated: "2026-05-10",
  completedModules: ["initiation", "dashboard", "wbs", "cpm"],
  currentModule: null,
  pendingTasks: [
    { id: "evm", name: "挣值分析(EVM)", priority: "P0", status: "pending" },
    { id: "risk", name: "风险管理", priority: "P0", status: "pending" },
    { id: "contract", name: "合同与回款", priority: "P0", status: "pending" },
    { id: "reports", name: "AI报告生成", priority: "P1", status: "pending" },
    { id: "stakeholder", name: "干系人管理", priority: "P1", status: "pending" },
    { id: "ltc", name: "LTC全流程", priority: "P2", status: "pending" },
    { id: "pmo", name: "PMO治理中心", priority: "P2", status: "pending" },
    { id: "knowledge", name: "知识库AI问答", priority: "P3", status: "pending" },
    { id: "process", name: "流程设计白板", priority: "P3", status: "pending" },
  ],
  bugFixes: [
    { date: "2026-05-10", module: "cpm", issue: "关键路径计算错误", status: "fixed" }
  ]
};

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: PROJECT_STATUS,
    message: "项目状态查询成功"
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, moduleId, taskDescription } = body;

    if (action === "continue") {
      // 返回下一个推荐任务
      const nextTask = PROJECT_STATUS.pendingTasks[0];
      return NextResponse.json({
        success: true,
        data: {
          recommendedTask: nextTask,
          allTasks: PROJECT_STATUS.pendingTasks,
          lastCompleted: PROJECT_STATUS.bugFixes[0]
        },
        message: `推荐继续任务：${nextTask.name}`
      });
    }

    if (action === "update") {
      // 更新任务状态
      const task = PROJECT_STATUS.pendingTasks.find(t => t.id === moduleId);
      if (task) {
        task.status = "in_progress";
        PROJECT_STATUS.currentModule = moduleId;
        return NextResponse.json({
          success: true,
          data: task,
          message: `开始任务：${task.name}`
        });
      }
      return NextResponse.json({
        success: false,
        error: "任务不存在"
      }, { status: 404 });
    }

    if (action === "complete") {
      // 标记任务完成
      const idx = PROJECT_STATUS.pendingTasks.findIndex(t => t.id === moduleId);
      if (idx >= 0) {
        PROJECT_STATUS.pendingTasks[idx].status = "completed";
        PROJECT_STATUS.completedModules.push(moduleId);
        PROJECT_STATUS.currentModule = null;
        return NextResponse.json({
          success: true,
          data: {
            completed: moduleId,
            nextRecommended: PROJECT_STATUS.pendingTasks.find(t => t.status === "pending")
          },
          message: `任务已完成：${moduleId}`
        });
      }
      return NextResponse.json({
        success: false,
        error: "任务不存在"
      }, { status: 404 });
    }

    if (action === "log") {
      // 记录上下文/笔记
      console.log(`[CONTEXT] ${new Date().toISOString()}: ${taskDescription}`);
      return NextResponse.json({
        success: true,
        message: "上下文已记录"
      });
    }

    return NextResponse.json({
      success: false,
      error: "未知操作"
    }, { status: 400 });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "请求失败"
    }, { status: 500 });
  }
}