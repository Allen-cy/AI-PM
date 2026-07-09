# AI-PMO V5.3.58 开发接口交接文档

日期：2026-07-09  
当前版本：V5.3.58  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.55-V5.3.58 已把 P16 知识运营从“状态治理与变更报告”推进到“引用链、模板目录、投递回执、审计包下载”的第一版闭环：

- V5.3.55：AI/RAG/报告输出可绑定具体知识版本。
- V5.3.56：模板/最佳实践目录可持久化维护，并记录下载/引用统计。
- V5.3.57：知识订阅通知可补充投递、阅读、处理、失败等回执。
- V5.3.58：知识变更报告和 PMO 知识运营审计包可下载归档。

新增页面入口仍在：

```text
/knowledge/operations
```

新增面板：

```text
知识版本引用链、模板目录与审计包
```

## 2. 必须执行的数据库脚本

本版本新增统一 SQL：

```text
supabase-v5355-v5358-knowledge-reference-template-audit.sql
```

执行位置：Supabase SQL Editor。

前置依赖：

```text
supabase-v5352-knowledge-lifecycle.sql
supabase-v5354-knowledge-governance-operations.sql
```

如果使用飞书提醒待确认队列，继续依赖：

```text
supabase-v5349-feishu-action-confirmations.sql
```

新增/调整对象：

| 对象 | 用途 |
|---|---|
| `knowledge_lifecycle_events` check constraint | 扩展事件类型：输出引用、模板目录、模板使用、投递回执、审计包生成 |
| `knowledge_output_references` | 记录 AI 问答、RAG 问答、报告、治理、风险、模板输出引用的知识条目版本 |
| `knowledge_template_directory_items` | 保存模板/最佳实践目录、责任人、关联知识页、下载/引用统计 |
| `knowledge_template_usage_events` | 保存模板下载、引用、导入、导出事件 |
| `knowledge_subscription_delivery_receipts` | 保存站内、飞书、邮件通知的投递、阅读、处理、失败回执 |
| `knowledge_audit_packages` | 保存 PMO 知识运营审计包 Markdown 和统计摘要 |

## 3. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| SQL | `supabase-v5355-v5358-knowledge-reference-template-audit.sql` | 新增引用链、模板目录、投递回执和审计包表 |
| 仓储 | `src/features/knowledge/lifecycle-repository.ts` | 新增引用链、模板目录、模板使用、投递回执、审计包读写 |
| API | `src/app/api/knowledge/operations/route.ts` | `GET` 新增 `referenceAudit`；`POST` 新增 5 类确认动作 |
| 下载 API | `src/app/api/knowledge/change-reports/[id]/download/route.ts` | 下载知识变更报告 Markdown |
| 下载 API | `src/app/api/knowledge/audit-packages/[id]/download/route.ts` | 下载 PMO 知识运营审计包 Markdown |
| 知识问答 API | `src/app/api/knowledge/route.ts` | 兼容入口自动尝试写入 AI 问答引用链 |
| RAG API | `src/app/api/rag/query/route.ts` | RAG 问答自动尝试写入知识引用链，并返回 `knowledge_references` |
| 报告 API | `src/app/api/reports/route.ts` | 报告生成自动尝试写入报告工厂知识引用链 |
| 页面组件 | `src/components/KnowledgeReferenceAuditClient.tsx` | 新增引用链、目录、回执、审计包操作面板 |
| 页面组件 | `src/components/KnowledgeGovernanceOperationsClient.tsx` | 历史知识变更报告增加下载入口 |
| 页面 | `src/app/knowledge/operations/page.tsx` | 接入新面板 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖 SQL、仓储、API、页面组件和下载入口 |

## 4. API：知识运营主接口

### `GET /api/knowledge/operations`

新增返回字段：

```json
{
  "referenceAudit": {
    "status": "succeeded",
    "summary": {
      "outputReferences": 0,
      "managedTemplates": 0,
      "templateDownloads": 0,
      "templateReferences": 0,
      "deliveryReceipts": 0,
      "handledDeliveries": 0,
      "auditPackages": 0
    },
    "outputReferences": [],
    "referenceCandidates": [],
    "templateDirectory": [],
    "templateUsageEvents": [],
    "deliveryReceipts": [],
    "recentNotifications": [],
    "auditPackages": [],
    "auditPackagePreview": {}
  }
}
```

未执行 SQL 时：

```json
{
  "referenceAudit": {
    "status": "not_configured",
    "migration": "supabase-v5355-v5358-knowledge-reference-template-audit.sql"
  }
}
```

### `POST /api/knowledge/operations`

所有写入动作均需要：

```json
{
  "confirm": true
}
```

#### 4.1 创建输出引用链

```json
{
  "action": "create_output_reference",
  "confirm": true,
  "outputType": "report",
  "outputId": "report-001",
  "outputTitle": "项目组合月报",
  "moduleName": "报告工厂",
  "pageId": "KB-0001",
  "citationText": "报告引用了项目组合治理口径。",
  "confidence": 0.82
}
```

可用 `outputType`：

```text
ai_answer / report / governance / risk / template / other
```

写入：

- `knowledge_output_references`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

边界：

- 如果知识条目不存在，返回 `not_found`，需要先同步知识生命周期快照。
- 自动写入失败不会阻断知识问答或报告生成。

#### 4.2 保存模板/最佳实践目录

```json
{
  "action": "upsert_template_directory_item",
  "confirm": true,
  "templateKey": "risk-register",
  "title": "风险登记册模板",
  "category": "risk",
  "source": "模板中心",
  "description": "风险识别、分析、应对和跟踪的结构化登记模板。",
  "ownerName": "知识库管理员",
  "linkedKnowledgePageIds": ["KB-0001", "KB-0002"],
  "lifecycleStatus": "active"
}
```

写入：

- `knowledge_template_directory_items`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

#### 4.3 记录模板使用事件

```json
{
  "action": "record_template_usage",
  "confirm": true,
  "templateKey": "risk-register",
  "templateEventType": "download",
  "outputReferenceType": "knowledge_operations",
  "outputId": "template-directory"
}
```

可用 `templateEventType`：

```text
download / reference / import / export
```

写入：

- `knowledge_template_usage_events`
- `knowledge_template_directory_items.download_count/reference_count`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

#### 4.4 记录订阅投递回执

```json
{
  "action": "record_subscription_delivery_receipt",
  "confirm": true,
  "notificationId": "uuid",
  "notificationChannel": "feishu",
  "deliveryStatus": "handled",
  "deliveredTo": "PMO群"
}
```

可用 `deliveryStatus`：

```text
queued / sent / read / handled / failed / cancelled
```

写入：

- `knowledge_subscription_delivery_receipts`
- 必要时更新 `knowledge_subscription_notifications.status`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

边界：

- 该动作只记录回执，不直接外发飞书或邮件。
- 飞书外发仍通过既有待确认队列完成。

#### 4.5 生成 PMO 知识运营审计包

```json
{
  "action": "generate_knowledge_audit_package",
  "confirm": true
}
```

写入：

- `knowledge_audit_packages`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

审计包包含：

- 知识版本引用链
- 模板/最佳实践目录
- 模板下载/引用事件
- 订阅通知投递回执
- 知识变更报告摘要

## 5. 下载接口

### 下载知识变更报告

```text
GET /api/knowledge/change-reports/{id}/download
```

返回：

```text
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment
```

### 下载 PMO 知识运营审计包

```text
GET /api/knowledge/audit-packages/{id}/download
```

返回：

```text
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment
```

## 6. 自动引用链接入点

| 接入点 | 行为 | 失败边界 |
|---|---|---|
| `POST /api/knowledge` | 对返回的引用文档写入 `ai_answer` 引用链 | SQL 未执行、未登录或条目未同步时不阻断问答 |
| `POST /api/rag/query` | 对 RAG citation 写入 `ai_answer` 引用链，并返回 `knowledge_references` | 动态导入失败时跳过，保证测试和问答可用 |
| `POST /api/reports` | 对报告工厂相关知识条目写入 `report` 引用链，并返回 `knowledge_references` | 写入失败不阻断报告生成 |

## 7. 页面操作路径

```text
首页 / 知识库与AI问答 / 知识生命周期运营
```

进入 `/knowledge/operations` 后：

1. 先执行“同步当前快照”，确保 `knowledge_items` 和 `knowledge_item_versions` 有数据。
2. 在“知识版本引用链、模板目录与审计包”面板：
   - 可从候选引用一键带入输出引用表单。
   - 可保存模板/最佳实践目录。
   - 可记录模板下载/引用。
   - 可为通知记录补充投递回执。
   - 可生成并下载 PMO 知识运营审计包。

## 8. 当前边界

- 本版本不编辑 RAG 知识正文，只记录引用链和运营元数据。
- 飞书相关动作仍保持待确认边界，不静默写外部系统。
- 邮件通道当前支持回执记录，不代表已接入真实 SMTP 发送结果。
- 自动引用链已覆盖知识问答、RAG 问答和报告工厂；治理、风险、规划等深层输出可在后续版本继续统一接入。

## 9. 验证命令

```bash
npx eslint src/features/knowledge/lifecycle-repository.ts src/app/api/knowledge/operations/route.ts src/components/KnowledgeReferenceAuditClient.tsx src/app/api/knowledge/route.ts src/app/api/rag/query/route.ts src/app/api/reports/route.ts tests/pmo-operating-system.test.ts
npm test
npm run build
git diff --check
```

本地验证结果：

- ESLint：通过。
- `npm test`：129 个测试通过。
- `npm run build`：通过。
- `git diff --check`：通过。

## 10. 下一阶段建议

优先级建议：

1. P15-T3：飞书待确认队列增加批量确认前风险复核、通知提醒和业务页内联入口。
2. P16：将治理流程输出、风险扫描、规划中心工作流输出继续自动写入 `knowledge_output_references`。
3. P16：模板/最佳实践目录增强为模板内容版本、失效提醒和批量导入。
