# AI-PMO V5.3.59 开发接口交接文档

版本：V5.3.59  
日期：2026-07-09  
主题：飞书确认队列批量确认前风险复核、通知提醒和业务页内联提醒入口

## 1. 本版本结论

V5.3.59 完成 P15-T3 的生产批量处理增强：

- 飞书写入队列不再只是“单条确认/取消”，现在每条记录都有确认前风险复核。
- 集成中心支持批量确认前复核和批量确认保护。
- 高风险、逾期或失败重试记录必须传入 `riskAcknowledged=true` 才能执行。
- 核心业务页新增“飞书写入确认提醒”入口，使用者不用进入集成中心也能看到待处理队列。
- 本版本不新增 SQL，继续依赖 V5.3.49 的 `feishu_action_confirmations`。

## 2. 数据库要求

本版本不新增数据库脚本。

继续依赖：

```text
supabase-v5349-feishu-action-confirmations.sql
```

如果生产环境未执行该脚本，确认队列会返回：

```json
{
  "status": "not_configured",
  "migration": "supabase-v5349-feishu-action-confirmations.sql"
}
```

## 3. 新增和变更文件

| 类型 | 文件 | 说明 |
|---|---|---|
| 风险复核模型 | `src/features/feishu/action-confirmations.ts` | 新增单条风险复核、批量复核、队列摘要和提醒草稿 |
| 队列列表 API | `src/app/api/integrations/feishu/actions/confirmations/route.ts` | GET 返回 `riskReview` 和 `summary`；POST 返回新建记录的 `riskReview` |
| 批量复核 API | `src/app/api/integrations/feishu/actions/confirmations/batch-review/route.ts` | 新增只读批量确认前风险复核 |
| 确认执行 API | `src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts` | 高风险/逾期/失败重试要求 `riskAcknowledged=true` |
| 集成中心 | `src/app/integration-center/page.tsx` | 新增队列统计、提醒草稿、风险复核清单、批量确认 |
| 业务页内联组件 | `src/components/FeishuConfirmationInlinePanelClient.tsx` | 新增核心业务页的待确认提醒入口 |
| 业务页接入 | `src/app/dashboard/page.tsx`、`src/app/risk/page.tsx`、`src/app/pmo/page.tsx`、`src/app/reports/page.tsx`、`src/app/workbench/page.tsx`、`src/app/knowledge/page.tsx` | 接入内联提醒组件 |
| 回归测试 | `tests/pmo-operating-system.test.ts` | 覆盖风险复核、批量复核、提醒入口和页面接入 |

## 4. API：确认队列列表

### `GET /api/integrations/feishu/actions/confirmations`

查询参数：

| 参数 | 说明 |
|---|---|
| `status` | `all`、`pending_confirmation`、`failed`、`succeeded`、`cancelled`、`writing` |
| `limit` | 1-100，默认 50 |

新增返回字段：

```json
{
  "status": "succeeded",
  "confirmations": [
    {
      "id": "uuid",
      "targetSummary": "创建任务：处理项目风险",
      "status": "pending_confirmation",
      "riskReview": {
        "riskLevel": "high",
        "baseRiskLevel": "medium",
        "canConfirm": true,
        "canCancel": true,
        "requiresSecondConfirm": true,
        "ageDays": 9,
        "blockingIssues": [],
        "warnings": ["消息目标为群聊，发送后会被多人看见，需二次确认内容和接收群。"],
        "checklist": [
          {
            "id": "status",
            "label": "状态可执行",
            "status": "pass",
            "detail": "当前状态为 pending_confirmation，允许进入确认前复核。"
          }
        ],
        "suggestedAction": "review"
      }
    }
  ],
  "summary": {
    "basis": "current_page",
    "totalCount": 20,
    "pendingCount": 6,
    "failedCount": 1,
    "highRiskPendingCount": 2,
    "overduePendingCount": 1,
    "requiresSecondConfirmCount": 3,
    "reminderDrafts": [
      {
        "id": "uuid",
        "priority": "P0",
        "title": "飞书写入待确认：创建任务：处理项目风险",
        "detail": "该动作需要人工确认后才会执行。",
        "nextAction": "请在集成中心完成风险复核后确认执行，或取消写入。",
        "targetSummary": "创建任务：处理项目风险"
      }
    ]
  }
}
```

## 5. API：批量确认前风险复核

### `POST /api/integrations/feishu/actions/confirmations/batch-review`

请求：

```json
{
  "ids": ["confirmation-id-1", "confirmation-id-2"]
}
```

返回：

```json
{
  "status": "succeeded",
  "batchReview": {
    "selectedCount": 2,
    "confirmableCount": 1,
    "blockedCount": 1,
    "highRiskCount": 1,
    "requiresSecondConfirmCount": 1,
    "confirmableIds": ["confirmation-id-1"],
    "blockedIds": ["confirmation-id-2"],
    "warnings": ["消息目标为群聊，发送后会被多人看见，需二次确认内容和接收群。"],
    "blockingIssues": ["当前状态为 succeeded，不能批量确认。"],
    "decisionText": "本次选择 2 条，允许确认 1 条，阻断 1 条，高风险 1 条，需要二次确认 1 条。"
  },
  "boundary": "该接口只做批量确认前风险复核，不执行飞书写入；真正写入仍需要逐条或批量显式确认。"
}
```

权限边界：

- 未登录返回 401。
- 非申请人且非管理员的记录不会泄露详情，会进入 `inaccessibleIds`。
- SQL 未执行返回 503 和 migration。

## 6. API：确认执行二次确认

### `POST /api/integrations/feishu/actions/confirmations/[id]/confirm`

普通记录请求：

```json
{
  "confirm": true
}
```

高风险、逾期、失败重试或复核提示较多的记录请求：

```json
{
  "confirm": true,
  "riskAcknowledged": true
}
```

如果缺少风险确认，会返回：

```json
{
  "status": "risk_acknowledgement_required",
  "warning": "该飞书写入包含高风险、逾期或失败重试提示，执行前必须完成风险复核并传入 riskAcknowledged=true。",
  "riskReview": {
    "requiresSecondConfirm": true
  }
}
```

## 7. 前端入口

### 集成中心

路径：

```text
/integration-center
```

新增能力：

- 队列统计：待确认、失败可重试、高风险、逾期、二次确认。
- 待处理提醒草稿：按 P0/P1/P2 展示需要优先处理的写入。
- 风险复核清单：状态、权限、来源、时效、重试、对象、责任人、截止时间等检查。
- 批量确认：先调用 `/batch-review`，只确认可执行记录；阻断项不执行。

### 业务页内联入口

组件：

```tsx
<FeishuConfirmationInlinePanelClient moduleName="项目组合看板" />
```

已覆盖页面：

- `/dashboard`
- `/risk`
- `/pmo`
- `/reports`
- `/workbench`
- `/knowledge`

## 8. 风险判断规则

当前规则为确定性规则，不依赖大模型：

| 规则 | 影响 |
|---|---|
| 状态不是 `pending_confirmation` 或 `failed` | 阻断确认 |
| 当前用户不是申请人且不是管理员 | 阻断确认 |
| 来源是 API token 或系统入队且无明确申请人 | 升高到高风险 |
| 等待超过 7 天 | 要求二次确认 |
| 等待超过 14 天 | 升高到高风险 |
| 状态为 `failed` | 标记失败重试提示 |
| 群聊消息 | 升高到高风险 |
| 长消息 | 增加敏感信息复核提示 |
| 飞书任务无责任人或无截止时间 | 增加管理闭环提示 |
| 大范围日程参与人 | 升高到高风险 |
| 飞书文档未指定父目录 | 增加位置复核提示 |

## 9. 验证记录

本地已执行：

```bash
npx eslint src/features/feishu/action-confirmations.ts src/app/api/integrations/feishu/actions/confirmations/route.ts 'src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts' src/app/api/integrations/feishu/actions/confirmations/batch-review/route.ts src/app/integration-center/page.tsx src/components/FeishuConfirmationInlinePanelClient.tsx src/app/dashboard/page.tsx src/app/risk/page.tsx src/app/workbench/page.tsx src/app/reports/page.tsx src/app/knowledge/page.tsx src/app/pmo/page.tsx tests/pmo-operating-system.test.ts
npm test
npm run build
```

结果：

- ESLint：通过。
- 测试：130 个用例通过。
- 生产构建：通过。

## 10. 下一阶段建议

1. P16 深层接入：治理、风险、规划深层输出自动写入 `knowledge_output_references`。
2. P16 运营增强：模板内容版本、失效提醒、批量导入。
3. P15-T3 延伸：业务写入表单旁的一键发起确认记录，以及飞书确认执行结果与通知投递回执自动联动。
