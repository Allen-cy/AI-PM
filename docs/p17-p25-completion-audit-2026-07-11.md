# P17-P25 完成审计报告

日期：2026-07-11

当前结论：P17-P25 的代码、页面、API、迁移文件、测试、构建、发布和匿名线上鉴权已经通过当前证据验证；生产 Supabase 表/函数实际落库状态和登录态业务闭环仍未被本会话直接证明，不能把整个目标判定为完全完成。

## 1. 已验证证据

| 类别 | 证据 | 结果 |
|---|---|---|
| 版本 | `package.json` 当前版本 | `6.0.0` |
| GitHub Release | `https://github.com/Allen-cy/AI-PM/releases/tag/v6.0.0` | 正式 Release，非草稿，非预发布 |
| Vercel 部署 | `dpl_487W8e15yLu1wbw2gFu2zAwRumaT` | Production Ready |
| 生产域名 | `https://pmai.chunyu2026.qzz.io` | 已绑定到生产部署 |
| Lint | `npm run lint -- --quiet` | 通过 |
| TypeScript | `npx tsc --noEmit --pretty false` | 通过 |
| Build | `npm run build` | 通过，生成 174 个路由 |
| Test | `npx --yes tsx --test --test-concurrency=1 tests/*.test.ts` | 294/294 通过 |
| 匿名首页 | `GET /` | 307 到登录页，符合 `AUTH_REQUIRED=true` |
| 登录页 | `GET /auth/login` | 200 |
| 未登录用户态 | `GET /api/auth/me` | 401 `UNAUTHORIZED` |
| P17-P25 关键 API 未登录保护 | `GET /api/context/current` 等关键 API | 全部 401 |
| Cron 未授权保护 | `GET /api/cron/decision-sla`、`/api/cron/evidence-expiry`、`/api/cron/operating-calendar` | 全部 401 |
| Vercel Production 环境变量名 | `vercel env ls production` | 关键变量名存在 |
| 管理员初始化 | `POST /api/auth/bootstrap-admin` | 返回 `{"ok":true,"status":"admin_exists"}`，说明生产认证存储可用且管理员已存在 |

## 2. P17-P25 阶段审计

| 阶段 | 交付范围 | 当前证据 | 判定 |
|---|---|---|---|
| P17 | 角色化经营治理底座、权限、项目身份、项目360、上下文切换 | 页面/API/迁移/测试存在；P17 相关测试通过；未登录保护通过 | 代码侧已完成；生产登录态待验收 |
| P18 | 信号、生命周期、证据、纠偏、状态机 | 生命周期、证据、信号扫描测试通过；Cron 鉴权通过 | 代码侧已完成；生产 RPC 执行待 Supabase 验证 |
| P19 | PM/运营业务助理、变更草稿、飞书写回确认队列、运营日历 | 业务助理、写回队列、运营日历测试通过；飞书写入被设计为确认队列 | 代码侧已完成；真实飞书写回待登录态验收 |
| P20 | PMO控制中心、例外池、容量、数据质量、规则矩阵 | PMO 控制中心 API/页面/测试存在且通过 | 代码侧已完成；真实业务数据待验收 |
| P21 | 汇报、会议、决策中心、SLA、下行回执和效果复核 | 决策中心、会议、SLA、回执测试通过；Cron 未授权保护通过 | 代码侧已完成；生产 RPC/数据待验证 |
| P22 | 合同、成本、回款、现金、毛利、收益基线、收益复核 | 经营财务测试通过；页面/API存在 | 代码侧已完成；真实合同/回款数据待验收 |
| P23 | 角色化 AI 助理、主动扫描、建议执行预览、评价 | 角色助理、主动扫描、密钥不外露测试通过 | 代码侧已完成；真实模型调用待登录态验收 |
| P24 | 收尾评估、知识候选、知识自动化、复盘复用 | 收尾知识和自动化测试通过；页面/API存在 | 代码侧已完成；真实知识入库待验收 |
| P25 | 运营中心、用户敏感配置加密、企业能力门禁、黄金链验收 | 加密、运营中心、黄金链测试通过；页面/API存在 | 代码侧已完成；生产黄金链 run 待登录态验收 |

## 3. 仍未被本会话证明的事项

1. Supabase Production 实际表和函数是否全部存在。
   - Supabase MCP 当前返回无权限：`MCP error -32600: You do not have permission to perform this action`。
   - 本地 `.env.local` 中 Supabase 值为空占位。
   - `vercel env pull` 与 `vercel env run -e production` 在本会话不能把敏感 Production 变量提供给本地子进程，因此不能用 Service Role 做只读表/函数检查。
2. 管理员登录态线上冒烟。
   - 本地无可用管理员账号值。
   - 为避免敏感信息外露，本会话未把历史对话中的敏感账号密码写入命令。
   - `POST /api/auth/bootstrap-admin` 已确认管理员存在，但没有返回、也不应返回登录凭据。
3. 真实飞书写回闭环。
   - 匿名侧只能证明 API 被保护，不能证明个人飞书/全局飞书写回成功。
4. 真实业务数据闭环。
   - 需要登录后验证项目台账、重点项目、PM/运营、PMO控制、决策中心、经营财务、黄金链是否读取生产数据。

## 4. Supabase SQL Editor 只读快速检查

在 Supabase SQL Editor 里执行以下 SQL。它不会改动数据，只返回关键表/函数是否存在。

```sql
with required_tables(name) as (
  values
    ('user_project_access_grants'),
    ('feishu_action_confirmations'),
    ('organizations'),
    ('portfolios'),
    ('portfolio_project_links'),
    ('user_business_roles'),
    ('business_authorization_policies'),
    ('business_reporting_relationships'),
    ('project_identity_mappings'),
    ('management_signals'),
    ('management_signal_events'),
    ('evidence_requirements'),
    ('evidence_links'),
    ('project_lifecycle_states'),
    ('feedback_correction_events'),
    ('business_update_drafts'),
    ('business_joint_check_runs'),
    ('business_operating_occurrences'),
    ('pmo_control_events'),
    ('project_level_rule_matrices'),
    ('resource_capacity_snapshots'),
    ('data_quality_issues'),
    ('reporting_snapshots'),
    ('governance_meetings'),
    ('decision_briefs'),
    ('decision_receipts'),
    ('decision_effect_reviews'),
    ('project_benefit_baselines'),
    ('benefit_realization_reviews'),
    ('portfolio_scenarios'),
    ('ai_assistant_runs'),
    ('ai_recommendations'),
    ('ai_assistant_evaluations'),
    ('project_closure_assessments'),
    ('retrospective_knowledge_candidates'),
    ('knowledge_reuse_events'),
    ('enterprise_capability_gates'),
    ('golden_chain_runs'),
    ('golden_chain_steps')
),
required_functions(name) as (
  values
    ('route_management_signal_tx'),
    ('transition_management_signal_tx'),
    ('initialize_project_lifecycle_tx'),
    ('transition_project_lifecycle_tx'),
    ('process_expired_lifecycle_evidence_tx'),
    ('queue_business_update_draft_writeback_tx'),
    ('claim_business_update_writeback_tx'),
    ('finalize_business_update_writeback_tx'),
    ('materialize_business_operating_calendar_tx'),
    ('save_capacity_plan_tx'),
    ('save_data_quality_scan_tx'),
    ('create_reporting_snapshot_tx'),
    ('record_governance_meeting_outcome_tx'),
    ('decide_decision_brief_tx'),
    ('process_decision_sla_escalations_tx'),
    ('create_benefit_baseline_tx'),
    ('submit_benefit_review_tx'),
    ('confirm_portfolio_scenario_tx'),
    ('materialize_ai_recommendation_tx'),
    ('create_closure_knowledge_candidate_tx'),
    ('publish_closure_knowledge_candidate_tx'),
    ('create_golden_chain_run_tx'),
    ('transition_golden_chain_run_tx'),
    ('transition_golden_chain_step_tx')
)
select 'table' as object_type, name, to_regclass('public.' || name) is not null as exists
from required_tables
union all
select 'function' as object_type, name, exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = required_functions.name
) as exists
from required_functions
order by object_type, name;
```

## 5. 2026-07-11 v6.0.6 追加生产审计

v6.0.6 已完成发布与生产部署：

- Release：`https://github.com/Allen-cy/AI-PM/releases/tag/v6.0.6`
- Production 部署：`dpl_A1B6HegpKmmSCqnK7zkLiTV3cz9M`
- 域名：`https://pmai.chunyu2026.qzz.io`

本地验证：

```text
npm run lint -- --quiet：通过
npx tsc --noEmit --pretty false：通过
npx --yes tsx --test --test-concurrency=1 tests/*.test.ts：294/294 通过
npm run build：通过，生成 175 个路由
```

受保护生产审计接口：

```text
GET /api/internal/p17-p25-audit
```

当前返回 `207 needs_attention`，不是通过。已验证通过项：

- `AUTH_REQUIRED=true`
- Supabase auth storage 已配置
- MiniMax-M3 已配置
- 凭据加密环境变量已配置
- 41 张 P17-P25 关键表探测通过
- 管理员存在、active，密码校验通过
- 全局飞书配置健康检查为 `ok`
- `/api/user/ai-settings` 返回 200
- `/api/user/feishu-connection` 经 v6.0.6 legacy 兼容后返回 200

仍未完成项：

- `/api/context/current` 返回 503：`P17_STORAGE_NOT_CONFIGURED`
- 具体错误：`Could not find the table 'public.user_business_roles' in the schema cache`
- `user_feishu_connections` 当前生产表仍缺当前版本要求的加密/通知字段，严格审计继续标红。

必须执行的修复 SQL：

```text
supabase/migrations/20260711102000_p17_p25_production_repair.sql
```

该脚本会补齐 P25 用户飞书加密字段、P21 飞书通知字段，补默认管理员组织级业务角色和 PM/运营 -> PMO -> CEO 汇报关系，并执行 `notify pgrst, 'reload schema';` 刷新 Supabase schema cache。

执行该 SQL 后，必须重新跑 `/api/internal/p17-p25-audit`；只有审计返回 `200 passed`，才能把 P17-P25 判定为生产闭环完成。

验收标准：所有 `exists` 都必须为 `true`。如果有 `false`，先补执行对应 SQL，再做登录态验收。

## 5. 登录态线上冒烟清单

需要管理员登录后逐项检查：

1. 首页顶部显示用户中心，不再显示登录按钮。
2. `/account` 能查看并修改用户信息。
3. `/account` 中 AI 模型配置可保存、测试，不泄露 API Key。
4. `/account` 中个人飞书配置可保存、测试，不泄露 App Secret/Base Token。
5. `/business-assistant` 能读取项目事实、承诺、风险、行动项。
6. `/business-assistant/operations-loop` 能展示验收、开票、应收、回款闭环。
7. `/pmo/control-center` 能显示例外池、容量、数据质量、治理动作。
8. `/decision-center` 能创建/推进决策包，并产生回执/复核链路。
9. `/business-finance` 能显示合同、成本、现金、毛利、收益复核。
10. `/operations-center/golden-chains` 能创建验收 run 并推进步骤。
11. 所有飞书写入必须先进入确认队列，不能静默写业务表。
