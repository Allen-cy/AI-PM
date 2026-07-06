# AI-PMO V5.3.50 开发接口交接文档

日期：2026-07-07  
当前版本：V5.3.50  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.50 完成 P15-T2 第二版和 P15-T3 体验增强：

- 统一集成状态从集成中心扩展到核心业务页。
- 集成状态展示当前账号实际使用的 AI 模型、飞书业务底座、RAG 知识库和同步审计状态。
- 飞书写入确认队列新增状态筛选、关键词搜索、全选可取消动作和批量取消。
- 本版本不新增数据库脚本。

数据库执行结论：

| 脚本 | 是否本版本新增 | 是否需要执行 | 说明 |
|---|---:|---:|---|
| `supabase-v5349-feishu-action-confirmations.sql` | 否，V5.3.49 新增 | 如果生产库尚未执行，则必须执行 | 创建 `feishu_action_confirmations`，V5.3.50 的确认队列体验依赖该表 |
| V5.3.50 新脚本 | 无 | 不需要 | 本版本只改前端状态覆盖和队列管理体验 |

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

- `package.json` 版本为 `5.3.50`。
- 最新 tag 包含 `v5.3.50`。
- `main` 至少包含以下功能提交：
  - `3814b69 feat: surface integration status on core pages`
  - V5.3.49 的确认队列提交：`afe9e33`、`28d23b5`、`e1eabdd`

## 3. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| 统一状态客户端组件 | `src/components/IntegrationStatusPanelClient.tsx` | 客户端读取集成状态和同步日志，复用 `IntegrationStatusPanel` |
| 项目组合看板 | `src/app/dashboard/page.tsx` | 接入统一集成状态 |
| 风险管理 | `src/app/risk/page.tsx` | 接入统一集成状态 |
| PMO治理中心 | `src/app/pmo/page.tsx` | 接入统一集成状态 |
| 报告工厂 | `src/app/reports/page.tsx` | 接入统一集成状态 |
| 每日工作台 | `src/app/workbench/page.tsx` | 接入统一集成状态 |
| 知识问答 | `src/app/knowledge/page.tsx` | 接入统一集成状态 |
| 集成中心 | `src/app/integration-center/page.tsx` | 确认队列新增状态筛选、搜索、批量取消 |
| 测试 | `tests/pmo-operating-system.test.ts` | 覆盖核心页面状态组件接入和确认队列增强 |
| 文档 | `README.md`、`docs/ai-pmo-follow-up-optimization-plan-2026-07-03.md` | 记录 V5.3.50 范围和下一阶段 |

## 4. 组件接口：`IntegrationStatusPanelClient`

文件：`src/components/IntegrationStatusPanelClient.tsx`

使用方式：

```tsx
import { IntegrationStatusPanelClient } from "@/components/IntegrationStatusPanelClient";

<IntegrationStatusPanelClient moduleName="项目组合看板" />
```

参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `moduleName` | `string` | 当前页面名称，用于加载中或错误提示 |

内部调用：

| API | 用途 |
|---|---|
| `GET /api/operating-system/integrations` | 获取 AI、飞书、RAG 的当前状态和来源 |
| `GET /api/operating-system/sync-logs` | 获取同步审计可用性和最近日志状态 |

状态展示：

| 项 | 来源 |
|---|---|
| AI 模型 | `snapshot.ai_model` |
| 飞书业务底座 | `snapshot.feishu` |
| RAG 知识库 | `snapshot.rag` |
| 同步审计 | `logs.status/logs.detail/logs.migration` |

错误边界：

- API 读取失败时，不阻断页面主功能。
- 组件展示错误卡片，并提供 `/integration-center` 处理入口。
- 缺个人配置时，优先引导到 `/account`。

## 5. 已接入页面

| 页面 | 路由 | `moduleName` |
|---|---|---|
| 项目组合看板 | `/dashboard` | `项目组合看板` |
| 风险管理 | `/risk` | `风险管理` |
| PMO治理中心 | `/pmo` | `PMO治理中心` |
| 报告工厂 | `/reports` | `报告工厂` |
| PM/PMO每日工作台 | `/workbench` | `PM/PMO每日工作台` |
| 知识库与AI问答 | `/knowledge` | `知识库与AI问答` |

继续扩展原则：

1. 业务页如果依赖飞书、AI、RAG 或同步审计，页面头部下方优先接入该组件。
2. 深层子页面如果有写入动作，建议在写入表单旁增加局部状态提示。
3. 不要在各页面重复实现状态卡片逻辑，统一复用 `IntegrationStatusPanelClient`。

## 6. 确认队列体验增强

页面：`/integration-center`

区块：`飞书写入待确认队列`

新增能力：

| 能力 | 说明 |
|---|---|
| 状态筛选 | 支持 `all/pending_confirmation/failed/succeeded/cancelled/writing` |
| 关键词搜索 | 搜索目标摘要、动作类型、来源、申请人、状态、预览字段 |
| 全选可取消 | 只选择当前筛选结果里可取消的动作 |
| 批量取消 | 逐条调用取消接口，完成后刷新队列 |

可取消状态：

```ts
!["succeeded", "writing", "cancelled"].includes(status)
```

单条动作仍保留：

- `确认执行`
- `取消写入`

## 7. 相关 API

### `GET /api/integrations/feishu/actions/confirmations`

认证：需要登录。

查询参数：

| 参数 | 说明 |
|---|---|
| `status` | `pending_confirmation/confirmed/writing/succeeded/failed/cancelled/all` |
| `limit` | V5.3.50 页面使用 `50` |

### `POST /api/integrations/feishu/actions/confirmations/[id]/cancel`

认证：需要登录。

V5.3.50 的批量取消会对选中记录逐条调用该接口。

请求体：

```json
{
  "reason": "用户批量取消飞书写入。"
}
```

边界：

- 管理员可取消全部记录；普通用户只能取消自己的记录。
- 已成功、写入中、已取消记录不可取消。
- 取消会写操作审计和集成同步日志。

## 8. 数据库说明

V5.3.50 不新增 SQL。

如果线上提示：

```text
FEISHU_ACTION_CONFIRMATION_QUEUE_NOT_CONFIGURED
```

或页面提示：

```text
需要执行 SQL：supabase-v5349-feishu-action-confirmations.sql
```

则需要在 Supabase SQL Editor 执行：

```sql
-- 文件：supabase-v5349-feishu-action-confirmations.sql
```

该脚本创建：

| 表 | 用途 |
|---|---|
| `feishu_action_confirmations` | 通用飞书写入待确认队列 |

## 9. 验证命令

针对性验证：

```bash
npm run lint -- src/components/IntegrationStatusPanelClient.tsx src/app/dashboard/page.tsx src/app/risk/page.tsx src/app/pmo/page.tsx src/app/reports/page.tsx src/app/workbench/page.tsx src/app/knowledge/page.tsx src/app/integration-center/page.tsx tests/pmo-operating-system.test.ts
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-transform-types --test --test-concurrency=1 tests/pmo-operating-system.test.ts
```

发布前完整验证：

```bash
npm test
npm run build
git diff --check
```

## 10. 下一阶段建议：V5.3.51

建议进入 P16：知识生命周期与知识变更影响分析。

优先任务：

1. 独立知识条目管理页：草稿、已评审、已发布、过期、归档。
2. 知识条目增加责任人、版本、适用场景、过期时间和关联模块。
3. 知识更新后生成变更摘要和影响模块清单。
4. 对受影响的报告、治理流程、风险复盘资产和模板目录生成复核提醒。
5. PMO 制度、模板、最佳实践形成统一目录，支持筛选、下载、引用和生命周期管理。

## 11. 注意事项

- 不要把任何 API Key、Supabase service role、飞书 App Secret 写入文档或日志。
- 统一状态组件只展示脱敏运行状态，不展示密钥值。
- 飞书写入动作仍必须人工确认；批量取消不是批量确认。
- 如果后续做批量确认，必须增加风险等级复核和二次确认，不能直接全量执行。
