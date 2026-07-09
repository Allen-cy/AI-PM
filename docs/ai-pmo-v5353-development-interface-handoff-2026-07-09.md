# AI-PMO V5.3.53 开发接口交接文档

日期：2026-07-09  
当前版本：V5.3.53  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.53 完成 P16 知识运营的“变更控制第一版”：

- 基于 V5.3.52 的知识生命周期持久化表，对比当前 RAG 快照和上一持久化版本。
- 生成知识版本差异：新增、已更新、已删除、无变化。
- 基于 `knowledge_subscriptions` 生成订阅提醒草稿。
- 将 P0/P1 `knowledge_impact_reviews` 转为统一行动项候选，并支持用户确认后写入 `unified_action_items`。
- `/knowledge/operations` 新增“知识版本差异与订阅提醒”面板。

## 2. 数据库依赖

本版本不新增 SQL。

必须已执行：

```text
supabase-v5352-knowledge-lifecycle.sql
```

用于：

- `knowledge_items`
- `knowledge_item_versions`
- `knowledge_lifecycle_events`
- `knowledge_impact_reviews`
- `knowledge_subscriptions`

如果要使用“生成统一行动项”，还必须已执行既有脚本：

```text
supabase-v530-issue-change-action-chain.sql
```

用于：

- `unified_action_items`

未执行时，接口会返回 `not_configured`，页面会提示对应 SQL 文件名。

## 3. 另一台设备继续开发的启动步骤

```bash
git clone https://github.com/Allen-cy/AI-PM.git
cd AI-PM
npm install
npm test
npm run build
```

确认版本：

```bash
git status --short
git log --oneline -8
git tag --list 'v5.3.*' | tail
node -p "require('./package.json').version"
```

期望状态：

- `package.json` 版本为 `5.3.53`。
- 最新 tag 包含 `v5.3.53`。
- `main` 至少包含：
  - `cf144ff feat: add knowledge change control workflow`

## 4. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| 仓储 | `src/features/knowledge/lifecycle-repository.ts` | 新增知识 diff、订阅提醒草稿、P0/P1 影响复核转统一行动项 |
| API | `src/app/api/knowledge/operations/route.ts` | `GET` 返回 `changeControl`；`POST action=create_action_items` 生成统一行动项 |
| 页面组件 | `src/components/KnowledgeLifecyclePersistenceClient.tsx` | 新增“知识版本差异与订阅提醒”面板和生成行动项按钮 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖新增仓储、API、页面关键入口 |
| 文档 | `README.md` | 增加 V5.3.53 发布说明 |
| 文档 | `docs/ai-pmo-follow-up-optimization-plan-2026-07-03.md` | 标记 V5.3.53 已完成，调整下一阶段 V5.3.54 |

## 5. API：知识生命周期运营

### `GET /api/knowledge/operations`

认证：匿名可看运行时知识运营视图；登录后返回持久化和变更控制状态。

新增返回字段：

```json
{
  "changeControl": {
    "status": "succeeded",
    "summary": {
      "comparedItems": 27,
      "additions": 0,
      "modifications": 0,
      "removals": 0,
      "unchanged": 27,
      "activeSubscriptions": 0,
      "reminderDrafts": 0,
      "p0p1ActionCandidates": 0
    },
    "versionDiffs": [],
    "subscriptionReminders": [],
    "actionCandidates": []
  }
}
```

`changeControl.versionDiffs[]` 结构：

| 字段 | 说明 |
|---|---|
| `pageId` | RAG 知识页 ID |
| `title` | 知识标题 |
| `changeType` | `新增` / `已更新` / `已删除` / `无变化` |
| `priority` | `P0` / `P1` / `P2` |
| `ownerName` | 责任人 |
| `previousVersionLabel` | 上一持久化版本 |
| `currentVersionLabel` | 当前快照版本 |
| `impactedModules` | 受影响系统模块 |
| `linkedTemplates` | 关联模板 |
| `dueDate` | 建议复核截止日期 |
| `changeSummary` | 变更摘要 |
| `reviewOutput` | 复核输出要求 |

`changeControl.subscriptionReminders[]` 结构：

| 字段 | 说明 |
|---|---|
| `subscriberName` | 订阅人 |
| `moduleName` | 订阅模块 |
| `domain` | 订阅领域 |
| `notificationChannel` | `in_app` / `feishu` / `email` |
| `priority` | 提醒优先级 |
| `relatedPageIds` | 相关知识页 |
| `message` | 提醒内容 |
| `actionRequired` | 需要人工处理的动作 |

`changeControl.actionCandidates[]` 结构：

| 字段 | 说明 |
|---|---|
| `reviewId` | 知识影响复核 ID |
| `sourceId` | 写入统一行动项时使用的来源 ID |
| `pageId` | 知识页 ID |
| `title` | 行动项标题 |
| `moduleName` | 受影响模块 |
| `priority` | `P0` / `P1` |
| `ownerName` | 行动项责任人 |
| `dueDate` | 截止日期 |
| `reviewOutput` | 复核输出 |

### `POST /api/knowledge/operations`

原能力保留：不传 `action` 或 `action` 不是 `create_action_items` 时，继续执行“同步当前快照”。

#### 同步当前快照

```json
{
  "confirm": true
}
```

#### 生成统一行动项

```json
{
  "action": "create_action_items",
  "confirm": true,
  "reviewIds": ["uuid"]
}
```

边界：

- 必须登录。
- 必须 `confirm=true`。
- 只处理 P0/P1 且状态为 `待复核` 或 `处理中` 的知识影响复核。
- 写入 `unified_action_items` 时使用 `source_type=governance`，`source_id=knowledge-impact-review:{reviewId}`。
- 已存在相同 `source_id` 的行动项会被跳过。
- 写入 `operation_audit_logs`。
- 写入 `knowledge_lifecycle_events`，记录“复核已转行动项”。
- 不自动发送飞书或邮件。
- 不自动关闭知识影响复核。

### `PATCH /api/knowledge/operations`

V5.3.52 能力保留：更新影响复核状态。

关闭或标记无需处理时必须填写 `closureEvidence`。

## 6. 页面：知识版本差异与订阅提醒

路由：

```text
/knowledge/operations
```

新增面板：

```text
知识版本差异与订阅提醒
```

能力：

- 展示对比条目、新增、更新、撤出、订阅提醒、行动候选数量。
- 展示版本差异清单。
- 展示订阅提醒草稿。
- 展示行动项候选。
- 点击“生成统一行动项”后，二次确认并调用 `POST action=create_action_items`。

## 7. 当前边界

- 版本 diff 以当前 RAG 快照和 Supabase 中上一持久化版本为基准。
- 当前 diff 识别新增、已更新、已删除、无变化；状态变更、引用变化暂并入“已更新”。
- 订阅提醒当前只是草稿，不自动发送。
- 知识条目编辑、发布、归档、恢复审批 UI 尚未完成。
- 统一行动项生成后，需要在统一行动项/治理闭环中继续跟踪关闭。

## 8. 验证命令

针对性验证：

```bash
npm run lint -- src/features/knowledge/lifecycle-repository.ts src/app/api/knowledge/operations/route.ts src/components/KnowledgeLifecyclePersistenceClient.tsx tests/pmo-operating-system.test.ts
npm test
npm run build
git diff --check
```

发布前还需要做一次密钥扫描，范围包括 `README.md`、`docs`、`src`、`tests`、`package*.json` 和 `supabase-v*.sql`。扫描目标是常见 API Key、服务端密钥、明文环境变量和值形式凭据；无输出表示未发现常见密钥模式。不要把真实密钥或完整扫描表达式写入交接文档，避免后续自匹配误报。

## 9. 下一阶段 V5.3.54 建议

主题：知识状态流转审批、订阅发送和知识变更报告。

建议：

1. 知识条目状态流转 UI：提交复核、发布新版本、标记过期、归档、恢复。
2. 订阅关系维护入口：按模块、领域、负责人、通道配置订阅。
3. 订阅提醒人工确认发送：站内、飞书、邮件。
4. 报告工厂读取 `knowledge_lifecycle_events`，生成知识变更周报或审计包。
5. AI 问答、报告工厂、治理流程输出绑定具体知识版本。
