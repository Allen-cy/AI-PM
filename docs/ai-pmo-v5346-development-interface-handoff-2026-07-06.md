# AI-PMO V5.3.46 开发接口交接文档

日期：2026-07-06  
当前版本：V5.3.46  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.46 已经把“知识治理提醒升级”推进到“治理流程候选 + 人工确认创建治理流程实例”：

- 风险管理页中，已升级的知识治理运营提醒可以“转治理流程”。
- PMO 治理中心可以看到“知识治理升级候选流程”，并带入治理流程创建表单。
- 创建治理流程前必须人工确认；系统不会静默写入治理流程、飞书或业务主数据。
- 本版本不新增 SQL，继续依赖 V5.3.44 的知识治理运营快照和提醒日志表。

下一阶段 V5.3.47 的重点是：

- 把治理流程实例、提醒日志、统一行动项、二次治理待办、关闭证据串成完整证据链。
- 治理流程关闭/驳回后，生成待办复核建议。
- PMO 人工确认后，反写二次治理待办状态和关闭证据。

## 2. 另一台设备继续开发的启动步骤

```bash
git clone https://github.com/Allen-cy/AI-PM.git
cd AI-PM
npm install
npm test
npm run build
```

如果使用现有工作树，应先确认：

```bash
git status --short
git log --oneline -5
git tag --list 'v5.3.*' | tail
node -p "require('./package.json').version"
```

期望状态：

- `package.json` 版本为 `5.3.46`。
- 最新 tag 包含 `v5.3.46`。
- `main` 至少包含以下提交：
  - `cc9528c feat: convert governance reminders to workflows`
  - `484dc83 docs: release ai pmo v5.3.46`

## 3. 环境变量清单

不要把真实密钥写入文档或代码。另一台设备只需要知道变量名。

| 类别 | 变量名 | 用途 |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` | 浏览器侧 Supabase URL |
| Supabase | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器侧 anon key |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | 服务端 service role，服务端读写表使用 |
| Auth | `AUTH_REQUIRED` | 是否强制登录，生产应为 `true` |
| Admin | `ADMIN_BOOTSTRAP_TOKEN` | 首次初始化管理员时使用 |
| AI | `MINIMAX_API_KEY` | 全局 MiniMax 模型密钥 |
| AI | `MINIMAX_MODEL` | 全局 MiniMax 模型名，默认 `MiniMax-M3` |
| AI | `DEEPSEEK_API_KEY` | 全局 DeepSeek 兜底 |
| AI | `GLM_API_KEY` / `GLM_MODEL` | 全局 GLM 兜底 |
| AI | `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | 全局 Anthropic 兜底 |
| Feishu | `FEISHU_APP_ID` | 全局飞书应用 App ID |
| Feishu | `FEISHU_APP_SECRET` | 全局飞书应用密钥 |
| Feishu | `FEISHU_BASE_TOKEN` | 全局飞书多维表格 App Token |
| Feishu | `FEISHU_PROJECT_TABLE_ID` | 项目台账表 |
| Feishu | `FEISHU_MILESTONE_TABLE_ID` | 里程碑表 |
| Feishu | `FEISHU_TASK_TABLE_ID` | 任务表 |
| Feishu | `FEISHU_RISK_TABLE_ID` | 风险表 |
| Feishu | `FEISHU_CONTRACT_TABLE_ID` | 合同表 |
| Feishu | `FEISHU_PAYMENT_TABLE_ID` | 回款表 |
| Feishu | `FEISHU_COST_TABLE_ID` | 成本表 |
| Feishu | `FEISHU_SYNC_LEDGER_TABLE_ID` | 同步流水表 |
| Feishu Event | `FEISHU_VERIFICATION_TOKEN` | 飞书事件订阅校验 |
| Feishu Event | `FEISHU_ENCRYPT_KEY` | 飞书事件加密密钥 |
| Feishu Action | `AI_PM_INTEGRATION_API_KEY` | 通用飞书动作接口 Bearer token |

## 4. 数据库脚本执行顺序

另一台设备只要连接同一个 Supabase 项目，不需要重复执行已执行过的 SQL；但如果换 Supabase 项目，应按顺序执行。

| 顺序 | SQL 文件 | 说明 |
|---:|---|---|
| 1 | `supabase-schema.sql` | 用户、认证、基础表 |
| 2 | `supabase-v522-user-config.sql` | 用户级 AI 模型配置和用户级飞书配置 |
| 3 | `supabase-v527-integration-sync-logs.sql` | 集成同步日志 |
| 4 | `supabase-v529-governance-workflows.sql` | 治理流程实例、事件、行动项 |
| 5 | `supabase-v530-issue-change-action-chain.sql` | 问题/变更/统一行动项链路 |
| 6 | `supabase-v531-ai-evidence-audit.sql` | AI 依据审计 |
| 7 | `supabase-v5313-migration-batches.sql` | 迁移批次 |
| 8 | `supabase-v5316-migration-remediation-actions.sql` | 迁移整改行动项 |
| 9 | `supabase-v5317-migration-remediation-feishu-sync.sql` | 迁移整改飞书同步 |
| 10 | `supabase-v5318-migration-field-mapping-profiles.sql` | 字段映射方案复用 |
| 11 | `supabase-v534-enterprise-security.sql` | 企业权限、项目授权、操作审计 |
| 12 | `supabase-v536-security-ops.sql` | 安全中心增强 |
| 13 | `supabase-v5330-risk-retrospective-assets.sql` | 风险复盘资产 |
| 14 | `supabase-v5331-risk-retrospective-knowledge-sync.sql` | 复盘资产导出审计 |
| 15 | `supabase-v5332-risk-retrospective-value.sql` | 复盘资产价值度量 |
| 16 | `supabase-v5334-risk-retrospective-governance.sql` | 复盘资产治理动作审计 |
| 17 | `supabase-v5338-risk-retrospective-governance-followups.sql` | 二次治理待办 |
| 18 | `supabase-v5344-risk-retrospective-governance-operations.sql` | 知识治理运营快照和提醒日志 |

V5.3.46 没有新增 SQL。

## 5. 关键模块边界

| 模块 | 文件/目录 | 说明 |
|---|---|---|
| 用户认证 | `src/features/auth/server.ts`、`src/app/api/auth/*` | 登录、当前用户、资料、密码、注册申请 |
| 用户 AI 配置 | `src/features/ai/settings.ts`、`src/app/api/user/ai-settings/route.ts` | 用户级模型配置，优先用户配置，失败后可回退全局配置 |
| LLM 网关 | `src/lib/llm.ts` | DeepSeek、MiniMax、GLM、Anthropic、OpenAI兼容调用入口 |
| 用户飞书配置 | `src/features/feishu/user-config.ts`、`src/app/api/user/feishu-connection/route.ts` | 用户级飞书配置，缺失时回退全局配置 |
| 飞书客户端 | `src/features/feishu/client.ts`、`src/features/feishu/actions.ts` | Base 读写、消息、任务、日历、文档动作 |
| 治理流程 | `src/features/governance/*`、`src/app/api/governance/workflows/route.ts` | 治理实例、状态流转、SLA、业务影响、审计包、飞书同步 |
| 风险复盘资产 | `src/features/risk/retrospective*.ts` | 风险关闭后的复盘资产、RAG、治理、价值度量 |
| 知识治理待办 | `src/features/risk/retrospective-governance-followups.ts` | 二次治理待办保存、流转、关闭证据 |
| 知识治理运营 | `src/features/risk/retrospective-governance-operations.ts` | 运营快照、提醒日志、提醒状态 |
| 治理流程候选 | `src/features/risk/retrospective-governance-workflow-candidate.ts` | V5.3.46 新增，提醒日志转治理流程候选 |
| RAG | `src/features/rag/*`、`src/app/api/rag/*` | 本地 lexical-hybrid 知识检索和引用 |
| 工作台 | `src/features/operating-system/workbench.ts` | PM/PMO 每日工作台 |
| 集成诊断 | `src/features/operating-system/diagnostics.ts`、`src/app/api/operating-system/integrations/route.ts` | 飞书、字段映射、数据质量、AI、RAG 诊断 |

## 6. 通用响应约定

当前接口一般返回：

```ts
{
  request_id: string;
  status: "succeeded" | "failed" | "skipped" | "not_configured" | "unauthorized" | "confirmation_required" | string;
  warning?: string;
}
```

常见 HTTP 状态：

| HTTP | 含义 |
|---:|---|
| 200 | 查询成功、预览成功、跳过重复写入 |
| 201 | 创建成功或确认写入成功 |
| 400 | 请求体错误、缺少字段、动作不合法 |
| 401 | `AUTH_REQUIRED=true` 且未登录 |
| 404 | 记录不存在 |
| 503 | Supabase/飞书等依赖未配置 |
| 502 | 外部 API 调用失败 |

所有写入飞书或业务主数据的接口原则：

1. 先返回候选、草稿、预览或 `confirmation_required`。
2. 用户确认后再写入。
3. 写入结果进入操作审计或集成同步日志。
4. 失败不能静默吞掉，必须返回 `warning` 或错误码。

## 7. 用户配置接口

### 7.1 当前用户

`GET /api/auth/me`

用途：获取当前登录用户和当前生效模型摘要。

响应重点：

```ts
{
  user: {
    id: string;
    email: string;
    phone: string;
    name: string | null;
    role: "admin" | "user";
    status: "active" | "disabled";
  } | null;
  ai_model: {
    provider: "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";
    providerLabel: string;
    model: string;
    source: "user" | "global" | "default";
    configured: boolean;
  };
}
```

### 7.2 用户级 AI 模型配置

`GET /api/user/ai-settings`

用途：读取当前用户 AI 模型配置，不回显密钥。

响应：

```ts
{
  settings: {
    provider: "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";
    model: string;
    baseUrl: string;
    enabled: boolean;
    apiKeyConfigured: boolean;
    apiKeyLast4: string;
    providerOptions: string[];
    defaultModels: Record<string, string>;
  }
}
```

`PUT /api/user/ai-settings`

请求：

```ts
{
  provider: "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}
```

说明：

- `apiKey` 留空表示不修改原密钥。
- 密钥保存到 `user_ai_settings.api_key`，只返回末四位。
- 当前缺口：没有“测试模型连通性”接口，V5.3.47 或 P15 后续可新增 `POST /api/user/ai-settings/test`。

### 7.3 用户级飞书配置

`GET /api/user/feishu-connection`

用途：读取当前用户飞书配置，不回显 `app_secret`。

响应：

```ts
{
  connection: {
    appId: string;
    appSecretConfigured: boolean;
    appSecretLast4: string;
    baseToken: string;
    tableMapping: Partial<Record<"project" | "milestone" | "task" | "risk" | "contract" | "payment" | "cost" | "syncLedger", string>>;
    status: string;
    configured: boolean;
    tableLabels: Record<string, string>;
    setupHint: string;
    larkCliHint: string;
  }
}
```

`PUT /api/user/feishu-connection`

请求：

```ts
{
  appId: string;
  appSecret?: string;
  baseToken: string;
  tableMapping: {
    project?: string;
    milestone?: string;
    task?: string;
    risk?: string;
    contract?: string;
    payment?: string;
    cost?: string;
    syncLedger?: string;
  };
}
```

说明：

- 首次保存必须填写 `appSecret`。
- 之后 `appSecret` 留空表示不修改原密钥。
- 字段表 ID 映射保存到 `user_feishu_connections.table_mapping`。
- 当前缺口：没有逐表字段权限测试按钮，可复用 `/api/integrations/feishu/health` 和 `/api/operating-system/integrations` 的诊断逻辑扩展。

## 8. 集成诊断接口

### 8.1 飞书健康检查

`GET /api/integrations/feishu/health`

用途：检查当前用户生效飞书配置。优先个人配置，其次全局配置。

响应重点：

```ts
{
  status: "ok" | "degraded" | "not_configured" | "error";
  source: "user" | "global" | "missing";
  identity: "bot";
  detail?: string;
  lark_cli_hint?: string;
  request_id: string;
}
```

### 8.2 数据与集成中心总诊断

`GET /api/operating-system/integrations`

用途：聚合 AI 模型、飞书、RAG、字段映射、数据质量和同步日志。

响应重点：

```ts
{
  status: "succeeded";
  user: { name: string | null; role: string } | null;
  ai_model: AiModelSummary;
  feishu: {
    status: string;
    source: "user" | "global" | "missing";
    detail?: string;
  };
  rag: RagHealth;
  field_mapping_checks: Array<unknown>;
  data_quality_checks: Array<unknown>;
  diagnostics: Array<unknown>;
  sync_log_write: { status: string; warning?: string };
}
```

前端入口：

- `/integration-center`
- `/account`

## 9. 治理流程接口

### 9.1 治理流程列表

`GET /api/governance/workflows`

用途：读取治理流程实例、SLA、业务联动、治理策略和知识治理候选流程。

V5.3.46 新增响应字段：

```ts
{
  governance_knowledge_operation: {
    summary: unknown;
    workflowCandidates: Array<{
      workflowId: "risk-escalation" | string;
      workflowName: string;
      projectName: string;
      title: string;
      triggerSummary: string;
      inputSummary: string;
      owner: string;
      approver: string;
      priority: "high" | "medium" | "low";
      deadline: string;
      sourceType: "risk_retrospective_governance_reminder";
      sourceId: string;
      sourceLinkId?: string;
      sourceSummary: string;
      actionItems: Array<{ title: string; owner: string; dueDate: string; status?: string }>;
      boundary: string;
    }>;
  }
}
```

### 9.2 创建治理流程

`POST /api/governance/workflows`

请求：

```ts
{
  workflowId: string;
  projectName: string;
  title: string;
  triggerSummary?: string;
  inputSummary?: string;
  outputSummary?: string;
  owner: string;
  approver: string;
  priority?: "high" | "medium" | "low";
  deadline?: string;
  actionItems?: Array<{ title: string; owner?: string; dueDate?: string; status?: string }>;
  strategyVersion?: string;
  strategyRuleId?: string;
  strategySummary?: string;
  sourceType?: string;
  sourceId?: string;
  sourceLinkId?: string;
  sourceSummary?: string;
}
```

响应：

```ts
{
  status: "succeeded" | "failed" | "not_configured";
  instance?: GovernanceProcessInstance;
  event?: GovernanceProcessEvent;
  businessImpact?: unknown;
  feishu_sync: { status: string; reason?: string };
}
```

### 9.3 流转治理流程

`PATCH /api/governance/workflows`

请求：

```ts
{
  id: string;
  action: "submit" | "approve" | "conditional_approve" | "return" | "reject" | "close";
  comment?: string;
  decision?: string;
  outputSummary?: string;
  actionItems?: Array<{ title: string; owner?: string; dueDate?: string; status?: string }>;
}
```

说明：

- 当前流转会生成 `businessImpact`。
- 业务主数据写回仍是人工确认边界，不会静默改写项目台账或风险登记册。
- V5.3.47 应在 `close/reject` 后生成知识治理待办反写建议。

## 10. 风险复盘二次治理接口

### 10.1 二次治理待办列表和周报

`GET /api/risk/retrospective/assets/governance/followups`

查询参数：

| 参数 | 说明 |
|---|---|
| `limit` | 默认 50 |
| `status` | `all`、`待复核`、`处理中`、`待验收`、`已关闭` |
| `priority` | `all`、`high`、`medium`、`low` |
| `owner` | 责任人过滤 |
| `feishu_sync_status` | `all`、`未同步`、`待确认`、`同步中`、`已同步`、`同步失败` |
| `due` | `all`、`overdue`、`due_soon`、`normal`、`waiting_acceptance`、`evidence_gap`、`closed_this_week` |
| `format` | `markdown` 时下载周运营 Markdown |

响应：

```ts
{
  status: string;
  followups: RiskRetrospectiveGovernanceFollowupRecord[];
  operation_report: {
    summary: unknown;
    reminders: unknown[];
    reportMarkdown: string;
  };
  report_markdown: string;
}
```

### 10.2 保存二次治理待办

`POST /api/risk/retrospective/assets/governance/followups`

请求：

```ts
{
  actionItems: Array<{
    id: string;
    sourceLogId: string;
    assetTitle: string;
    reason: string;
    actionRequired: string;
    owner: string;
    deadline: string;
    priority: "high" | "medium" | "low";
    closingCriteria: string;
    reminderText: string;
  }>
}
```

### 10.3 流转二次治理待办

`PATCH /api/risk/retrospective/assets/governance/followups`

请求：

```ts
{
  id: string;
  status: "待复核" | "处理中" | "待验收" | "已关闭";
  closureNote?: string;
  reviewResult?: string;
}
```

## 11. 知识治理运营接口

### 11.1 运营历史

`GET /api/risk/retrospective/assets/governance/followups/operation-history`

用途：读取当前运营报表、历史快照、提醒日志、运营摘要。

响应重点：

```ts
{
  status: string;
  operation_report: unknown;
  snapshots: Array<unknown>;
  reminder_logs: Array<{
    id: string;
    status: "draft" | "sent" | "processed" | "ignored" | "escalated" | "failed";
    title: string;
    assetTitle?: string;
    sourceFollowupId?: string;
  }>;
  operation_summary: unknown;
  boundary: string;
}
```

### 11.2 保存运营快照

`POST /api/risk/retrospective/assets/governance/followups/operation-history`

请求：

```ts
{ "action": "snapshot" }
```

说明：保存当日知识治理运营快照到 `risk_retrospective_governance_operation_snapshots`。

### 11.3 处理运营提醒

`PATCH /api/risk/retrospective/assets/governance/followups/operation-history`

请求：

```ts
{
  id: string;
  status: "processed" | "ignored" | "escalated";
  closureNote?: string;
}
```

联动规则：

- `processed`：对应二次治理待办进入 `待验收`。
- `ignored`：只更新提醒日志，不关闭待办。
- `escalated`：对应二次治理待办保持 `处理中`，并创建统一行动项。

## 12. V5.3.46 新增：知识治理提醒转治理流程

`POST /api/risk/retrospective/assets/governance/followups/operation-history/governance-workflow`

### 12.1 预览候选流程

请求：

```ts
{
  "id": "reminder_log_id"
}
```

响应：

```ts
{
  status: "confirmation_required";
  confirmation_required: true;
  candidate: KnowledgeGovernanceWorkflowCandidate;
  reminder_log: RiskRetrospectiveGovernanceReminderLog;
  boundary: string;
}
```

### 12.2 确认创建流程

请求：

```ts
{
  "id": "reminder_log_id",
  "confirm": true,
  "candidate": {
    "workflowId": "risk-escalation",
    "projectName": "风险复盘资产治理",
    "title": "可选覆盖标题",
    "owner": "可选覆盖责任人",
    "approver": "可选覆盖审批人",
    "deadline": "2026-07-10"
  }
}
```

响应：

```ts
{
  status: "succeeded";
  duplicate_skipped?: boolean;
  instance?: GovernanceProcessInstance;
  candidate: KnowledgeGovernanceWorkflowCandidate;
  reminder_log: RiskRetrospectiveGovernanceReminderLog;
  feishu_sync: { status: string; reason?: string };
}
```

约束：

- 只有 `reminder_log.status === "escalated"` 才能转换。
- 同一 `workflowId + projectName + title` 已存在未关闭流程时，返回 `duplicate_skipped: true`，不重复创建。
- 创建后写入 `integration_sync_logs` 和 `operation_audit_logs`。

## 13. 飞书写入确认接口

### 13.1 二次治理待办同步飞书任务

`POST /api/risk/retrospective/assets/governance/followups/feishu-sync`

准备同步：

```ts
{
  "id": "followup_id",
  "mode": "prepare"
}
```

确认写入：

```ts
{
  "id": "followup_id",
  "mode": "confirm",
  "confirm": true
}
```

说明：

- `prepare` 只把状态置为 `待确认`。
- `confirm=true` 后才调用飞书任务接口。
- 飞书未配置时返回 `not_configured`、`setupHint` 和 `larkCliHint`。

### 13.2 知识治理周运营提醒

`POST /api/risk/retrospective/assets/governance/followups/weekly-reminder`

预览：

```ts
{}
```

确认发送：

```ts
{
  "confirm": true,
  "receiveIdType": "chat_id",
  "receiveId": "oc_xxx"
}
```

说明：

- 未确认时返回 `confirmation_required`。
- 同一周已发送、已处理、无需处理或已升级的提醒会被抑制，不重复外发。
- 成功或失败都会尝试写入提醒日志。

## 14. RAG 与知识接口

### 14.1 知识问答

`POST /api/rag/query`

请求：

```ts
{
  "query": "如何做风险复盘？",
  "filters": {
    "domains": ["AI-PMO/knowledge"],
    "confidentiality_max": "internal",
    "status": ["reviewed", "published"]
  },
  "top_k": 5
}
```

响应：

```ts
{
  answer: string;
  answer_status: "answered" | "insufficient_evidence" | "forbidden" | "error";
  confidence: number;
  citations: Array<{
    page_id: string;
    document: string;
    excerpt: string;
    authority: string;
    confidentiality: string;
    relevance: number;
  }>;
  retrieval: {
    mode: "lexical-hybrid";
    provider: "local-corpus";
    index_version: string;
  };
}
```

说明：

- 当前检索模式为本地 lexical-hybrid，不是向量库。
- 默认只检索 `reviewed` 和 `published`。
- 涉及实时项目、任务、风险、回款等问题会拒答，要求连接业务数据。

### 14.2 RAG 健康检查

`GET /api/rag/health`

响应：

```ts
{
  status: "ok" | "degraded";
  provider: "local-corpus";
  index_version: string;
  page_count: number;
  chunk_count: number;
  embedded_chunk_count: 0;
  retrieval_mode: "lexical-hybrid";
}
```

## 15. V5.3.47 建议新增接口设计

V5.3.47 不建议先做 UI，建议先做服务端证据链与反写接口。

### 15.1 建议新增 SQL

文件建议：`supabase-v5347-knowledge-governance-evidence-chain.sql`

建议表：`risk_retrospective_governance_evidence_links`

字段建议：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `source_followup_id` | uuid/text | 二次治理待办 ID |
| `reminder_log_id` | uuid/text | 知识治理运营提醒日志 ID |
| `unified_action_id` | uuid/text | 统一行动项 ID，可为空 |
| `governance_instance_id` | uuid | 治理流程实例 ID |
| `link_type` | text | `knowledge_governance_escalation` |
| `status` | text | `active`、`pending_review`、`applied`、`rejected` |
| `closure_recommendation` | text | 流程关闭后生成的待办复核建议 |
| `reviewer_id` | uuid | PMO 复核人 |
| `reviewer_name` | text | PMO 复核人姓名 |
| `review_status` | text | `pending`、`approved`、`rejected` |
| `review_note` | text | 复核意见 |
| `applied_at` | timestamptz | 反写时间 |
| `request_id` | text | 请求 ID |
| `metadata` | jsonb | 来源摘要、快照、差异 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

如果不想新增 SQL，短期也可以用 `governance_process_instances.metadata` 和 `risk_retrospective_governance_followups` 现有字段串联，但不利于审计查询和后续导出。

### 15.2 查询证据链

建议接口：

`GET /api/risk/retrospective/assets/governance/followups/evidence-chain?followupId=xxx`

或：

`GET /api/governance/workflows/[id]/knowledge-governance-chain`

响应建议：

```ts
{
  status: "succeeded";
  chain: {
    followup?: RiskRetrospectiveGovernanceFollowupRecord;
    reminderLog?: RiskRetrospectiveGovernanceReminderLog;
    unifiedAction?: UnifiedActionItem;
    governanceInstance?: GovernanceProcessInstance;
    governanceEvents: GovernanceProcessEvent[];
    evidenceLink?: RiskRetrospectiveGovernanceEvidenceLink;
  };
  timeline: Array<{
    at: string;
    type: string;
    title: string;
    actor?: string;
    evidence?: string;
  }>;
  gaps: Array<{
    code: string;
    severity: "high" | "medium" | "low";
    message: string;
  }>;
}
```

### 15.3 生成反写建议

建议接口：

`POST /api/risk/retrospective/assets/governance/followups/evidence-chain/recommendation`

请求：

```ts
{
  "governanceInstanceId": "uuid",
  "sourceFollowupId": "uuid",
  "mode": "preview"
}
```

响应：

```ts
{
  status: "confirmation_required";
  recommendation: {
    targetFollowupStatus: "待验收" | "已关闭" | "处理中";
    closureNote: string;
    reviewResult: string;
    evidenceSummary: string;
    sourceEvents: string[];
    riskWarnings: string[];
  };
  boundary: "仅生成反写建议，不自动覆盖二次治理待办。"
}
```

规则建议：

- 治理流程 `closed` 且输出成果完整：建议待办进入 `待验收` 或 `已关闭`。
- 治理流程 `rejected`：建议待办保持 `处理中`，追加驳回原因。
- 治理流程 `returned`：建议待办保持 `处理中`，追加补充材料要求。
- 如果待办已有关闭证据，不允许覆盖，只能追加复核说明。

### 15.4 人工确认反写

建议接口：

`PATCH /api/risk/retrospective/assets/governance/followups/evidence-chain/apply`

请求：

```ts
{
  "evidenceLinkId": "uuid",
  "confirm": true,
  "targetFollowupStatus": "待验收",
  "closureNote": "治理流程已完成，输出成果已纳入制度/模板修订。",
  "reviewResult": "PMO复核通过，进入待验收。"
}
```

响应：

```ts
{
  status: "succeeded";
  followup: RiskRetrospectiveGovernanceFollowupRecord;
  evidenceLink: RiskRetrospectiveGovernanceEvidenceLink;
  audit: {
    operationAuditStatus: "succeeded" | "failed";
    integrationLogStatus?: "succeeded" | "failed" | "skipped";
  };
}
```

强制边界：

- `confirm !== true` 时只返回 `confirmation_required`。
- 不能覆盖已有关闭证据，只能追加。
- 必须写 `operation_audit_logs`。
- 如果有飞书任务同步，可生成飞书更新候选，但仍需二次确认。

## 16. 前端页面入口

| 页面 | 路径 | 相关接口 |
|---|---|---|
| 首页 | `/` | `/api/auth/me` |
| 用户中心 | `/account` | `/api/auth/me`、`/api/user/ai-settings`、`/api/user/feishu-connection` |
| 数据与集成中心 | `/integration-center` | `/api/operating-system/integrations` |
| PM/PMO 工作台 | `/workbench` | `/api/operating-system/workbench` |
| PMO 治理中心 | `/governance-workflows` | `/api/governance/workflows` |
| 风险管理 | `/risk` | `/api/risk/*`、知识治理待办和运营接口 |
| 知识库 | `/knowledge` | `/api/rag/query`、`/api/rag/health`、`/api/knowledge` |
| 模板中心 | `/templates` | `/api/templates/download`、`/api/templates/import/risk` |

V5.3.47 预计改动页面：

- `/governance-workflows`：流程卡片显示知识治理证据链和关闭反写建议。
- `/risk`：二次治理待办区域显示来源治理流程、反写候选、确认反写按钮。
- `/reports` 或治理审计包：导出完整证据链。

## 17. 测试和发布规则

每次改动后至少执行：

```bash
npm test
npx eslint <本次改动文件>
git diff --check
npm run build
```

当前已知基线：

- 全量 `npm run lint` 仍有历史问题，V5.3.46 时为 86 个问题。
- `npm audit --omit=dev` 有 Next/PostCSS 和 xlsx 的上游风险，当前无直接修复项。
- 本项目要求“用户可见功能”必须发新版本：版本号、构建、tag、GitHub Release、Vercel Production 状态都要完成。

发布流程：

```bash
npm version 5.3.47 --no-git-tag-version
npm test
npm run build
git add .
git commit -m "feat: <scope>"
git tag v5.3.47
git push origin main
git push origin v5.3.47
gh release create v5.3.47 --title "AI-PMO System V5.3.47" --notes "<release notes>"
```

Vercel 当前项目已通过 GitHub main 分支自动部署。若本机 `vercel --prod` 提示 token 失效，可用 GitHub commit status 或 Vercel Dashboard 确认部署。

## 18. 当前未完成任务清单

优先级 P0：

1. V5.3.47：治理流程关闭/驳回后，生成二次治理待办反写建议。
2. V5.3.47：人工确认后反写二次治理待办状态、关闭证据和复核结论。
3. V5.3.47：治理审计包串联复盘资产、待办、提醒日志、统一行动项、治理流程和关闭证据。

优先级 P1：

1. P15-T1：用户级飞书“一键测试连接/字段权限/表ID有效性”。
2. P15-T2：统一飞书状态组件覆盖所有飞书相关页面。
3. P15-T4：用户级 AI 模型测试接口和失败降级说明。
4. P15-T3：通用飞书动作接口纳入用户级确认队列。

优先级 P2：

1. P16-T1：独立知识条目管理页、过期提醒和版本流转。
2. P16-T3：知识更新 diff、变更摘要、影响模块和订阅提醒。
3. P16-T4：PMO 制度、模板、最佳实践统一可检索目录。

