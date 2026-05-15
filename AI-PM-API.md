# AI PM System API 接口文档

> 版本：V3.0 | 更新时间：2026-05-14 | 基础路径：`https://pmai.chunyu2026.qzz.io`

---

## 目录

- [1. 项目状态](#1-项目状态-api)
- [2. LTC流程](#2-ltc流程-api)
- [3. WBS拆解](#3-wbs拆解-api)
- [4. CPM关键路径](#4-cpm关键路径-api)
- [5. EVM挣值分析](#5-evm挣值分析-api)
- [6. 风险管理](#6-风险管理-api)
- [7. 合同管理](#7-合同管理-api)
- [8. 质量管理](#8-质量管理-api)
- [9. 干系人管理](#9-干系人管理-api)
- [10. 规划中心](#10-规划中心-api)
- [11. PMO治理](#11-pmo治理-api)
- [12. 知识库](#12-知识库-api)
- [13. 执行与交付](#13-执行与交付-api)
- [14. 监控中心](#14-监控中心-api)
- [15. 资源管理](#15-资源管理-api)
- [16. 项目收尾](#16-项目收尾-api)
- [17. 报告生成](#17-报告生成-api)
- [18. 流程设计](#18-流程设计-api)
- [19. 治理分析](#19-治理分析-api)

---

## 1. 项目状态 `/api/project-status`

项目继续接口，支持上下文续接的任务执行。

### GET

查询项目当前状态。

**响应：**
```json
{
  "success": true,
  "data": {
    "version": "2.0",
    "lastUpdated": "2026-05-10",
    "completedModules": ["initiation", "dashboard", "wbs", "cpm"],
    "currentModule": null,
    "pendingTasks": [
      { "id": "evm", "name": "挣值分析(EVM)", "priority": "P0", "status": "pending" }
    ]
  }
}
```

### POST

| action | 说明 | 参数 |
|--------|------|------|
| `continue` | 返回下一个推荐任务 | - |
| `update` | 更新任务状态 | `moduleId` |
| `complete` | 标记任务完成 | `moduleId` |
| `log` | 记录上下文/笔记 | `taskDescription` |

**示例：继续下一个任务**
```json
POST /api/project-status
{ "action": "continue" }
```

**响应：**
```json
{
  "success": true,
  "data": {
    "recommendedTask": { "id": "evm", "name": "挣值分析(EVM)", "priority": "P0", "status": "pending" },
    "allTasks": [...]
  }
}
```

---

## 2. LTC流程 `/api/ltc`

LTC阶段评审接口。

### POST `/api/ltc`

进行AI阶段评审。

**请求参数：**
```json
{
  "projectId": "string",
  "stageId": "string",
  "stageData": {
    "name": "阶段名称",
    "alias": "English Name",
    "entryCriteria": ["入口标准1", "入口标准2"],
    "exitCriteria": ["出口标准1", "出口标准2"],
    "deliverables": ["交付物1", "交付物2"],
    "raciMatrix": { "roles": [], "assignments": [] }
  }
}
```

**响应：**
```json
{
  "approved": true,
  "issues": [],
  "suggestions": [],
  "aiReasoning": "【AI阶段评审报告】\n..."
}
```

---

## 3. WBS拆解 `/api/wbs`

AI辅助WBS工作分解结构生成。

### POST `/api/wbs`

```json
{
  "scene": "wbs",
  "systemPrompt": "你是一位资深项目管理专家...",
  "userMessage": "项目名称：xxx\nSOW内容：...",
  "temperature": 0.7
}
```

**响应：**
```json
{
  "content": "生成的WBS结构内容（Markdown或JSON格式）",
  "model": "deepseek-chat"
}
```

---

## 4. CPM关键路径 `/api/cpm`

关键路径法（CPM）计算。

### POST `/api/cpm`

```json
{
  "tasks": [
    { "id": "A", "name": "任务A", "duration": 3, "predecessors": [] },
    { "id": "B", "name": "任务B", "duration": 5, "predecessors": ["A"] },
    { "id": "C", "name": "任务C", "duration": 4, "predecessors": ["A"] },
    { "id": "D", "name": "任务D", "duration": 6, "predecessors": ["B", "C"] }
  ]
}
```

**响应：**
```json
{
  "tasks": [
    {
      "id": "A", "name": "任务A", "duration": 3,
      "es": 0, "ef": 3, "ls": 0, "lf": 3,
      "totalFloat": 0, "isCritical": true
    }
  ],
  "criticalPath": ["A", "B", "D"],
  "projectDuration": 14,
  "reasoning": "关键路径计算推理过程..."
}
```

---

## 5. EVM挣值分析 `/api/evm`

挣值管理分析。

### POST `/api/evm`

```json
{
  "projectName": "智慧城市大数据平台",
  "budgetAtCompletion": 500,
  "tasks": [
    { "period": "第1月", "plannedValue": 80, "actualCost": 75, "completionPercent": 100 },
    { "period": "第2月", "plannedValue": 120, "actualCost": 130, "completionPercent": 85 },
    { "period": "第3月", "plannedValue": 100, "actualCost": 95, "completionPercent": 60 }
  ]
}
```

**响应：**
```json
{
  "ev": 248,
  "pv": 300,
  "ac": 300,
  "sv": -52,
  "cv": -52,
  "spi": 0.827,
  "cpi": 0.827,
  "eac": 605,
  "etc": 305,
  "aiReasoning": "详细的中文推理分析..."
}
```

---

## 6. 风险管理 `/api/risk`

### POST `/api/risk`

通用风险AI分析接口。

```json
{
  "scene": "risk",
  "systemPrompt": "你是风险管理专家...",
  "userMessage": "项目描述...",
  "temperature": 0.3
}
```

### POST `/api/risk/analyze`

AI自动识别项目风险。

```json
{
  "projectDescription": "智慧城市大数据平台项目，涉及多系统集成..."
}
```

**响应：**
```json
{
  "risks": [
    {
      "id": "AI-xxx-1",
      "description": "技术架构风险：多系统集成兼容性问题",
      "category": "技术",
      "probability": 4,
      "impact": 4,
      "piScore": 16,
      "status": "identified",
      "responseStrategy": "提前进行技术POC验证..."
    }
  ],
  "aiReasoning": "基于项目描述分析...",
  "model": "deepseek-chat"
}
```

---

## 7. 合同管理 `/api/contract`

### POST `/api/contract`

| action | 说明 |
|--------|------|
| `parse` | AI解析付款条款文本 |

**示例：解析付款条款**
```json
{
  "action": "parse",
  "text": "合同金额100万元，签订后支付30%预付款，设备到货后支付50%，验收合格后支付20%"
}
```

**响应：**
```json
{
  "success": true,
  "milestones": [
    { "id": "ai-xxx-0", "name": "预付款", "amount": 30, "dueDate": "", "status": "pending", "trigger": "签订后" },
    { "id": "ai-xxx-1", "name": "到货款", "amount": 50, "dueDate": "", "status": "pending", "trigger": "设备到货后" },
    { "id": "ai-xxx-2", "name": "验收款", "amount": 20, "dueDate": "", "status": "pending", "trigger": "验收合格后" }
  ],
  "aiReasoning": "AI解析过程..."
}
```

---

## 8. 质量管理 `/api/quality`

### POST `/api/quality`

```json
{
  "projectType": "it",
  "phase": "执行",
  "deliverables": "系统部署文档、用户手册、培训记录",
  "criteria": "功能覆盖率≥95%，响应时间<2秒"
}
```

**响应：**
```json
{
  "issues": [
    "系统部署文档完整性待提升",
    "培训计划覆盖度不足"
  ],
  "suggestions": [
    "建议补充部署验证checklist",
    "建议增加用户验收测试环节"
  ],
  "riskLevel": "medium"
}
```

---

## 9. 干系人管理 `/api/stakeholder`

### POST `/api/stakeholder`

```json
{
  "stakeholders": [
    {
      "name": "张三",
      "role": "项目总监",
      "power": 5,
      "interest": 4,
      "currentEngagement": "中立",
      "desiredEngagement": "支持",
      "communicationFrequency": "每周",
      "communicationMethod": "会议"
    }
  ]
}
```

**响应：**
```json
{
  "suggestions": [
    {
      "name": "张三",
      "role": "项目总监",
      "managementStrategy": "重点管理：建议提升参与度，每周定期沟通..."
    }
  ],
  "aiReasoning": "基于权力-利益矩阵分析...",
  "model": "deepseek-chat"
}
```

---

## 10. 规划中心 `/api/planning`

### POST `/api/planning`

```json
{
  "projectType": "信息化",
  "knowledgeArea": "risk",
  "context": {
    "projectName": "智慧城市项目",
    "constraints": ["预算限制500万", "工期6个月"],
    "objectives": ["按时交付", "成本可控"]
  }
}
```

**响应：**
```json
{
  "suggestions": [
    "建立风险登记册，系统化管理项目风险",
    "使用概率影响矩阵评估风险优先级"
  ],
  "checklist": [
    "风险识别已完成",
    "风险评估已进行"
  ],
  "warnings": [
    "风险识别不全面，遗漏重要风险"
  ],
  "knowledgeArea": "risk",
  "projectType": "信息化",
  "timestamp": "2026-05-14T..."
}
```

---

## 11. PMO治理 `/api/pmo`

### GET `/api/pmo`

获取PMO仪表盘数据。

**响应：**
```json
{
  "portfolio": {
    "totalProjects": 12,
    "activeProjects": 8,
    "totalContractAmount": 8500,
    "totalCollectionAmount": 4200,
    "avgCollectionRate": 49.4,
    "healthDistribution": { "green": 5, "yellow": 2, "red": 1 }
  },
  "projects": [...],
  "okrs": [...],
  "metrics": {...},
  "prince2Gates": [...]
}
```

### POST `/api/pmo/okr`

创建或更新OKR。

```json
{
  "objective": "提升项目交付质量",
  "status": "on-track",
  "owner": "PMO负责人",
  "keyResults": [
    { "description": "客户满意度≥90分", "target": 90, "current": 85 },
    { "description": "项目准时交付率≥95%", "target": 95, "current": 88 }
  ]
}
```

**响应：**
```json
{
  "success": true,
  "okr": {
    "id": "OKR010",
    "objective": "提升项目交付质量",
    "status": "on-track",
    "owner": "PMO负责人",
    "keyResults": [...]
  }
}
```

---

## 12. 知识库 `/api/knowledge`

### POST `/api/knowledge/ask`

```json
{
  "question": "LTC流程中商机立项阶段的输出物有哪些？",
  "category": "流程管理",
  "sessionId": "optional-session-id"
}
```

**响应：**
```json
{
  "answer": "商机立项阶段的主要输出物包括：1) 商机信息表...",
  "sources": [
    { "title": "LTC流程规范", "content": "..." }
  ],
  "confidence": 0.92,
  "sessionId": "ks-xxx-xxx",
  "timestamp": "2026-05-14T..."
}
```

### GET `/api/knowledge/categories`

获取知识分类目录。

**响应：**
```json
{
  "categories": [
    { "id": "process", "name": "流程管理", "count": 24 },
    { "id": "template", "name": "文档模板", "count": 15 }
  ]
}
```

---

## 13. 执行与交付 `/api/execution`

### POST `/api/execution`

```json
{
  "projectId": "proj-001",
  "tasks": [
    { "name": "系统部署", "status": "in_progress", "assignee": "李工" },
    { "name": "数据迁移", "status": "completed", "assignee": "王工" }
  ],
  "deliverables": [
    { "name": "部署文档", "status": "pending" },
    { "name": "测试报告", "status": "completed" }
  ]
}
```

**响应：**
```json
{
  "summary": "整体执行进度正常，2个任务完成，1个任务进行中。",
  "risks": [
    "系统部署依赖第三方接口，可能存在集成风险"
  ],
  "recommendations": [
    "建议优先完成部署文档的编写"
  ]
}
```

---

## 14. 监控中心 `/api/monitoring`

### POST `/api/monitoring`

```json
{
  "projects": [
    {
      "id": "proj-001",
      "name": "智慧城市项目",
      "scheduleVariance": -5,
      "costVariance": 8,
      "scopeChangeCount": 2,
      "riskCount": 3,
      "status": "at-risk",
      "trend": "stable"
    }
  ],
  "timeframe": "最近30天"
}
```

**响应：**
```json
{
  "insights": [
    "当前有1个项目处于风险状态，需立即干预",
    "平均进度偏差为-3天"
  ],
  "rootCauses": [
    "资源分配不均，关键路径存在瓶颈",
    "需求变更流程缺失有效控制"
  ],
  "recommendations": [
    "优先级：高 建立专项资源保障机制"
  ]
}
```

---

## 15. 资源管理 `/api/resource`

### POST `/api/resource`

```json
{
  "members": [
    {
      "name": "李工",
      "role": "技术负责人",
      "availableHours": 160,
      "allocation": [
        { "projectName": "项目A", "allocatedHours": 100 }
      ]
    }
  ],
  "projects": ["项目A", "项目B"],
  "targetUtilization": 80
}
```

**响应：**
```json
{
  "success": true,
  "optimizedAllocations": [...],
  "suggestions": [
    "⚠️ 李工 超负荷 25%，需要立即调整"
  ],
  "conflicts": []
}
```

---

## 16. 项目收尾 `/api/closing`

### POST `/api/closing`

```json
{
  "projectId": "proj-001",
  "checklists": [
    { "id": "c1", "category": "验收", "item": "客户签字验收单", "completed": true },
    { "id": "c2", "category": "文档", "item": "项目文档归档", "completed": false }
  ],
  "signOffs": [
    { "role": "项目经理", "name": "张三", "signed": true },
    { "role": "客户代表", "name": "李四", "signed": false }
  ]
}
```

**响应：**
```json
{
  "success": true,
  "projectId": "proj-001",
  "completionRate": 50,
  "completedItems": 1,
  "totalItems": 2,
  "missingItems": ["项目文档归档"],
  "pendingSignoffs": ["客户代表"],
  "approved": false,
  "suggestions": [
    "仍有1项检查项未完成",
    "以下签字待完成: 客户代表"
  ],
  "finalReport": "项目收尾进度50%..."
}
```

---

## 17. 报告生成 `/api/reports`

### POST `/api/reports`

```json
{
  "type": "weekly",
  "projectName": "智慧城市项目",
  "dateRange": { "start": "2026-05-06", "end": "2026-05-12" },
  "tone": "formal",
  "completedWork": "- 系统部署完成\n- 接口联调完成80%",
  "nextPlans": "- 完成剩余接口联调\n- 开始用户验收测试",
  "issues": "- 第三方接口延迟问题",
  "resourceNeeds": "- 需要增加1名测试人员"
}
```

**响应：**
```json
{
  "success": true,
  "report": {
    "id": "RPT-20260514-001",
    "type": "weekly",
    "title": "智慧城市项目 - 项目周报",
    "content": "# 项目周报\n\n## 执行摘要\n...",
    "generatedAt": "2026-05-14T...",
    "projectName": "智慧城市项目"
  }
}
```

**报告类型 (type)：**
| type | 说明 |
|------|------|
| `weekly` | 项目周报 |
| `monthly` | 项目月报 |
| `progress` | 进度报告 |
| `meeting` | 会议纪要 |
| `acceptance` | 验收报告 |

---

## 18. 流程设计 `/api/process`

### POST `/api/process`

```json
{
  "description": "画出LTC全流程，从商机到回款管理，包含12个阶段"
}
```

**响应：**
```json
{
  "flowDescription": "LTC全流程，从商机立项到合同关闭",
  "elements": [
    { "id": "s1", "type": "start", "label": "开始", "position": { "x": 400, "y": 50 }, "connections": ["t1"] },
    { "id": "t1", "type": "task", "label": "商机立项", "position": { "x": 400, "y": 130 }, "connections": ["t2"] },
    { "id": "t2", "type": "task", "label": "需求调研", "position": { "x": 400, "y": 210 }, "connections": ["t3"] }
  ],
  "suggestions": [
    "建议在关键节点添加审核环节"
  ]
}
```

---

## 19. 治理分析 `/api/governance`

### POST `/api/governance`

| action | 说明 |
|--------|------|
| `analyzeGovernance` | AI辅助治理分析 |
| `generateOKR` | AI生成OKR |
| `analyzeException` | 异常项目分析 |
| `assessPRINCE2Compliance` | PRINCE2合规自评 |

**示例：治理分析**
```json
{
  "action": "analyzeGovernance"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "portfolioHealth": {
      "score": 78,
      "trend": "+3",
      "status": "yellow",
      "factors": ["资源饱和度超标", "部分项目进度偏差"]
    },
    "exceptionSummary": { "critical": 3, "warning": 12, "normal": 32 },
    "pmoMaturity": { "level": 3, "maxLevel": 5 },
    "aiSuggestions": [...]
  }
}
```

**示例：生成OKR**
```json
{
  "action": "generateOKR",
  "context": {
    "level": "company",
    "customParams": { "target": "30", "amount": "1500" }
  }
}
```

---

## 通用说明

### 请求头

```http
Content-Type: application/json
```

### 错误响应

```json
{
  "error": "错误描述",
  "status": 400
}
```

### LLM模型

系统支持 DeepSeek 和 MiniMax 双模型自动切换：

| 模型 | 用途 |
|------|------|
| `deepseek-chat` | 默认模型 |
| `MiniMax` | 备用模型 |

---

## 环境变量

```bash
# LLM API Keys
DEEPSEEK_API_KEY=your_deepseek_key
MINIMAX_API_KEY=your_minimax_key

# Supabase (可选)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```