# AI-PMO V6.3.2 业财、干系人、质量与验收真实化接口及运维契约

版本：V6.3.2  
主迁移：`supabase/migrations/20260714235000_v632_commercial_quality_acceptance_realization.sql`  
安全修复：`supabase/migrations/20260715080700_v632_event_search_path_security_fix.sql`

## 1. 目标与业务边界

V6.3.2 将合同→应收→回款、干系人识别→参与行动、质量计划→检查→缺陷整改→验收→签发三条链路改为当前授权项目内的正式业务状态。飞书继续作为业务事实源，Supabase 保存稳定项目镜像、人工状态、权限、幂等回执和追加式审计事件。

AI只能根据当前项目事实生成候选条款、分析或建议，不直接保存、不替代责任人录入、不代替验收人和签发人做决定。缺少正式项目、组织、角色、数据分类或业务前置记录时失败关闭，不生成模拟成功结果。

## 2. 统一写入契约

所有写接口必须携带并由服务端校验：

```json
{
  "project_id": "稳定项目UUID",
  "business_role": "pm|operations|pmo|sponsor|business_owner|finance|quality",
  "data_class": "production|sample|test|diagnostic|unclassified",
  "idempotency_key": "调用方生成的唯一键",
  "expected_version": 0
}
```

同一幂等键返回原操作结果；期望版本落后返回冲突，不覆盖他人新版本。统一响应包含`status、request_id、context、source、data_class、generated_at、warnings、data`。

## 3. 数据对象

| 表 | 用途 |
|---|---|
| `project_contract_records` | 项目合同业务记录与人工状态 |
| `project_receivable_records` | 应收计划、到期日、责任人与状态 |
| `project_collection_records` | 实际回款、核销依据与来源 |
| `project_stakeholder_records` | 干系人权力、利益、参与度和管理策略 |
| `project_stakeholder_engagement_actions` | 责任到人、有期限、有结果的参与行动 |
| `project_quality_plans` | 质量计划、标准和验收策略 |
| `project_quality_check_items` | 检查项、结果、证据与复核状态 |
| `project_defect_records` | 缺陷、整改责任、期限、验证与关闭 |
| `project_acceptance_records` | 验收单、范围、验收人和状态 |
| `project_acceptance_items` | 验收标准、实际结果、证据与判定 |
| `project_signoff_records` | 人工签发结论和签发证据 |
| `project_commercial_quality_operation_receipts` | 幂等操作回执 |
| `project_commercial_quality_events` | 严格追加式业务事件 |

13张表都启用RLS；`PUBLIC`、`anon`、`authenticated`无直接表权限，只允许服务端`service_role`访问。每张表都有组织、项目、数据分类一致性触发器，事件表拒绝更新和删除。

## 4. HTTP接口

### 4.1 `/api/contract`

- `GET`：读取当前项目、合同、应收、回款、V6.2飞书合同/回款镜像和审计事件。
- `POST operation=parse_terms`：基于当前项目事实生成付款条款候选，不保存。
- `POST operation=save_contract|save_receivable|record_collection`：调用`save_project_commercial_record_tx`。
- `POST operation=transition`：调用`transition_project_commercial_quality_tx`执行合同人工状态变更。

### 4.2 `/api/stakeholder`

- `GET`：读取干系人、参与行动与事件。
- `POST operation=assist`：生成参与策略候选，不保存。
- `POST operation=save_stakeholder`：调用`save_project_stakeholder_record_tx`。
- `POST operation=save_action`：调用`save_project_stakeholder_action_tx`，要求责任人、期限和预期输出。

### 4.3 `/api/quality`

- `GET`：读取质量计划、检查项、缺陷、验收、验收项、签发和事件。
- `POST operation=assist`：基于已保存事实生成分析候选。
- `POST operation=save_plan|save_check_result`：保存质量计划或人工检查结果。
- `POST operation=save_defect`：保存缺陷、责任人、期限与整改证据。
- `POST operation=save_acceptance|save_acceptance_item_result`：保存验收单与人工判定。
- `POST operation=save_signoff`：由授权签发人保存正式结论。
- `POST operation=transition`：执行质量、缺陷、验收或签发状态机动作。

`/closing`保留原路由并转到`/quality?tab=acceptance`，使收尾入口落到正式验收和签发链。

## 5. 事务函数

业务写入使用：`save_project_commercial_record_tx`、`save_project_stakeholder_record_tx`、`save_project_stakeholder_action_tx`、`save_project_quality_plan_tx`、`save_project_quality_check_result_tx`、`save_project_defect_tx`、`save_project_acceptance_tx`、`save_project_acceptance_item_result_tx`、`save_project_signoff_tx`和`transition_project_commercial_quality_tx`。

事务函数在同一事务内完成业务记录、乐观锁、幂等回执和业务事件，且只向`service_role`授予执行权。

## 6. 生产数据库验收证据

- 两份migration已登记：`20260714235000`、`20260715080700`。
- 13/13张表存在并启用RLS；客户端角色直接授权为0。
- 10个业务事务函数存在，`anon`与`authenticated`执行权为0，`service_role`执行权完整。
- 13个范围校验触发器和1个事件追加保护触发器存在。
- Supabase安全顾问：ERROR 0；WARN 6均为本版本之前的遗留项，本版本新增告警为0。
- `RLS Enabled No Policy`信息项是服务端专用表的预期结果：表未向客户端角色授权，不建立客户端访问策略。

## 7. 发布与试点门槛

代码发布必须通过V6.3.2测试、全量测试、TypeScript、Lint和生产构建，并完成Git标签、GitHub Release、Vercel生产部署及`/api/version`核对。

生产库当前没有可用于本链路验收的正式项目时，只能确认结构、权限、接口和失败关闭逻辑，不能宣称真实业务流已跑通。试点至少需要一个正式项目、合同/应收事实、财务责任人、质量责任人、验收人和签发人，以真实证据完成一次合同回款和一次缺陷至验收签发闭环。
