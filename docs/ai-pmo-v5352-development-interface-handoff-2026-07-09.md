# AI-PMO V5.3.52 开发接口交接文档

日期：2026-07-09  
当前版本：V5.3.52  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.52 完成 P16 知识生命周期持久化第一版：

- 新增知识生命周期数据库脚本。
- 新增知识生命周期 Supabase 仓储。
- `/api/knowledge/operations` 从只读运行时视图升级为支持持久化状态、同步当前快照、更新影响复核。
- `/knowledge/operations` 页面新增“知识生命周期持久化”面板。
- 未执行 SQL 时，页面继续展示 V5.3.51 的运行时知识运营视图，并明确提示需要执行 SQL。

## 2. 必须执行的数据库脚本

本版本新增 SQL：

```text
supabase-v5352-knowledge-lifecycle.sql
```

执行位置：Supabase SQL Editor。

新增表：

| 表 | 用途 |
|---|---|
| `knowledge_items` | 知识条目主表，保存标题、类型、状态、责任人、适用场景、当前版本 |
| `knowledge_item_versions` | 知识版本表，保存快照版本、内容 hash、变更摘要、来源引用 |
| `knowledge_lifecycle_events` | 生命周期事件表，保存同步、评审、发布、归档、恢复等事件 |
| `knowledge_impact_reviews` | 影响复核表，保存知识变更后需要复核的模块、责任人、截止日期和关闭证据 |
| `knowledge_subscriptions` | 知识订阅表，保存用户或模块对知识域变化的订阅配置 |

执行后可在 `/knowledge/operations` 点击“同步当前快照”，将当前 RAG 快照写入这些表。

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

- `package.json` 版本为 `5.3.52`。
- 最新 tag 包含 `v5.3.52`。
- `main` 至少包含：
  - `7df1839 feat: persist knowledge lifecycle operations`
  - `565c3c6 feat: add knowledge lifecycle operations`

## 4. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| SQL | `supabase-v5352-knowledge-lifecycle.sql` | 新增知识生命周期持久化表 |
| 仓储 | `src/features/knowledge/lifecycle-repository.ts` | Supabase 读写、同步当前快照、影响复核关闭 |
| API | `src/app/api/knowledge/operations/route.ts` | GET/POST/PATCH |
| 页面组件 | `src/components/KnowledgeLifecyclePersistenceClient.tsx` | 持久化状态、同步、关闭复核 |
| 页面 | `src/app/knowledge/operations/page.tsx` | 接入持久化面板 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖 SQL、仓储、API 和页面入口 |

## 5. API：知识生命周期运营

### `GET /api/knowledge/operations`

返回：

- V5.3.51 的运行时知识运营视图；
- `persistence`：持久化状态。

未登录时：

```json
{
  "persistence": {
    "status": "unauthorized",
    "warning": "登录后可查看知识生命周期持久化状态和影响复核记录。"
  }
}
```

SQL 未执行时：

```json
{
  "persistence": {
    "status": "not_configured",
    "migration": "supabase-v5352-knowledge-lifecycle.sql"
  }
}
```

### `POST /api/knowledge/operations`

用途：同步当前 RAG 快照到知识生命周期表。

认证：需要登录。

请求体：

```json
{
  "confirm": true
}
```

边界：

- 必须显式 `confirm=true`。
- 写入 `knowledge_items`、`knowledge_item_versions`、`knowledge_impact_reviews`、`knowledge_lifecycle_events`。
- 写入 `operation_audit_logs`。
- 不修改 RAG 快照原文件。
- 不自动发布、撤回或归档知识。

### `PATCH /api/knowledge/operations`

用途：更新影响复核状态。

认证：需要登录。

请求体：

```json
{
  "reviewId": "uuid",
  "status": "已关闭",
  "closureEvidence": "报告模板引用口径已复核，无需调整。"
}
```

可用状态：

```text
待复核 / 处理中 / 已关闭 / 无需处理
```

边界：

- 关闭或标记无需处理时，必须填写 `closureEvidence`。
- 写入 `knowledge_lifecycle_events`。
- 写入 `operation_audit_logs`。

## 6. 页面：知识生命周期持久化

路由：

```text
/knowledge/operations
```

新增面板：

```text
知识生命周期持久化
```

能力：

- 展示是否已执行 `supabase-v5352-knowledge-lifecycle.sql`；
- 点击“同步当前快照”；
- 展示已持久化知识条目、版本、待处理复核、已关闭复核；
- 对待复核影响项填写复核结论/关闭证据；
- 关闭复核或标记无需处理。

## 7. 当前边界

- V5.3.52 是持久化第一版，不做真实历史版本 diff。
- 不提供完整知识条目编辑表单。
- 不提供发布/归档/恢复审批 UI。
- 不自动把影响复核转成统一行动项或治理流程。
- 所有写入动作都需要用户确认或明确提交。

## 8. 验证命令

针对性验证：

```bash
npm run lint -- src/features/knowledge/lifecycle-repository.ts src/app/api/knowledge/operations/route.ts src/components/KnowledgeLifecyclePersistenceClient.tsx src/app/knowledge/operations/page.tsx tests/pmo-operating-system.test.ts
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-transform-types --test --test-concurrency=1 tests/pmo-operating-system.test.ts
npm run build
```

完整发布前验证：

```bash
npm test
npm run build
git diff --check
```

## 9. 下一阶段 V5.3.53 建议

主题：知识版本 diff、订阅提醒与复核任务转行动项。

建议：

1. 对比上一版 RAG 快照与当前快照，生成真实 diff。
2. 基于 `knowledge_subscriptions` 生成订阅提醒。
3. 将 P0/P1 `knowledge_impact_reviews` 转入统一行动项或治理流程候选。
4. 增加知识状态流转 UI：提交复核、发布新版本、标记过期、归档、恢复。
5. 报告工厂引用知识生命周期事件，生成知识变更周报或审计包。
