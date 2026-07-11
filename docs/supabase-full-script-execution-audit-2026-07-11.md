# Supabase 全量数据库脚本执行审计报告

日期：2026-07-11

范围：本次审计覆盖当前仓库全部 SQL 文件，不限于 P17-P25。

## 1. 数据库连接结论

已通过本机私密连接文件连接到 Supabase Postgres。

- 连接配置：本机私密连接配置（未纳入仓库）。
- 安全处理：未在日志或对话中输出数据库连接串、密码或密钥。
- 连接方式：Pooler 参数化连接，避免 URI 直传的解析歧义。
- 数据库：`postgres`
- schema：`public`
- Postgres 版本：`17.6`

## 2. 初始审计结果

首次全量审计发现当前库并未完整执行所有数据库脚本。

- SQL 文件总数：46
- 已等效执行：24
- 部分执行或缺字段/缺对象：8
- 未执行或大面积缺失：14

当时 P17-P25 关键表也不是全部存在，缺失包括但不限于：

- `decision_briefs`
- `evidence_requirements`
- `business_update_drafts`
- `pmo_control_events`
- `project_benefit_baselines`
- `ai_assistant_runs`
- `enterprise_capability_gates`
- `golden_chain_runs`

## 3. 已补执行脚本

以下脚本已按依赖顺序由本机会话直接执行到 Supabase，每个脚本单独事务执行，执行失败会回滚该脚本并停止。本次全部执行成功。

```text
supabase/migrations/20260710064212_p21_p22_decision_loop.sql
supabase/migrations/20260710064236_p18_lifecycle_feedback_evidence.sql
supabase/migrations/20260710064530_p19_business_assistant.sql
supabase/migrations/20260710070000_p20_pmo_control_center.sql
supabase/migrations/20260710071709_p25_encrypt_user_credentials.sql
supabase/migrations/20260710080000_p22_business_finance_benefits.sql
supabase/migrations/20260710090000_p23_role_ai_assistant.sql
supabase/migrations/20260710100000_p24_closure_knowledge_reuse.sql
supabase/migrations/20260710104859_p22_benefit_exit_scenario_hardening.sql
supabase/migrations/20260710110000_p25_operations_center.sql
supabase/migrations/20260710113000_p23_role_ai_assistant_scope_hardening.sql
supabase/migrations/20260710120000_p19_business_assistant_writeback.sql
supabase/migrations/20260710130000_p17_p18_operating_contracts.sql
supabase/migrations/20260710131000_p19_joint_checks_calendar.sql
supabase/migrations/20260710132000_p24_knowledge_automation.sql
supabase/migrations/20260710134500_wave0_real_business_entries.sql
supabase/migrations/20260710135000_p17_project_identity_cutover.sql
supabase/migrations/20260710191152_p21_reporting_meeting_decision_hardening.sql
supabase/migrations/20260710213000_p23_proactive_scan_and_domain_drafts.sql
supabase/migrations/20260710220000_p25_golden_chain_execution.sql
```

## 4. 补执行后审计结果

补执行后重新审计：

- SQL 文件总数：46
- 已等效执行：46
- 真实缺失脚本：0
- 真实缺失关键表：0

当前 public schema 对象数量：

- 表：163
- 函数：213 个函数签名 / 188 个去重函数名
- 触发器：28
- 索引：525

P17-P25 迁移实际声明的关键表已全部存在。后续复核发现，若使用早期手写表名清单，会因命名演进产生误报，例如 `business_roles` 实际演进为 `user_business_roles`，`project_identities` 实际由 `project_identity_mappings`、`project_identity_migration_*` 等表承载；最终验收以当前 migration 的 `CREATE TABLE` 声明对象为准。

## 5. 关于两个误报

自动解析器曾提示两个“部分缺失”：

1. `supabase-schema.sql` 中的 `projects.case`、`okr_key_results.case`
2. `20260710220000_p25_golden_chain_execution.sql` 中的 `*.references`

复核后确认它们不是字段缺失，而是 SQL 关键字误判：

- `case` 来自 SQL 表达式 `case when ... then ... else ... end`
- `references` 来自外键语法 `references public.xxx(...)`

实际数据库字段检查确认不存在真实缺口。

## 6. 当前结论

截至本次审计完成，当前 Supabase 数据库已完成当前仓库全部 46 个 SQL 文件的等效落库。

后续如果新增数据库变更，建议继续生成新的 migration 文件，并由本机直连方式执行和审计，避免手工漏执行。
