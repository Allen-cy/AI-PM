# AI-PMO V6.3.3 项目控制统一真实化接口与运维契约

- 版本：V6.3.3
- 日期：2026-07-15
- 适用角色：项目经理、运营、PMO、质量、财务、业务负责人、项目发起人

## 1. 目标与完成边界

V6.3.3 将执行、监控、风险、问题、变更、行动项、质量、验收和收尾统一到同一个项目事实快照。系统不再让各页面维护彼此独立的演示状态，也不再允许客户端把任务数组当成 AI 分析事实。

- 飞书继续作为任务、里程碑等业务事实源；Supabase 保存稳定镜像、治理状态机、权限、幂等回执和审计事件。
- 所有正式读取必须绑定 `org_id + project_id + data_class`，并经过当前用户项目授权验证。
- 所有正式写入必须携带稳定项目 UUID、业务角色、数据分类、幂等键和期望版本。
- 数据源不可用时接口失败关闭；确定性摘要可以替代 AI 表达，但不得替代真实事实。
- 风险升级、问题处理、变更审批和行动关闭使用同一原子事务，业务记录、状态变化、行动项和事件同时成功或同时失败。

## 2. 统一项目事实快照

`buildProjectControlSnapshot` 聚合以下正式来源：

| 领域 | 表/来源 | 主要输出 |
|---|---|---|
| 项目 | `projects` | 项目身份、数据分类、更新时间 |
| 执行 | `tasks`、`project_milestones`、`project_delivery_actuals` | 任务、里程碑、阻塞、逾期 |
| 计划与绩效 | `project_schedule_snapshots`、`project_evm_snapshots` | CPM、SPI/CPI、偏差 |
| 风险与治理 | `risks`、`project_issues`、`project_changes`、`unified_action_items` | 高风险、问题、变更、行动 |
| 质量与验收 | `project_quality_check_items`、`project_defect_records`、`project_acceptance_records`、`project_signoff_records` | 检查、缺陷、验收、签发 |
| 收尾 | `project_closure_assessments` | 收尾准备度和阻塞项 |

快照统一输出项目健康度、执行统计、治理统计、质量状态、收尾准备度、例外池、数据来源、最近更新时间、质量状态和告警。每个例外包含来源、责任人、期限和关联行动，供执行页、监控页、风险页和收尾页共同使用。

## 3. API 契约

### 3.1 公共读取上下文

以下读取接口通过查询参数接收：

```text
project_id=<稳定项目UUID>
business_role=<pm|operations|pmo|sponsor|business_owner|finance|quality>
data_class=<production|sample|test|diagnostic|unclassified>
```

系统根据登录用户重新解析组织和项目访问权；客户端提交的组织 ID 不能扩大权限。

### 3.2 公共写入契约

```json
{
  "project_id": "稳定项目UUID",
  "business_role": "pm",
  "data_class": "production",
  "idempotency_key": "调用方生成且同一业务动作保持不变",
  "expected_version": 1
}
```

- 新建记录使用 `expected_version=0`。
- 更新或状态变化使用当前记录版本。
- 重复幂等键且载荷相同返回原结果；载荷不同返回 409。
- 期望版本不是当前版本返回 409，禁止静默覆盖他人更新。

### 3.3 执行与交付

| API | 方法 | 动作 |
|---|---|---|
| `/api/execution` | GET | 读取当前项目任务、里程碑、变更和统一例外 |
| `/api/execution` | POST | `generate_summary`、`create_task`、`create_deliverable` |

AI 摘要由服务端重新加载统一项目快照。创建任务或里程碑先登记 `project_control_operation_receipts`，再以当前用户的有效飞书配置写入中文字段；成功记录飞书记录 ID，失败记录失败回执，后续由对账任务进入 Supabase 镜像。

### 3.4 监控中心

| API | 方法 | 动作 |
|---|---|---|
| `/api/monitoring` | GET | 返回健康度、例外池、行动项、进度/EVM、质量与收尾状态 |
| `/api/monitoring` | POST | 基于服务端项目快照生成 AI 监控洞察 |

AI 不可用或格式错误时返回基于真实快照的确定性摘要和告警，不伪造模型成功。

### 3.5 风险、问题、变更和行动

| API | 方法 | 动作 |
|---|---|---|
| `/api/issue-change` | GET | 按组织、项目、数据分类读取问题、变更、行动和事件链 |
| `/api/issue-change` | POST | `create_issue`、`escalate_risk`、`transition_issue`、`create_change`、`transition_change`、`create_action`、`close_action` |

状态变化由服务端根据当前记录状态计算，客户端不能直接指定任意目标状态。风险升级必须解析当前项目中的真实风险 ID 或风险编号；问题、变更、行动和追加式事件由 `apply_project_issue_change_action_tx` 在同一事务内完成。

## 4. 数据库迁移

生产库已经按顺序应用并登记：

1. `20260715181000_v633_project_control_unification.sql`
   - 为问题、变更、行动补齐 `version` 和 `last_idempotency_key`。
   - 新增服务端操作回执表。
   - 新增问题/变更事件追加式保护。
   - 新增开始回执、结束回执和项目控制原子事务函数。
2. `20260715190000_v633_security_posture_repair.sql`
   - 重新声明 V6.3.0–V6.3.3 后续对象的服务端权限。
   - 撤销 `PUBLIC`、`anon`、`authenticated` 的表、序列和触发器函数权限。
   - 修复完整数据库安全审计发现的 13 项权限漂移。

两份迁移均为生产已应用历史，禁止修改或重跑。后续修复必须新增 migration。

## 5. 生产安全与验收证据

- `audit_v61_database_security()`：0 项违规。
- Supabase Security Advisor：ERROR 0；WARN 6 均为既有基线（5 个旧函数 search path、1 个 public extension），V6.3.3 新增对象 WARN 0。
- V6.3.3 相关 INFO 为“RLS 已启用但无客户端策略”，符合仅服务端访问设计。
- `project_control_operation_receipts` 客户端授权：0。
- 三个项目控制事务函数客户端执行授权：0。
- 问题/变更事件追加式触发器：1。

## 6. 运维与故障判断

| 现象 | 判断与处理 |
|---|---|
| 401 | 用户未登录 |
| 400 `PROJECT_CONTROL_CONTEXT_REQUIRED` | 未选择项目、角色或数据空间 |
| 409 `PROJECT_CONTROL_SCOPE_MISMATCH` | 客户端上下文与服务端授权上下文不一致 |
| 409 `VERSION_CONFLICT` | 页面数据已过期，刷新后重新操作 |
| 409 `IDEMPOTENCY_*` | 同一幂等键被用于不同载荷，调用方必须生成新的业务动作键 |
| 503 `*_SOURCE_UNAVAILABLE` | 正式数据源不可用；不得切回硬编码演示数据 |
| 飞书写入失败 | 查看操作回执和飞书配置；禁止静默回退到管理员身份 |

## 7. 后续接口

V6.3.4 已在此统一项目事实之上完成正式 `reporting_snapshots` 历史、会议与报告成果持久化、迁移结果留痕和已审批知识资产留档，详见 `docs/v634-formal-business-output-persistence.md`。V6.4.0 继续以这些成果作为四角色工作台与统一收件箱的可追溯输入。
