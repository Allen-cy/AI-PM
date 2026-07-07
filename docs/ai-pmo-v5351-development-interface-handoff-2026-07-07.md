# AI-PMO V5.3.51 开发接口交接文档

日期：2026-07-07  
当前版本：V5.3.51  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.51 完成 P16 知识运营第一版：

- 新增知识生命周期运营模型。
- 新增知识运营 API。
- 新增“知识生命周期运营”子页面。
- 从知识问答页增加入口。
- 知识运营当前基于 RAG 快照和模板目录运行时派生，不自动修改知识条目、模板或业务数据。

数据库执行结论：

| 脚本 | 是否本版本新增 | 是否需要执行 | 说明 |
|---|---:|---:|---|
| V5.3.51 新脚本 | 无 | 不需要 | 本版本不新增数据库 |
| `supabase-v5349-feishu-action-confirmations.sql` | 否，V5.3.49 新增 | 如生产库尚未执行则仍需执行 | 只影响飞书写入确认队列，不影响 V5.3.51 知识运营页 |

## 2. 另一台设备继续开发的启动步骤

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

- `package.json` 版本为 `5.3.51`。
- 最新 tag 包含 `v5.3.51`。
- `main` 至少包含：
  - `565c3c6 feat: add knowledge lifecycle operations`
  - `3814b69 feat: surface integration status on core pages`

## 3. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| 知识运营模型 | `src/features/knowledge/operations.ts` | 基于 RAG 快照和模板目录生成生命周期、影响模块、复核动作 |
| 知识运营 API | `src/app/api/knowledge/operations/route.ts` | `GET /api/knowledge/operations` |
| 知识运营页面 | `src/app/knowledge/operations/page.tsx` | 页面标题“知识生命周期运营” |
| 知识问答入口 | `src/app/knowledge/page.tsx` | 新增“知识运营”入口 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖生命周期模型、页面入口和 API |
| 文档 | `README.md`、`docs/ai-pmo-follow-up-optimization-plan-2026-07-03.md` | 更新 V5.3.51 和下一阶段 |

## 4. 模型接口：`buildKnowledgeOperationDashboard`

文件：`src/features/knowledge/operations.ts`

```ts
buildKnowledgeOperationDashboard(now?: Date): KnowledgeOperationDashboard
```

输入：

| 参数 | 类型 | 说明 |
|---|---|---|
| `now` | `Date` | 可选，用于测试或计算有效期；默认当前时间 |

输出核心结构：

| 字段 | 说明 |
|---|---|
| `summary` | 知识条目总量、状态分布、需复核数、影响模块数、关联模板数 |
| `items` | 每个知识条目的责任人、版本、有效期、健康状态、影响模块、关联模板 |
| `impactModules` | 模块级影响分析，包含模块名、影响条目数、优先级和原因 |
| `lifecycleActions` | 候选复核动作，包含责任人、截止日期、优先级、来源知识和输出要求 |
| `templateDirectory` | 模板与知识关联目录 |
| `boundary` | 运行边界说明 |

## 5. API：知识运营

### `GET /api/knowledge/operations`

认证：沿用当前站点登录保护；接口本身不返回密钥或敏感配置。

响应示例：

```json
{
  "indexVersion": "2026-06-22.27",
  "summary": {
    "total": 27,
    "reviewed": 27,
    "needsReview": 0,
    "affectedModules": 9,
    "linkedTemplates": 6
  },
  "impactModules": [
    {
      "module": "报告工厂",
      "documentCount": 10,
      "priority": "P1",
      "reason": "模块引用知识较多，需在知识变更后复核输出口径。"
    }
  ]
}
```

## 6. 页面：知识生命周期运营

路由：

```text
/knowledge/operations
```

入口：

```text
/knowledge 页面右上角“知识运营”
```

页面区块：

| 区块 | 说明 |
|---|---|
| 统计卡 | 知识条目、已评审、已发布、需复核、影响模块 |
| 知识变更影响模块 | 展示知识变化会影响哪些系统模块 |
| 生命周期条目清单 | 展示知识责任人、版本、有效期、健康状态、关联模板 |
| 待复核动作 | 系统生成候选复核动作，暂不自动写入行动项 |
| 模板与知识关联目录 | 展示模板是否已关联知识条目 |

## 7. 当前边界

- 不新增 SQL。
- 不提供知识条目编辑、审批、发布、归档写入。
- 不自动生成统一行动项或治理流程。
- 不自动修改 RAG 快照或模板目录。
- 该版本是“运营视图 + 影响分析 + 候选动作”的第一版。

## 8. 验证命令

针对性验证：

```bash
npm run lint -- src/features/knowledge/operations.ts src/app/api/knowledge/operations/route.ts src/app/knowledge/operations/page.tsx src/app/knowledge/page.tsx tests/pmo-operating-system.test.ts
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-transform-types --test --test-concurrency=1 tests/pmo-operating-system.test.ts
npm run build
```

完整发布前验证：

```bash
npm test
npm run build
git diff --check
```

## 9. 下一阶段 V5.3.52 建议

如果继续推进 P16，需要新增数据库持久化。建议脚本名：

```text
supabase-v5352-knowledge-lifecycle.sql
```

建议新增表：

| 表 | 用途 |
|---|---|
| `knowledge_items` | 知识条目主表，保存标题、类型、状态、责任人、适用场景、当前版本 |
| `knowledge_item_versions` | 知识版本表，保存内容摘要、快照 hash、变更摘要、来源引用 |
| `knowledge_lifecycle_events` | 状态流转和审批事件 |
| `knowledge_impact_reviews` | 受影响模块的复核任务和关闭证据 |
| `knowledge_subscriptions` | 模块或用户订阅知识变更提醒 |

原则：

- 所有状态变更必须有人确认。
- 知识发布/撤回必须写操作审计。
- 影响模块提醒可进入统一行动项或治理流程，但必须由用户确认。
