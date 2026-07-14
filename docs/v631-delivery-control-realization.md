# AI-PMO V6.3.1 交付控制真实化接口及运维契约

版本：V6.3.1  
迁移：`supabase/migrations/20260714200000_v631_delivery_control_realization.sql`

## 1. 目标与边界

V6.3.1 将 WBS、关键路径、挣值和资源容量从页面示例/临时输入改造成当前项目范围内的正式业务链：

- WBS由真实用户录入或AI辅助生成候选项，保存后形成版本；提交、审批、退回、驳回和替代旧版均为人工动作。
- CPM只读取同一项目已持久化WBS的工作包、工期和前置关系，确定性算法先计算，AI只解释结果。
- EVM只读取已批准成本基准、已批准WBS、工作包实绩和成本台账；AI不能修改BAC、PV、EV、AC及派生指标。
- 资源容量按已授权项目成员形成8–12周计划；超配自动形成责任人、期限、状态和证据复核动作。

正式路径不得使用`TEST_*`、预置项目、随机人员或`localStorage`作为权威存储。没有业务前置数据时必须明确阻断，不生成“看起来完整”的模拟结果。

## 2. 统一数据契约

所有写接口必须携带：

```json
{
  "project_id": "稳定项目UUID",
  "business_role": "pm|operations|pmo|sponsor|business_owner|finance|quality",
  "data_class": "production|sample|test|diagnostic|unclassified",
  "idempotency_key": "调用方生成的唯一键",
  "expected_version": 0
}
```

服务端依次校验登录用户、项目访问范围、业务角色、项目数据分类、幂等键和乐观锁版本。跨组织、跨项目、数据分类不一致或旧版本写入均拒绝。

统一响应字段：`status、request_id、context、source、data_class、generated_at、warnings、data`。

## 3. 数据对象

| 表 | 用途 | 可变性 |
|---|---|---|
| `project_wbs_versions` | WBS版本与审批状态 | 受状态机与乐观锁控制 |
| `project_wbs_items` | 当前版本工作包、工期、依赖、价值与验收标准 | 随可编辑版本整体重建 |
| `project_delivery_actuals` | 工作包完成率、实际日期、成本与证据 | 受乐观锁控制 |
| `project_schedule_snapshots` | CPM输入哈希与确定性结果 | 追加式快照 |
| `project_evm_snapshots` | EVM期间事实、指标与解释 | 追加式快照 |
| `project_resource_plans` | 8–12周容量计划头 | 受状态与乐观锁控制 |
| `project_resource_capacity_periods` | 人员周容量 | 随计划版本重建 |
| `project_resource_assignments` | 工作包/公共工作周分配 | 随计划版本重建 |
| `project_resource_conflict_actions` | 超配闭环动作 | 受状态机与乐观锁控制 |
| `project_delivery_operation_receipts` | 幂等回执 | 追加式 |
| `project_delivery_events` | 交付控制业务事件 | 严格只追加 |

所有表启用RLS；`PUBLIC`、`anon`、`authenticated`无直接表权限；仅服务端`service_role`可按最小权限访问。事务函数仅向`service_role`授予执行权。

## 4. HTTP接口

### 4.1 `/api/wbs`

- `GET`：读取当前项目、WBS版本、当前工作包、交付实绩和审计事件。
- `POST operation=assist`：基于真实范围输入生成候选工作包，不保存、不审批。
- `POST operation=save_version`：调用`save_project_wbs_version_tx`。
- `POST operation=transition_version`：调用`transition_project_wbs_version_tx`。
- `POST operation=save_actual`：调用`save_project_delivery_actual_tx`。

### 4.2 `/api/cpm`

- `GET`：读取当前持久化WBS与历史CPM快照。
- `POST operation=calculate`：服务端读取WBS工作包，验证依赖图无缺失和循环，运行确定性CPM，保存`project_schedule_snapshots`。请求体不接受临时`tasks`覆盖正式事实。

### 4.3 `/api/evm`

- `GET`：读取批准成本基准、批准WBS、工作包实绩、成本台账和历史快照。
- `POST operation=calculate`：以工作包计划价值和完成率形成PV/EV，以`cost_records.actual_cost`形成AC，运行确定性EVM并保存快照。任一前置事实缺失时失败关闭。

### 4.4 `/api/resource`

- `GET`：读取计划、周容量、任务分配、冲突动作、WBS工作包和项目授权成员。
- `POST operation=save_plan`：调用`save_project_resource_plan_tx`，区间必须为8–12周。
- `POST operation=transition_conflict`：执行接受、开始、提交证据、PMO复核、关闭或重新打开。
- `POST operation=assist`：只解释已保存容量与冲突，不自动调整或关闭。

## 5. 状态机

WBS：`draft → submitted → approved`；审批人可`rejected/changes_requested`，责任人修订回`draft`，批准版可转`superseded`后建立下一修订版。

资源冲突：`assigned → accepted → in_progress → evidence_submitted → verified → closed`；PMO可在复核后`reopened`。提交证据必须由责任人完成，复核/关闭必须由PMO完成。

## 6. 迁移执行与验收

执行顺序：

1. 确认生产库已经登记V6.3.0迁移；
2. 仅应用`20260714200000_v631_delivery_control_realization.sql`；
3. 验证11张表存在且RLS启用；
4. 验证客户端角色对新表无权限；
5. 验证9个函数仅`service_role`可执行；
6. 验证事件表更新和删除会被触发器拒绝；
7. 运行全量自动测试、类型检查、Lint和生产构建；
8. 发布Git标签、GitHub Release、Vercel生产环境，并核对`/api/version`。

## 7. 业务试点前置条件

代码验收不等于业务数据验收。至少需要一个正式项目具备：

- 项目级PM和PMO角色分配；
- 已批准成本基准；
- 已批准WBS及工作包计划价值、工期、依赖；
- 至少一条工作包实绩和一条真实成本台账；
- 至少一名真实项目成员参与8周以上容量计划。

在这些前置条件满足前，页面应展示明确缺口，不宣称黄金链或真实业务闭环已通过。
