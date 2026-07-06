# AI-PMO V5.3.49 开发接口交接文档

日期：2026-07-06  
当前版本：V5.3.49  
当前仓库：`/Users/allen/Documents/项目管理体系V2.0-250512/.worktrees/ai-pmo-v5-feishu-rag`  
GitHub：`https://github.com/Allen-cy/AI-PM`  
生产域名：`https://pmai.chunyu2026.qzz.io`

## 1. 当前交接结论

V5.3.49 完成 P15-T3 第一版：通用飞书写入动作统一进入待确认队列。

关键变化：

- `POST /api/integrations/feishu/actions` 不再直接调用飞书 OpenAPI。
- 旧 token 接口现在只做鉴权、参数校验、动作预览和入队，返回 `confirmation_required`。
- 新增 `feishu_action_confirmations` 队列表，保存动作载荷、预览、风险等级、状态和执行结果。
- 登录用户可通过集成中心查看待确认动作，确认执行或取消。
- 确认执行时使用当前登录用户的有效飞书配置，先写同步流水，再执行飞书消息/任务/日程/文档动作。
- 执行结果进入操作审计和集成同步日志。

本版本新增 SQL：`supabase-v5349-feishu-action-confirmations.sql`。

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

- `package.json` 版本为 `5.3.49`。
- 最新 tag 包含 `v5.3.49`。
- `main` 至少包含以下功能提交：
  - `afe9e33 feat: add Feishu action confirmation queue model`
  - `28d23b5 feat: route generic Feishu actions through confirmations`
  - `e1eabdd feat: expose Feishu action confirmations in integration center`

## 3. 新增数据库脚本

必须在生产 Supabase SQL Editor 执行：

```sql
-- 文件：supabase-v5349-feishu-action-confirmations.sql
```

新增表：

| 表 | 说明 |
|---|---|
| `feishu_action_confirmations` | 通用飞书写入待确认队列 |

关键字段：

| 字段 | 说明 |
|---|---|
| `requester_id/requester_name/requester_email` | 发起用户；API token 发起时可为空 |
| `source/source_page` | 来源系统或页面 |
| `action_type` | `message/task/calendar/document` |
| `idempotency_key` | 飞书原生幂等键 |
| `target_summary` | 用户可读目标摘要 |
| `risk_level` | `low/medium/high` |
| `status` | `pending_confirmation/confirmed/writing/succeeded/failed/cancelled` |
| `payload` | 原始动作参数，不包含密钥 |
| `preview` | 用户确认前看到的字段、目标和风险提示 |
| `resource` | 执行成功后的飞书资源信息 |
| `error_code/cancel_reason` | 失败或取消原因 |

执行顺序：

1. 先确认 V5.3.47 之前脚本已执行，尤其是：
   - `supabase-v522-user-config.sql`
   - `supabase-v527-integration-sync-logs.sql`
   - `supabase-v534-enterprise-security.sql`
   - `supabase-v5347-knowledge-governance-evidence-chain.sql`
2. 再执行 `supabase-v5349-feishu-action-confirmations.sql`。

## 4. 新增/变更文件

| 模块 | 文件 | 说明 |
|---|---|---|
| 动作载荷模型 | `src/features/feishu/action-payload.ts` | 校验通用飞书动作，生成预览，执行动作 |
| 确认队列仓储 | `src/features/feishu/action-confirmations.ts` | 创建、查询、状态流转、权限判断 |
| SQL | `supabase-v5349-feishu-action-confirmations.sql` | 创建确认队列表和索引 |
| 旧 token 接口 | `src/app/api/integrations/feishu/actions/route.ts` | 从直写改为入队 |
| 队列列表/创建 | `src/app/api/integrations/feishu/actions/confirmations/route.ts` | 登录用户查看和创建确认记录 |
| 确认执行 | `src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts` | 显式确认后执行飞书写入 |
| 取消写入 | `src/app/api/integrations/feishu/actions/confirmations/[id]/cancel/route.ts` | 取消未执行动作 |
| 集成中心 | `src/app/integration-center/page.tsx` | 新增飞书写入待确认队列 |

## 5. API：旧通用动作入口改为入队

### `POST /api/integrations/feishu/actions`

认证：仍使用 `Authorization: Bearer <AI_PM_INTEGRATION_API_KEY>`。

行为变化：

- V5.3.48 及以前：鉴权后直接执行飞书写入。
- V5.3.49 开始：鉴权后只创建待确认记录，返回 `confirmation_required`。

请求示例：

```json
{
  "type": "message",
  "idempotency_key": "weekly-risk-2026-07-06",
  "receive_id_type": "chat_id",
  "receive_id": "oc_xxx",
  "text": "项目周报已生成，请确认风险和回款阻塞。",
  "source_page": "/reports"
}
```

响应示例：

```json
{
  "status": "confirmation_required",
  "confirmation_required": true,
  "confirmation": {
    "id": "uuid",
    "actionType": "message",
    "targetSummary": "向群聊 oc_xxx 发送消息",
    "riskLevel": "medium",
    "status": "pending_confirmation"
  },
  "boundary": "通用飞书写入动作已进入待确认队列；系统不会通过 token 接口直接写飞书。"
}
```

未执行 SQL 时：

```json
{
  "status": "not_configured",
  "code": "FEISHU_ACTION_CONFIRMATION_QUEUE_NOT_CONFIGURED",
  "migration": "supabase-v5349-feishu-action-confirmations.sql"
}
```

## 6. API：确认队列列表与创建

### `GET /api/integrations/feishu/actions/confirmations`

认证：需要登录。

查询参数：

| 参数 | 说明 |
|---|---|
| `status` | `pending_confirmation/confirmed/writing/succeeded/failed/cancelled/all` |
| `limit` | 默认 50，最大 100 |

权限：

- 管理员可查看全部确认记录。
- 普通用户只查看自己创建的确认记录。

### `POST /api/integrations/feishu/actions/confirmations`

认证：需要登录。

用途：由页面或业务模块以当前用户身份创建确认记录。

请求示例：

```json
{
  "source": "integration_center",
  "sourcePage": "/integration-center",
  "payload": {
    "type": "task",
    "idempotency_key": "risk-action-001",
    "summary": "处理项目风险",
    "description": "完成缓解措施并更新风险台账",
    "assignee_ids": ["ou_xxx"],
    "due_at": 1783000000000
  }
}
```

## 7. API：确认执行

### `POST /api/integrations/feishu/actions/confirmations/[id]/confirm`

认证：需要登录。

请求体：

```json
{
  "confirm": true
}
```

执行边界：

- 必须显式传入 `confirm=true`。
- 管理员可确认全部记录；普通用户只能确认自己的记录。
- 当前状态为 `succeeded/cancelled/writing` 时不允许重复确认。
- 执行时使用当前登录用户的有效飞书配置：优先个人飞书，缺失时按现有规则回退全局配置。
- 必须配置同步流水表，否则不执行。
- 执行成功后写入：
  - 飞书同步流水；
  - `operation_audit_logs`；
  - `integration_sync_logs`；
  - `feishu_action_confirmations.resource`。

## 8. API：取消写入

### `POST /api/integrations/feishu/actions/confirmations/[id]/cancel`

认证：需要登录。

请求体：

```json
{
  "reason": "信息需重新确认，暂不外发。"
}
```

边界：

- 管理员可取消全部记录；普通用户只能取消自己的记录。
- 已执行成功或正在执行的记录不可取消。
- 取消会写入操作审计和集成同步日志。

## 9. 页面入口

页面：`/integration-center`

新增区块：`飞书写入待确认队列`

功能：

- 查看最近 20 条确认记录；
- 展示动作摘要、来源、申请人、创建时间、风险等级、状态；
- 展示预览字段和风险提示；
- 失败时展示 `errorCode`；
- 取消时展示 `cancelReason`；
- 支持单条“确认执行”和“取消写入”。

## 10. 关键安全边界

- 旧 token 接口不再直写飞书。
- 队列 payload 不保存飞书 App Secret、API Key、用户密码。
- 确认执行必须登录，且按当前用户权限判断。
- 确认执行使用当前用户有效飞书配置，不默认冒用管理员个人飞书。
- 写入前必须有同步流水表，避免无审计写入。
- 普通用户不能确认/取消他人的确认记录。

## 11. 回归验证命令

```bash
npx eslint src/features/feishu/action-payload.ts src/features/feishu/action-confirmations.ts src/app/api/integrations/feishu/actions/route.ts src/app/api/integrations/feishu/actions/confirmations/route.ts 'src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts' 'src/app/api/integrations/feishu/actions/confirmations/[id]/cancel/route.ts' src/app/integration-center/page.tsx tests/feishu-actions-route.test.ts tests/pmo-operating-system.test.ts
npm test
git diff --check
npm run build
```

已覆盖：

- 旧 token 接口鉴权失败不调用 OpenAPI；
- 参数不合法时不创建记录；
- token 接口改为确认队列，未执行 SQL 时返回明确 migration；
- 动作预览必须 `confirmationRequired=true`；
- 只有申请人或管理员能管理确认记录；
- 新增 API 和集成中心入口可被源码测试发现。

## 12. 下一阶段建议

V5.3.50 建议优先做：

1. 把 `IntegrationStatusPanel` 覆盖到项目组合看板、风险管理、PMO 治理中心、报告工厂、工作台、知识库问答。
2. 确认队列增加筛选、搜索、风险等级排序、批量取消、批量确认前检查。
3. 业务页内联创建确认记录，让迁移整改、风险治理、知识治理提醒和治理流程的写入动作统一进入同一个队列。

## 13. 文件同步位置

| 位置 | 路径 |
|---|---|
| 本地项目知识库 | `/Users/allen/Documents/项目管理体系V2.0-250512/知识库（大厂最佳实践沉淀）/AI PMO系统建设/AI-PMO-V5.3.49-开发接口交接文档-2026-07-06.md` |
| AI-PMO-SYS 知识库 | `/Volumes/创见/My坚果云260122/AI-PMO-SYS/09-产品与集成/AI-PMO系统增强路线图/AI-PMO-V5.3.49-开发接口交接文档-2026-07-06.md` |
