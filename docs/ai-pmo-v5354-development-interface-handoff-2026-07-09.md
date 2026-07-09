# AI-PMO V5.3.54 开发接口交接文档

日期：2026-07-09  
当前版本：V5.3.54  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.54 完成 P16 知识运营的“可操作治理闭环第一版”：

- 知识条目支持状态流转：草稿、已评审、已发布、已废弃/过期、已归档。
- 状态流转必须填写复核/审批意见，并写入 `knowledge_lifecycle_events`。
- 模块负责人可以维护知识订阅关系。
- 订阅提醒可生成为发送记录；飞书提醒进入既有飞书待确认队列，不直接外发。
- PMO 可以生成并保存知识变更报告。
- `/knowledge/operations` 新增“知识状态流转、订阅发送与变更报告”操作面板。

## 2. 必须执行的数据库脚本

本版本新增 SQL：

```text
supabase-v5354-knowledge-governance-operations.sql
```

执行位置：Supabase SQL Editor。

前置依赖：

```text
supabase-v5352-knowledge-lifecycle.sql
```

如果要让飞书提醒进入待确认队列，还需要已执行：

```text
supabase-v5349-feishu-action-confirmations.sql
```

新增/调整内容：

| 对象 | 用途 |
|---|---|
| `knowledge_lifecycle_events` check constraint | 扩展事件类型，支持订阅创建、订阅更新、提醒入队、报告生成 |
| `knowledge_subscription_notifications` | 保存站内、飞书、邮件提醒的生成、发送状态和关联知识页 |
| `knowledge_change_reports` | 保存知识变更周报、审计包或运营报告 |

## 3. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| SQL | `supabase-v5354-knowledge-governance-operations.sql` | 新增知识治理运营通知和报告表 |
| 仓储 | `src/features/knowledge/lifecycle-repository.ts` | 状态流转、订阅维护、提醒发送记录、报告生成 |
| API | `src/app/api/knowledge/operations/route.ts` | 新增 `governance` 和多类确认写入动作 |
| 页面组件 | `src/components/KnowledgeGovernanceOperationsClient.tsx` | 知识状态流转、订阅维护、提醒发送、报告保存 |
| 页面 | `src/app/knowledge/operations/page.tsx` | 接入新操作面板 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖 SQL、API、仓储和页面入口 |

## 4. API：知识治理运营

### `GET /api/knowledge/operations`

新增返回字段：

```json
{
  "governance": {
    "status": "succeeded",
    "summary": {
      "managedItems": 27,
      "activeSubscriptions": 1,
      "queuedNotifications": 0,
      "latestReports": 0
    },
    "items": [],
    "subscriptions": [],
    "notifications": [],
    "latestReports": [],
    "changeReportPreview": {}
  }
}
```

未执行 V5.3.54 SQL 时：

```json
{
  "governance": {
    "status": "not_configured",
    "migration": "supabase-v5354-knowledge-governance-operations.sql"
  }
}
```

### `PATCH /api/knowledge/operations`

用途：知识条目状态流转。

请求体：

```json
{
  "target": "knowledge_item",
  "pageId": "KB-0001",
  "status": "published",
  "reviewNote": "已确认适用，发布为当前口径。"
}
```

可用状态：

```text
draft / reviewed / published / deprecated / archived
```

边界：

- 需要登录。
- 必须填写 `reviewNote`。
- 写入 `knowledge_items`。
- 写入 `knowledge_lifecycle_events`。
- 发布时会追加 `knowledge_item_versions` 版本记录。

### `POST /api/knowledge/operations`

所有写入动作均需要：

```json
{
  "confirm": true
}
```

#### 保存订阅

```json
{
  "action": "upsert_subscription",
  "confirm": true,
  "moduleName": "报告工厂",
  "domain": "周报",
  "notificationChannel": "in_app",
  "subscriberName": "PMO"
}
```

#### 更新订阅状态

```json
{
  "action": "update_subscription_status",
  "confirm": true,
  "subscriptionId": "uuid",
  "subscriptionStatus": "paused"
}
```

#### 生成订阅提醒发送记录

```json
{
  "action": "send_subscription_reminders",
  "confirm": true,
  "reminderIds": ["knowledge-subscription-reminder-uuid"],
  "feishuReceiveIdType": "chat_id",
  "feishuReceiveId": "oc_xxx"
}
```

边界：

- 站内/邮件通道当前记录为系统通知发送记录。
- 飞书通道不会直接外发，而是创建 `feishu_action_confirmations` 待确认记录。
- 如果飞书通道未填写接收对象，会保存为草稿或失败状态，页面会提示补配置。

#### 保存知识变更报告

```json
{
  "action": "generate_change_report",
  "confirm": true
}
```

写入：

- `knowledge_change_reports`
- `knowledge_lifecycle_events`
- `operation_audit_logs`

## 5. 页面入口

路由：

```text
/knowledge/operations
```

新增面板：

```text
知识状态流转、订阅发送与变更报告
```

能力：

- 查看可管理知识条目。
- 选择目标状态并填写审批意见后流转。
- 创建订阅关系，启用/暂停/取消订阅。
- 生成订阅提醒发送记录。
- 飞书提醒进入待确认队列。
- 预览并保存知识变更报告。

## 6. 当前边界

- 本版本不直接修改 RAG 快照正文。
- 飞书提醒只进入待确认队列，不直接外发。
- 邮件提醒当前记录为发送记录，未接入真实 SMTP 外发。
- 知识版本已可记录，但 AI 问答、报告工厂、治理流程输出尚未全部绑定具体 `knowledge_item_versions`。
- 模板与最佳实践目录仍需后续持久化、编辑和引用统计。

## 7. 验证命令

```bash
npm run lint -- src/features/knowledge/lifecycle-repository.ts src/app/api/knowledge/operations/route.ts src/components/KnowledgeGovernanceOperationsClient.tsx src/app/knowledge/operations/page.tsx tests/pmo-operating-system.test.ts
npm test
npm run build
git diff --check
```

## 8. 下一阶段 V5.3.55 建议

主题：知识版本引用链和模板/最佳实践目录持久化。

建议：

1. AI 问答返回结果绑定具体 `knowledge_item_versions`，在依据审计中记录版本。
2. 报告工厂生成内容时引用知识版本，报告中展示知识版本来源。
3. 治理流程输出绑定知识版本，形成“知识依据—治理输出—行动项”的审计链。
4. 模板与最佳实践目录持久化，支持编辑、下载统计、引用统计和失效提醒。
