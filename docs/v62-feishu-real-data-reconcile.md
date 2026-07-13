# AI-PMO V6.2 飞书真实数据对账接口与运维契约

版本：V6.2.0  
状态：生产迁移、发布与线上首次对账已完成  
数据原则：飞书是业务事实源；Supabase 是稳定项目镜像、状态机、权限、审计和分析源。

## 1. 数据范围

| 领域键 | 飞书中文业务表 | Supabase 镜像 |
|---|---|---|
| `project` | 项目台账 | `projects`、`project_identity_mappings` |
| `milestone` | 里程碑 | `project_milestones` |
| `task` | 任务 | `tasks` |
| `risk` | 风险 | `risks` |
| `contract` | 合同 | `contracts` |
| `payment` | 回款 | `payment_milestones` |
| `cost` | 成本 | `cost_records` |
| `syncLedger` | 同步账本 | `feishu_sync_ledger_mirror` |

飞书字段继续使用中文。服务端把中文字段标准化为稳定内部字段，同时保留原始字段、中文标签、来源记录 ID、源更新时间、行哈希和质量结果。

## 2. 稳定身份与数据空间

- 项目只能通过飞书项目记录 ID 或项目编号关联，禁止按项目名称关联。
- 目标 UUID 由 `org_id + data_class + source_container_id + domain + source_record_id` 确定生成。
- `production`、`sample`、`test`、`diagnostic`、`unclassified` 分区处理；跨空间记录不会进入正式镜像。
- 缺少数据分类、必填字段或稳定项目关联的记录进入 `feishu_reconcile_quarantine`。
- 完整快照中消失的记录设置 `is_source_deleted=true`，保留历史数据与审计链。

## 3. 人工对账接口

### `GET /api/integrations/feishu/reconcile`

用途：读取当前组织和数据空间的最近批次、八类游标、数据新鲜度与隔离质量状态。

查询参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `org_id` | 是 | 当前组织 ID |
| `subject_scope` | 是 | `project/portfolio/organization/customer/contract` |
| `subject_id` | 是 | 当前业务对象 ID |
| `business_role` | 是 | 当前有效业务角色 |
| `data_class` | 是 | 数据空间，默认 `production` |

接口必须有登录会话，且角色分配必须精确覆盖所请求的业务上下文。

### `POST /api/integrations/feishu/reconcile`

用途：由 PMO 或运营角色人工触发八类数据完整对账。该操作读取飞书并写入 Supabase 镜像，不修改飞书原记录。

请求体示例：

```json
{
  "org_id": "<组织ID>",
  "subject_scope": "organization",
  "subject_id": "<组织ID>",
  "business_role": "pmo",
  "data_class": "production",
  "idempotency_key": "manual:<客户端生成的唯一键>",
  "expected_version": 0,
  "source_checkpoint": "manual:<同一请求检查点>",
  "domains": ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"]
}
```

`idempotency_key` 与请求指纹绑定。同一个键、同一载荷返回原批次；同一个键提交不同载荷返回冲突，不覆盖旧结果。

## 4. 定时对账接口

### `GET/POST /api/cron/feishu-reconcile`

- 使用 `Authorization: Bearer <CRON_SECRET>`，通过恒定时间比较校验。
- 使用组织级全局飞书连接，不会静默使用某个个人账号。
- 按上海时区小时生成检查点和幂等键，对全部活跃组织同步 `production` 空间。
- Vercel 每日 08:30（上海时区）触发；人工入口用于临时刷新和故障恢复。

## 5. 统一响应

所有正常响应包含：

```json
{
  "status": "succeeded",
  "request_id": "<请求ID>",
  "context": {
    "org_id": "<组织ID>",
    "subject_scope": "organization",
    "subject_id": "<组织ID>",
    "business_role": "pmo"
  },
  "source": {
    "type": "feishu",
    "label": "飞书多维表格",
    "mirror": "Supabase受治理镜像"
  },
  "data_class": "production",
  "generated_at": "<ISO时间>",
  "warnings": [],
  "data": {}
}
```

响应不会返回 App Secret、Base Token、服务端密钥或完整敏感配置。

## 6. 数据库对象

新增：

- `feishu_reconcile_batches`：批次、幂等键、状态和汇总计数。
- `feishu_reconcile_items`：每条源记录的新增、更新、未变化、软删除、隔离或失败动作。
- `feishu_reconcile_quarantine`：数据质量与稳定关联治理队列。
- `feishu_reconcile_cursors`：八类数据的检查点、新鲜度与源端计数。
- `project_milestones`：里程碑真实镜像。
- `feishu_sync_ledger_mirror`：飞书同步账本镜像。

事务函数：

- `begin_feishu_reconcile_batch_tx`
- `apply_feishu_reconcile_domain_tx`
- `finalize_feishu_reconcile_batch_tx`
- `fail_feishu_reconcile_batch_tx`

迁移：

1. `20260713210000_v62_feishu_real_data_foundation.sql`
2. `20260713213000_v62_reconcile_trigger_security_fix.sql`

## 7. 安全、失败与恢复

- 新增表全部启用 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 权限，只允许 `service_role` 服务端访问。
- 事务函数同样只授予 `service_role` 执行权。
- 单表最大读取 20,000 条、最大 200 页，分页游标缺失时关闭失败。
- 项目表总是先同步，子表再使用稳定项目映射关联。
- 失败批次写入同步日志；重试使用新的源检查点和幂等键。
- 隔离记录保留原始字段与质量问题，后续同步通过门禁后自动标记为已解决。
- 回滚只切换旧读取路径；不删除已同步数据、新表或审计记录。

## 8. 发布验收清单

- [x] 两份 migration 已进入 Supabase 迁移历史。
- [x] 新增 6 张表全部启用 RLS，客户端授权数为 0。
- [x] 数据库安全审计违规数为 0。
- [x] 事务回滚验收：项目、任务、稳定映射各 1 条，无重复。
- [x] 跨数据空间样例记录进入隔离队列。
- [x] 第二次空快照只做软删除标记，原行仍保留。
- [x] V6.2.0 线上部署后执行八类真实数据首次对账。
- [x] 重复执行同一幂等键，确认只存在 1 个批次，记录数不增加。
- [x] 数据与集成中心显示来源、更新时间、质量状态和八类记录数。

## 9. 生产验收结果（2026-07-13）

- 线上版本：`V6.2.0 · e845caa`。
- 首次人工对账：批次状态 `completed_with_warnings`，读取 237 条，隔离 237 条，新增、更新、软删除和失败均为 0。
- 幂等复验：同一幂等键连续请求两次均返回成功，数据库中该键对应批次数为 1。
- 八领域游标：`project`、`milestone`、`task`、`risk`、`contract`、`payment`、`cost`、`syncLedger` 均已记录成功时间。
- 数据质量：237 条记录的当前隔离原因均为 `DATA_CLASS_MISMATCH`。其中项目 60 条、风险 56 条、合同 56 条、回款 62 条、同步账本 3 条；任务、里程碑、成本表当次源记录为 0。
- 安全审计：全量数据库安全违规为 0。验收使用的临时账号、会话和本地临时文件均已清理。

> 这个结果说明对账底座、隔离边界和幂等性已通过，不代表 237 条记录已成为正式生产数据。只有在飞书补齐中文字段“数据分类”并明确标记为 `production` 后，后续对账才会将通过质量门禁的记录写入正式镜像。
