// Process Design & Whiteboard - Templates and Export Utilities

export interface ProcessElement {
  id: string;
  type: "start" | "end" | "task" | "gateway" | "document" | "data";
  label: string;
  position: { x: number; y: number };
  connections: string[];
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  diagramType: "flowchart" | "bpmn" | "wireframe";
  svgPreview?: string;
  elements: ProcessElement[];
}

// Generate unique IDs
let idCounter = 1000;
const genId = (prefix: string) => `${prefix}${idCounter++}`;

// Helper to create elements with auto-IDs
const task = (label: string, x: number, y: number, connections: string[] = []): ProcessElement => ({
  id: genId("t"),
  type: "task",
  label,
  position: { x, y },
  connections,
});

const start = (label: string, x: number, y: number): ProcessElement => ({
  id: genId("s"),
  type: "start",
  label,
  position: { x, y },
  connections: [],
});

const end = (label: string, x: number, y: number): ProcessElement => ({
  id: genId("e"),
  type: "end",
  label,
  position: { x, y },
  connections: [],
});

const gateway = (label: string, x: number, y: number, connections: string[] = []): ProcessElement => ({
  id: genId("g"),
  type: "gateway",
  label,
  position: { x, y },
  connections,
});

const document_ = (label: string, x: number, y: number, connections: string[] = []): ProcessElement => ({
  id: genId("d"),
  type: "document",
  label,
  position: { x, y },
  connections,
});

const data = (label: string, x: number, y: number, connections: string[] = []): ProcessElement => ({
  id: genId("dt"),
  type: "data",
  label,
  position: { x, y },
  connections,
});

// LTC Full Process (12 stages from 商机立项 to 运营运维)
const ltcElements: ProcessElement[] = [
  start("商机发现", 400, 50),
  task("商机立项", 400, 130),
  gateway("立项评审通过?", 400, 210, []),
  task("需求调研评审", 400, 290),
  gateway("需求确认?", 400, 370, []),
  task("方案建设", 400, 450),
  gateway("方案通过?", 400, 530, []),
  task("招投标", 400, 610),
  gateway("中标?", 400, 690, []),
  task("合同签约", 400, 770),
  task("合同管理", 400, 850),
  task("项目前准备", 400, 930),
  task("项目规划", 400, 1010),
  task("项目实施", 400, 1090),
  task("项目结项", 400, 1170),
  task("回款管理", 400, 1250),
  task("运营运维", 400, 1330),
  end("流程结束", 400, 1410),
];

// Project Initiation Process (需求确认→方案评审→合同签订→项目启动)
const projectInitElements: ProcessElement[] = [
  start("项目需求", 400, 50),
  task("需求确认", 400, 130),
  gateway("需求明确?", 400, 210, []),
  task("方案评审", 400, 290),
  gateway("方案通过?", 400, 370, []),
  task("合同签订", 400, 450),
  gateway("合同签署?", 400, 530, []),
  task("项目启动", 400, 610),
  end("项目开始执行", 400, 690),
];

// Risk Approval Process (风险识别→评估→审批→实施→监控)
const riskApprovalElements: ProcessElement[] = [
  start("风险触发", 400, 50),
  task("风险识别", 400, 130),
  gateway("需详细评估?", 400, 210, []),
  task("风险评估", 400, 290),
  gateway("高风险?", 400, 370, []),
  task("升级审批", 150, 370),
  gateway("审批通过?", 150, 450, []),
  task("风险应对规划", 400, 370),
  task("实施应对措施", 400, 530),
  task("监控与复盘", 400, 610),
  end("风险关闭", 400, 690),
];

// Procurement Process (需求提出→供应商筛选→商务谈判→合同审批→执行)
const procurementElements: ProcessElement[] = [
  start("采购需求", 400, 50),
  task("需求提出", 400, 130),
  gateway("紧急采购?", 400, 210, []),
  task("预算审批", 150, 210),
  task("供应商筛选", 400, 290),
  gateway("合格供应商?", 400, 370, []),
  task("商务谈判", 400, 450),
  gateway("谈判达成?", 400, 530, []),
  task("合同审批", 400, 610),
  gateway("合同签署?", 400, 690, []),
  task("执行采购", 400, 770),
  task("验收入库", 400, 850),
  end("采购完成", 400, 930),
];

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: "ltc-full",
    name: "LTC全流程",
    description: "从商机发现到运营维护的完整LTC流程，包含12个关键阶段",
    category: "销售流程",
    diagramType: "flowchart",
    elements: ltcElements,
  },
  {
    id: "project-init",
    name: "项目立项流程",
    description: "项目从需求确认到启动的标准流程",
    category: "项目管理",
    diagramType: "flowchart",
    elements: projectInitElements,
  },
  {
    id: "risk-approval",
    name: "风险审批流程",
    description: "风险识别、评估、审批、实施和监控的完整流程",
    category: "风险管理",
    diagramType: "flowchart",
    elements: riskApprovalElements,
  },
  {
    id: "procurement",
    name: "采购流程",
    description: "从需求提出到验收入库的采购完整流程",
    category: "采购管理",
    diagramType: "flowchart",
    elements: procurementElements,
  },
];

// Element type to draw.io shape mapping
const elementShapes: Record<ProcessElement["type"], string> = {
  start: "ellipse",
  end: "ellipse",
  task: "roundedRectangle",
  gateway: "diamond",
  document: "document",
  data: "dataStore",
};

// Element type to Excalidraw type mapping
const excalidrawTypes: Record<ProcessElement["type"], string> = {
  start: "rectangle",
  end: "rectangle",
  task: "rectangle",
  gateway: "diamond",
  document: "rectangle",
  data: "rectangle",
};

// Export to draw.io XML format
export function exportToDrawio(template: ProcessTemplate): string {
  const { elements, name } = template;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-05-10T00:00:00.000Z" agent="Claude" version="24.0.0">
  <diagram name="${name}" id="${template.id}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
`;

  // Add cells for each element
  elements.forEach((el, index) => {
    const shape = elementShapes[el.type];
    const w = el.type === "gateway" ? 80 : 120;
    const h = el.type === "gateway" ? 50 : 40;

    // Style based on type
    let style = `shape=${shape};rounded=1;`;
    if (el.type === "start" || el.type === "end") {
      style = `shape=${shape};fillColor=#22c55e;strokeColor=#16a34a;fontColor=#ffffff;`;
    } else if (el.type === "gateway") {
      style = `shape=${shape};fillColor=#f59e0b;strokeColor=#d97706;fontColor=#ffffff;`;
    } else if (el.type === "document") {
      style = `shape=${shape};fillColor=#3b82f6;strokeColor=#2563eb;fontColor=#ffffff;`;
    } else if (el.type === "data") {
      style = `shape=${shape};fillColor=#8b5cf6;strokeColor=#7c3aed;fontColor=#ffffff;`;
    } else {
      style = `shape=${shape};fillColor=#3b82f6;strokeColor=#2563eb;fontColor=#ffffff;rounded=0;`;
    }

    xml += `        <mxCell id="${el.id}" value="${el.label}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${el.position.x - w / 2}" y="${el.position.y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>\n`;
  });

  // Add edges (connections)
  const nodeIds = elements.map(el => el.id);
  elements.forEach((el) => {
    el.connections.forEach((targetId) => {
      if (nodeIds.includes(targetId)) {
        xml += `        <mxCell id="edge-${el.id}-${targetId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#64748b;strokeWidth=1;" edge="1" parent="1" source="${el.id}" target="${targetId}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
      }
    });
  });

  xml += `      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  return xml;
}

// Export to Excalidraw JSON format
export function exportToExcalidraw(template: ProcessTemplate): string {
  const { elements, name } = template;

  const excalidrawElements = elements.map((el) => {
    const type = excalidrawTypes[el.type];
    const w = el.type === "gateway" ? 80 : 160;
    const h = el.type === "gateway" ? 60 : 50;

    return {
      id: el.id,
      type,
      x: el.position.x - w / 2,
      y: el.position.y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: "#1e293b",
      backgroundColor: el.type === "start" || el.type === "end" ? "#22c55e" :
                      el.type === "gateway" ? "#f59e0b" :
                      el.type === "document" ? "#3b82f6" :
                      el.type === "data" ? "#8b5cf6" : "#3b82f6",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughElement: true,
      roughness: 1,
      seed: Math.floor(Math.random() * 1000000),
      text: el.label,
      fontSize: 14,
      fontFamily: "Virgil, Segoe UI, sans-serif",
      textAlign: "center",
      verticalAlign: "middle",
    };
  });

  const excalidrawJson = {
    type: "excalidraw",
    version: 2,
    source: "AI PM System",
    elements: excalidrawElements,
    appState: {
      theme: "light",
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };

  return JSON.stringify(excalidrawJson, null, 2);
}

// Download helper
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Load from localStorage
export function loadFromStorage(key: string): ProcessTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(`process_${key}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save to localStorage
export function saveToStorage(key: string, templates: ProcessTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`process_${key}`, JSON.stringify(templates));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}