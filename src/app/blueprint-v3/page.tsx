"use client";

import Link from "next/link";
import { useState } from "react";

// Initial data structure matching the user's requirements
const INITIAL_DATA = [
  {
    id: "sales",
    title: "销售管理模块",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    nodes: ["商机", "合同签约", "合同/订单", "回款计划", "应收", "核销", "售后服务"]
  },
  {
    id: "project",
    title: "项目管理模块",
    color: "bg-green-100 text-green-800 border-green-300",
    nodes: ["项目立项", "项目规划", "项目执行", "项目收尾"],
    monitoring: {
      title: "贯穿全流程的监控管理",
      nodes: ["进度监控", "风险监控", "成本监控", "需求监控", "变更监控"]
    }
  },
  {
    id: "cost",
    title: "成本管理模块",
    color: "bg-orange-100 text-orange-800 border-orange-300",
    nodes: ["项目概算", "项目预算", "预算执行（核算）", "决算"]
  },
  {
    id: "tools",
    title: "工具模块",
    color: "bg-purple-100 text-purple-800 border-purple-300",
    nodes: ["项目与企业微信", "PMO看板", "项目模版", "结构化文档", "其他"]
  }
];

export default function BlueprintV3Page() {
  const [data, setData] = useState(INITIAL_DATA);
  const [editingPos, setEditingPos] = useState<{laneId: string, type: 'title' | 'node' | 'monitoringTitle' | 'monitoringNode', index?: number} | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleEdit = (laneId: string, type: 'title' | 'node' | 'monitoringTitle' | 'monitoringNode', value: string, index?: number) => {
    setEditingPos({ laneId, type, index });
    setEditValue(value);
  };

  const handleSave = () => {
    if (!editingPos) return;
    const newData = [...data];
    const laneIndex = newData.findIndex(l => l.id === editingPos.laneId);
    if (laneIndex > -1) {
      if (editingPos.type === 'title') {
        newData[laneIndex].title = editValue;
      } else if (editingPos.type === 'node' && editingPos.index !== undefined) {
        newData[laneIndex].nodes[editingPos.index] = editValue;
      } else if (editingPos.type === 'monitoringTitle' && newData[laneIndex].monitoring) {
        newData[laneIndex].monitoring!.title = editValue;
      } else if (editingPos.type === 'monitoringNode' && editingPos.index !== undefined && newData[laneIndex].monitoring) {
        newData[laneIndex].monitoring!.nodes[editingPos.index] = editValue;
      }
    }
    setData(newData);
    setEditingPos(null);
  };

  const renderEditableText = (text: string, laneId: string, type: 'title' | 'node' | 'monitoringTitle' | 'monitoringNode', index?: number, className: string = "") => {
    const isEditing = editingPos?.laneId === laneId && editingPos?.type === type && editingPos?.index === index;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className={`bg-white border border-blue-400 rounded px-1 text-black font-normal outline-none focus:ring-2 focus:ring-blue-500 w-auto text-center`}
          style={{ minWidth: '40px', width: `${Math.max(editValue.length, 2)}em`, maxWidth: '100%' }}
        />
      );
    }
    return (
      <span 
        className={`cursor-pointer hover:underline decoration-dashed underline-offset-4 decoration-current/40 ${className}`}
        onDoubleClick={() => handleEdit(laneId, type, text, index)}
        title="双击进行编辑"
      >
        {text}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="border-b border-gray-200 p-4 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm">← 返回首页</Link>
          <span className="text-gray-300">|</span>
          <h1 className="font-bold text-lg text-gray-800">🗺️ 业务场景与工具蓝图 V3</h1>
          <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full border border-purple-200">双击文字可编辑</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 flex flex-col items-center gap-8">
        {/* The Original Image Attachment Area */}
        <div className="w-full max-w-7xl bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 text-sm text-gray-700 font-semibold flex justify-between">
            <span>📎 附件原图 (未做任何修改)</span>
            <span className="text-xs font-normal text-gray-500">如图片未显示，请将图片命名为 blueprint-v3.png 并放入 public 文件夹中</span>
          </div>
          <div className="p-4 flex justify-center bg-gray-50 min-h-[150px] items-center">
            <img 
              src="/blueprint-v3.png" 
              alt="全流程交付管理蓝图附件" 
              className="max-w-full h-auto rounded border border-gray-200 shadow-sm"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden text-gray-400 text-center">
              <p className="text-2xl mb-2">📸</p>
              <p>[图片加载失败]</p>
              <p className="text-xs mt-2">public/blueprint-v3.png</p>
            </div>
          </div>
        </div>

        {/* The Flowchart Canvas */}
        <div className="w-full max-w-7xl bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-800 tracking-wide">项目全流程交付管理蓝图</h2>
            <p className="text-sm text-gray-500 mt-2">支持双击任意节点或标题进行内容修改</p>
          </div>

          <div className="flex flex-col gap-6">
            {data.map((lane) => (
              <div key={lane.id} className="flex flex-col xl:flex-row gap-4 items-stretch">
                {/* Left side: Lane Header */}
                <div className={`w-full xl:w-48 shrink-0 flex items-center justify-center p-4 rounded-lg border-l-4 shadow-sm font-bold text-center text-lg ${lane.color}`}>
                  {renderEditableText(lane.title, lane.id, 'title')}
                </div>

                {/* Right side: Nodes */}
                <div className="flex-1 flex flex-col bg-gray-50 p-6 rounded-lg border border-gray-100 shadow-inner">
                  {/* Primary Nodes Flow */}
                  <div className="flex flex-wrap items-center gap-4">
                    {lane.nodes.map((node, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className={`px-5 py-2.5 rounded-md shadow bg-white border font-medium text-[15px] transition-transform hover:-translate-y-0.5 whitespace-nowrap ${lane.color.replace('bg-', 'border-').replace('100', '400')}`}>
                          {renderEditableText(node, lane.id, 'node', index)}
                        </div>
                        {index < lane.nodes.length - 1 && (
                          <div className="text-gray-400 flex-shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Special Monitoring Span for Project Management */}
                  {lane.monitoring && (
                    <div className="mt-8 pt-6 border-t border-gray-200 relative">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-50 px-4 text-xs text-gray-400">贯穿项目全流程</div>
                      <div className="w-full bg-blue-50/50 border border-blue-200 rounded-lg p-5 shadow-sm hover:shadow transition-shadow">
                        <div className="text-blue-800 font-bold text-sm mb-4 text-center pb-2 border-b border-blue-100">
                          {renderEditableText(lane.monitoring.title, lane.id, 'monitoringTitle')}
                        </div>
                        <div className="flex flex-wrap justify-center gap-4">
                          {lane.monitoring.nodes.map((mNode, mIndex) => (
                            <div key={mIndex} className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded text-sm font-medium shadow-sm hover:bg-blue-50 hover:border-blue-300 transition-colors">
                              {renderEditableText(mNode, lane.id, 'monitoringNode', mIndex)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
