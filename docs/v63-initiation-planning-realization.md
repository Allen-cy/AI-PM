# AI-PMO V6.3.0 立项与规划真实化接口及运维契约

版本：V6.3.0  
状态：代码与自动化测试已完成；生产迁移、发布和线上验收待完成  
适用角色：项目经理、运营、PMO、项目发起人、业务负责人、财务

## 1. 本版本解决的问题

V6.3.0 将以下成果从浏览器临时状态改为 Supabase 正式业务记录：

- 项目立项输入；
- 商业论证；
- 项目章程及签发；
- 项目管理计划；
- 范围基准、进度基准、成本基准；
- 提交、批准、拒绝、退回修改、重新修订；
- 幂等写入、乐观版本控制、审批决定和追加式审计事件。

用户必须录入事实并主动保存或提交。AI 只负责起草或分析，不会替代用户提交，也不会替代有权限的审批人作出决定。AI 调用失败时，正式路径不返回伪造的本地兜底结果。

## 2. 数据库迁移

正式迁移文件：

`supabase/migrations/20260713223000_v63_initiation_planning_realization.sql`

新增业务表：

| 表 | 用途 |
|---|---|
| `project_initiation_records` | 项目立项输入与版本 |
| `project_governance_artifacts` | 商业论证、项目章程、项目管理计划 |
| `project_plan_baselines` | 范围、进度、成本基准 |
| `project_governance_decisions` | 人工提交与审批决定 |
| `project_governance_events` | 不可修改的追加式事件链 |
| `project_governance_operation_receipts` | 幂等请求回执 |

新增事务函数：

- `save_project_initiation_tx`
- `save_project_governance_artifact_tx`
- `transition_project_governance_artifact_tx`
- `save_project_plan_baseline_tx`
- `transition_project_plan_baseline_tx`

所有表启用 RLS，并撤销 `PUBLIC`、`anon`、`authenticated` 的直接权限。正式页面只经服务端业务接口访问；事务函数只允许 `service_role` 执行。函数使用调用者权限运行，服务端权限、项目范围和数据分类在 API 与数据库触发器中双重校验。

## 3. 通用写入契约

所有正式写入必须携带：

```json
{
  "project_id": "稳定项目UUID",
  "business_role": "pm",
  "data_class": "production",
  "idempotency_key": "调用方生成的唯一键",
  "expected_version": 0
}
```

规则：

- 新建记录的 `expected_version` 为 `0`；
- 更新或流转使用页面最后读取到的版本号；
- 版本不一致返回 HTTP 409，禁止静默覆盖；
- 同一幂等键和相同请求返回原结果；
- 同一幂等键承载不同请求返回 HTTP 409；
- 项目、组织、数据分类或角色不匹配时拒绝执行。

## 4. 立项接口

### 4.1 读取

`GET /api/initiation?project_id=...&business_role=...&data_class=...`

返回当前项目、立项记录、商业论证、项目章程、三类基准、需求、干系人、最近审批决定和审计事件。

### 4.2 写入

`POST /api/initiation`

| `operation` | 说明 | 关键输入 |
|---|---|---|
| `save_initiation` | 保存正式立项输入 | `content` |
| `generate_business_case` | AI 辅助起草商业论证 | 当前项目事实与用户输入 |
| `save_business_case` | 保存商业论证草稿 | `title/content/source_type` |
| `generate_charter` | AI 辅助起草章程 | 当前项目事实与用户输入 |
| `save_charter` | 保存项目章程草稿 | `title/content/source_type` |
| `transition_artifact` | 提交或审批成果 | `artifact_id/transition/comment` |

`approve`、`reject`、`request_changes` 必须填写审批意见。项目经理不能批准自己提交的成果；服务端根据当前项目的有效业务角色判断权限。

## 5. 规划接口

### 5.1 读取

`GET /api/planning?project_id=...&business_role=...&data_class=...`

返回当前项目、正式管理计划、三类基准、最近审批决定和审计事件。

### 5.2 写入

`POST /api/planning`

| `operation` | 说明 | 关键输入 |
|---|---|---|
| `assist` | 根据真实项目与用户输入生成规划建议 | `project_type/knowledge_area/context` |
| `save_management_plan` | 保存整合管理计划 | `title/content/source_type` |
| `transition_artifact` | 流转管理计划 | `artifact_id/transition/comment` |
| `save_baseline` | 保存范围、进度或成本基准 | `baseline_type/title/content/effective_date` |
| `transition_baseline` | 流转三类基准 | `baseline_id/transition/comment` |

成本基准还必须提供 `baseline_value` 和 `currency`。页面不再使用“示例项目”，也不再用 React 状态模拟“基准已设置”。

## 6. 状态机

```text
draft -> submitted -> approved
                   -> rejected -> draft（revise）
                   -> changes_requested -> draft（revise）
approved -> superseded
```

已批准成果需要调整时，审批角色先执行“发起新版本”进入 `superseded`，业务作者再保存新版内容并回到 `draft`。旧版完整内容保留在追加式事件中，不能直接覆盖已批准版本而不留痕。

业务作者可保存、提交和修订；PMO、项目发起人或业务负责人可审批。成本基准允许财务角色审批。AI 不拥有任何审批动作。

## 7. 统一响应

正式接口响应包含：

- `status`
- `request_id`
- `context`
- `source`
- `data_class`
- `generated_at`
- `warnings`
- `data`

数据来源明确标记为 `supabase` 或 `llm+supabase`，并返回更新时间。正式接口不返回测试数据作为业务结果。

## 8. 发布与验收清单

- [x] 专项测试通过；
- [x] 完整自动化测试通过；
- [x] TypeScript 检查通过；
- [x] Lint 无新增错误；
- [x] 生产构建通过；
- [ ] Supabase 生产迁移已应用并登记迁移历史；
- [ ] 六张表、五个函数、RLS、权限和追加式事件已在线核验；
- [ ] 立项、商业论证、章程、管理计划和三类基准完成真实用户流转测试；
- [ ] 发布 V6.3.0 Git 标签与 GitHub Release；
- [ ] Vercel 生产部署并核对 `/api/version`；
- [ ] 同步 AI-PMO-SYS 的 README、STATE、Task_Log、log、产品版本和发布证据。

## 9. 回滚原则

- 页面发布前必须先完成数据库迁移；
- 若线上接口异常，回滚应用读路径，不删除新增表和审计事件；
- 不物理删除用户输入、审批决定或历史事件；
- 不重跑既有迁移；修复使用新的追加迁移。
