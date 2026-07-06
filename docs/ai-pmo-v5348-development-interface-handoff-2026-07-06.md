# AI-PMO V5.3.48 开发接口交接文档

日期：2026-07-06  
当前版本：V5.3.48  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.48 在 V5.3.47 的知识治理证据链基础上，补齐了 P15 的第一批用户级集成体验：

- 用户中心可以一键测试当前用户的 AI 模型配置。
- 用户中心可以一键测试当前用户的飞书配置，包括 App、Base、表 ID、字段权限。
- 飞书写入权限测试默认不执行，只有用户点击“确认写入测试”并二次确认后才写入同步流水测试记录。
- 集成中心新增统一集成状态面板，集中展示当前账号实际使用的 AI、飞书、RAG、同步审计状态。
- V5.3.48 不新增 SQL，继续复用 V5.3.22 用户配置表和 V5.3.27 集成同步日志表。

下一阶段建议从 V5.3.49 开始：

- 将通用飞书写入动作纳入用户级待确认队列。
- 把统一集成状态组件覆盖到项目组合看板、风险管理、治理中心、报告工厂和工作台等关键页面。
- 为 AI/飞书测试结果补历史记录和可视化审计。

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
git log --oneline -8
git tag --list 'v5.3.*' | tail
node -p "require('./package.json').version"
```

期望状态：

- `package.json` 版本为 `5.3.48`。
- 最新 tag 包含 `v5.3.48`。
- `main` 至少包含以下功能提交：
  - `433c7bb feat: add user integration connection tests`
  - `d1e8281 feat: add unified integration status panel`

## 3. 环境变量清单

不要把真实密钥写入文档或代码。另一台设备只需要知道变量名。

| 类别 | 变量名 | 用途 |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` | 浏览器侧 Supabase URL |
| Supabase | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器侧 anon key |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | 服务端 service role，服务端读写表使用 |
| Auth | `AUTH_REQUIRED` | 是否强制登录，生产应为 `true` |
| Admin | `ADMIN_BOOTSTRAP_TOKEN` | 首次初始化管理员时使用 |
| AI | `MINIMAX_API_KEY` / `MINIMAX_MODEL` | 全局 MiniMax 兜底模型 |
| AI | `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 全局 DeepSeek 兜底 |
| AI | `GLM_API_KEY` / `GLM_MODEL` | 全局 GLM 兜底 |
| AI | `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | 全局 Anthropic 兜底 |
| AI | `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | OpenAI 兼容兜底 |
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

## 4. 数据库脚本状态

V5.3.48 不新增 SQL。

如果换 Supabase 项目，应按既有顺序执行已有脚本：

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
| 19 | `supabase-v5347-knowledge-governance-evidence-chain.sql` | 知识治理证据链与待办反写索引 |

注意：

- V5.3.47 的第 19 个脚本仍需要在生产 Supabase 执行后，知识治理证据链持久化才完整可用。
- V5.3.48 的 AI/飞书测试 API 不需要新增表。
- 飞书写入权限测试使用既有同步流水表；如果同步流水表未配置或无权限，会返回明确失败原因，不会写业务主表。

## 5. V5.3.48 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| AI 连通性测试模型 | `src/features/ai/connection-test.ts` | 按 provider 构造最小测试请求，分类错误并脱敏返回 |
| AI 测试 API | `src/app/api/user/ai-settings/test/route.ts` | 登录用户测试个人 AI 配置或页面草稿 |
| 飞书连通性测试模型 | `src/features/feishu/connection-test.ts` | 构造 App/Base/表/字段/写入权限分步测试结果 |
| 飞书测试 API | `src/app/api/user/feishu-connection/test/route.ts` | 登录用户测试个人飞书配置，写入测试需显式确认 |
| 统一状态组件 | `src/components/IntegrationStatusPanel.tsx` | 展示 AI、飞书、RAG、同步审计状态 |
| 用户中心 | `src/app/account/page.tsx` | 增加 AI/飞书测试按钮和结果面板 |
| 集成中心 | `src/app/integration-center/page.tsx` | 接入统一状态组件 |
| 回归测试 | `tests/pmo-operating-system.test.ts` | 覆盖错误分类、飞书步骤摘要和 UI 入口 |

## 6. 新增 API：测试用户 AI 模型配置

### `POST /api/user/ai-settings/test`

用途：测试当前登录用户的 AI 模型配置是否可用。

认证：需要登录。接口通过当前 session 获取用户，并读取 `user_ai_settings` 中的已保存配置。

请求体：

```json
{
  "provider": "minimax",
  "model": "MiniMax-M3",
  "baseUrl": "https://api.minimax.chat/v1",
  "apiKey": "页面草稿中的密钥，可选",
  "enabled": true
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `provider` | 否 | 支持 `deepseek`、`minimax`、`glm`、`anthropic`、`openai-compatible`；缺省时读取已保存用户配置 |
| `model` | 否 | 要测试的模型名；缺省时读取用户配置或 provider 默认模型 |
| `baseUrl` | 否 | OpenAI 兼容或自定义端点；缺省时按 provider 默认端点 |
| `apiKey` | 否 | 页面草稿密钥；不传时读取已保存用户密钥 |
| `enabled` | 否 | 页面草稿是否启用；为 `false` 时返回未配置 |

成功响应示例：

```json
{
  "request_id": "ai-test-...",
  "test": {
    "status": "ok",
    "provider": "minimax",
    "providerLabel": "MiniMax",
    "model": "MiniMax-M3",
    "endpointHost": "api.minimax.chat",
    "latencyMs": 820,
    "failureCategory": null,
    "detail": "模型连通性测试通过。",
    "nextActions": []
  }
}
```

未配置响应示例：

```json
{
  "request_id": "ai-test-...",
  "test": {
    "status": "not_configured",
    "failureCategory": "missing_key",
    "detail": "缺少可用 API Key。",
    "nextActions": ["到用户中心填写 API Key 后重新测试。"]
  }
}
```

失败分类：

| 分类 | 含义 | 用户侧处理建议 |
|---|---|---|
| `missing_key` | 缺少 API Key | 到用户中心补充密钥 |
| `missing_base_url` | OpenAI 兼容模型缺少 Base URL | 填写服务商端点 |
| `auth_error` | 鉴权失败 | 检查密钥是否正确、是否过期 |
| `rate_limited` | 限流或额度不足 | 稍后重试或更换额度 |
| `provider_error` | 服务商返回 5xx | 稍后重试或切换模型 |
| `http_error` | 其他 HTTP 错误 | 查看状态码和服务商配置 |
| `network_error` | 网络或 DNS 失败 | 检查部署环境网络 |
| `invalid_response` | 返回格式不符合预期 | 检查模型兼容性 |

安全边界：

- 响应中不返回 API Key。
- 错误信息会做密钥形态脱敏。
- 测试请求只发送最小 prompt：要求模型回复 OK。

## 7. 新增 API：测试用户飞书连接

### `POST /api/user/feishu-connection/test`

用途：测试当前登录用户的飞书配置是否可用。

认证：需要登录。接口通过当前 session 获取用户，并读取 `user_feishu_connections` 中的已保存配置。

请求体：

```json
{
  "appId": "cli_xxx",
  "appSecret": "页面草稿中的密钥，可选",
  "baseToken": "bascn...",
  "tableMapping": {
    "project": "tbl...",
    "risk": "tbl...",
    "syncLedger": "tbl..."
  },
  "includeWriteCheck": false
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `appId` | 否 | 页面草稿 App ID；缺省时读取已保存配置 |
| `appSecret` | 否 | 页面草稿 App Secret；缺省时读取已保存配置 |
| `baseToken` | 否 | 页面草稿 Base Token；缺省时读取已保存配置 |
| `tableMapping` | 否 | 页面草稿表映射；缺省时读取已保存配置 |
| `includeWriteCheck` | 否 | 是否执行写入权限测试；默认 `false` |

响应结构：

```json
{
  "request_id": "feishu-test-...",
  "test": {
    "status": "degraded",
    "summary": "部分表字段权限需要修复。",
    "steps": [
      {
        "id": "base-access",
        "label": "Base 访问",
        "status": "ok",
        "detail": "Base 可访问。",
        "nextAction": "继续检查表和字段。"
      }
    ],
    "tables": [
      {
        "tableKey": "project",
        "tableId": "tbl...",
        "status": "ok",
        "fieldCount": 32,
        "missingFields": []
      }
    ],
    "writeCheck": {
      "status": "skipped",
      "detail": "写入测试默认跳过。",
      "nextAction": "点击确认写入测试后，仅向同步流水表写入测试记录。"
    }
  }
}
```

分步检查：

| 步骤 | 说明 |
|---|---|
| `app-credentials` | 检查 App ID / App Secret 是否存在 |
| `base-token` | 检查 Base Token 是否存在 |
| `table-mapping` | 检查项目、风险、任务、里程碑、同步流水等表映射是否填写 |
| `base-access` | 调用飞书 Base 健康检查确认 Base 可访问 |
| `table-fields:*` | 逐表读取字段，确认表 ID 有效且有字段读取权限 |
| `field-mapping:*` | 对关键中文字段做映射/缺失检查 |
| `write-check` | 可选写入测试，只写同步流水测试记录 |

写入测试边界：

- `includeWriteCheck=false`：只读检查，不写任何飞书表。
- `includeWriteCheck=true`：仅写 `syncLedger` 表一条测试记录。
- 测试记录字段为中文字段：`事件ID`、`处理状态`、`错误信息`、`尝试次数`。
- 如果没有配置同步流水表，或字段缺失，写入测试返回失败，不改写业务表。

## 8. 新增组件：统一集成状态面板

### `IntegrationStatusPanel`

文件：`src/components/IntegrationStatusPanel.tsx`

用途：统一展示当前账号实际使用的外部依赖状态，避免用户只在操作失败后才发现缺配置。

组件输入：

```ts
export interface IntegrationStatusItem {
  id: string;
  label: string;
  status: "ok" | "succeeded" | "warning" | "degraded" | "not_configured" | "unknown" | "skipped" | "failed" | "error" | string;
  source: string;
  detail: string;
  nextAction: string;
  href?: string;
}
```

当前接入页面：

| 页面 | 路径 | 接入状态 |
|---|---|---|
| 集成中心 | `/integration-center` | 已接入 |

下一阶段建议接入页面：

| 页面 | 原因 |
|---|---|
| 项目组合看板 | 依赖飞书项目台账、任务、里程碑、合同回款等表 |
| 风险管理 | 依赖飞书风险表、项目台账和 AI 风险分析 |
| PMO 治理中心 | 依赖 Supabase 治理流程、飞书同步和 AI 建议 |
| 报告工厂 | 依赖 AI 模型、RAG 引用和业务数据 |
| 工作台 | 依赖待办、飞书、风险、治理和知识治理数据 |

## 9. 用户中心操作路径

用户入口：

1. 打开系统首页。
2. 点击右上角用户中心。
3. 在 AI 模型配置区域维护 provider、model、baseUrl、apiKey。
4. 点击“测试AI模型”查看模型连通性。
5. 在飞书配置区域维护 App ID、App Secret、Base Token、表 ID 映射。
6. 点击“测试飞书连接”查看只读检查结果。
7. 如果需要确认写入权限，点击“确认写入测试”，二次确认后只向同步流水表写入测试记录。

管理员/PMO 使用建议：

- 不要直接让普通用户复用管理员个人飞书配置。
- 用户注册后应优先配置个人飞书连接，或由管理员确认其可以使用全局只读/写入配置。
- 写入测试失败时，先检查同步流水表是否存在中文字段，再检查飞书应用权限。

## 10. 关键安全与权限边界

- AI API Key 和飞书 App Secret 不在任何响应中回显。
- 测试 API 必须登录后访问，不能匿名调用。
- 飞书写入权限测试默认跳过，只有显式确认后才执行。
- 写入测试不写项目台账、风险表、任务表、合同表、回款表等业务主表。
- V5.3.48 没有放宽任何已有飞书写入边界；通用写入动作仍需在 V5.3.49 纳入统一确认队列。

## 11. 回归验证命令

本版本验证建议：

```bash
npx eslint src/features/ai/connection-test.ts src/app/api/user/ai-settings/test/route.ts src/features/feishu/connection-test.ts src/app/api/user/feishu-connection/test/route.ts src/app/account/page.tsx src/components/IntegrationStatusPanel.tsx src/app/integration-center/page.tsx tests/pmo-operating-system.test.ts
npm test
git diff --check
npm run build
```

已覆盖的测试点：

- AI 服务商错误分类不会暴露密钥。
- 飞书测试步骤能输出配置、字段和写入权限状态。
- 用户中心暴露 AI/飞书测试按钮。
- 集成中心暴露统一集成状态组件。

## 12. 发布要求

因为 V5.3.48 包含用户可见新功能和 UI 更新，必须完成正式发布：

```bash
npm version 5.3.48 --no-git-tag-version
git add .
git commit -m "chore: release ai pmo v5.3.48"
git tag v5.3.48
git push origin main
git push origin v5.3.48
gh release create v5.3.48 --title "AI-PMO System V5.3.48" --notes "<release notes>"
```

发布后检查：

```bash
gh api repos/Allen-cy/AI-PM/commits/HEAD/status
curl -I https://pmai.chunyu2026.qzz.io
curl -s https://pmai.chunyu2026.qzz.io/api/rag/health
```

## 13. 下一阶段任务拆分

### V5.3.49 / P15-T3：通用飞书写入确认队列

目标：所有通用飞书写入动作都必须先生成预览和待确认记录，用户确认后才写入。

建议接口：

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/integrations/feishu/actions/preview` | `POST` | 生成写入预览、目标表、字段变更、影响范围 |
| `/api/integrations/feishu/actions/confirmations` | `GET` | 查询当前用户待确认写入动作 |
| `/api/integrations/feishu/actions/confirmations` | `POST` | 创建待确认写入动作 |
| `/api/integrations/feishu/actions/confirmations/:id/confirm` | `POST` | 用户确认后执行写入 |
| `/api/integrations/feishu/actions/confirmations/:id/cancel` | `POST` | 用户取消写入 |

建议状态：

| 状态 | 含义 |
|---|---|
| `draft` | 已生成预览，尚未提交确认 |
| `pending_confirmation` | 等待用户确认 |
| `confirmed` | 用户已确认，等待执行 |
| `writing` | 正在写入飞书 |
| `succeeded` | 写入成功 |
| `failed` | 写入失败 |
| `cancelled` | 用户取消 |

### V5.3.49 / P15-T2 延伸：全页面状态覆盖

目标：关键业务页打开时就显示集成状态。

优先顺序：

1. 项目组合看板。
2. 风险管理。
3. PMO 治理中心。
4. 报告工厂。
5. PM/PMO 工作台。
6. 知识库与 AI 问答。

每个页面至少展示：

- 当前使用的是个人配置、全局配置还是未配置。
- 是否可继续只读查看。
- 写入动作是否可用。
- 下一步补配置入口。

## 14. 文件同步位置

本交接文档需要同步到两个知识库位置：

| 位置 | 路径 |
|---|---|
| 本地项目知识库 | `/Users/allen/Documents/项目管理体系V2.0-250512/知识库（大厂最佳实践沉淀）/AI PMO系统建设/AI-PMO-V5.3.48-开发接口交接文档-2026-07-06.md` |
| AI-PMO-SYS 知识库 | `/Volumes/创见/My坚果云260122/AI-PMO-SYS/09-产品与集成/AI-PMO系统增强路线图/AI-PMO-V5.3.48-开发接口交接文档-2026-07-06.md` |

优化计划同步位置：

| 位置 | 路径 |
|---|---|
| 本地项目知识库 | `/Users/allen/Documents/项目管理体系V2.0-250512/知识库（大厂最佳实践沉淀）/AI PMO系统建设/AI-PMO后续优化计划-2026-07-03.md` |
| AI-PMO-SYS 知识库 | `/Volumes/创见/My坚果云260122/AI-PMO-SYS/09-产品与集成/AI-PMO系统增强路线图/AI-PMO后续优化计划-2026-07-03.md` |
