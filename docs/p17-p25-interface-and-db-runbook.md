# P17-P25 阶段任务开发接口与数据库执行手册

日期：2026-07-11

当前代码版本：6.0.0

状态：本地质量门已通过；Vercel Production 环境变量补齐、部署、Git Tag 和 GitHub Release 已完成。生产完成仍依赖 Supabase Production 执行/确认 SQL，以及使用真实管理员账号完成线上飞书/真实业务数据冒烟。

## 1. 阶段范围

| 阶段 | 主题 | 交付边界 |
|---|---|---|
| P17 | 角色化经营治理底座 | 组织/组合/项目/业务角色、权限、项目身份、项目360、上下文切换、管理信号基础 |
| P18 | 信号、生命周期与证据 | 通用信号扫描、管理信号状态机、生命周期门禁、证据矩阵、人类纠偏 |
| P19 | PM/运营业务助理闭环 | PM/运营工作台、变更草稿、飞书 Base 写回确认队列、联合检查、运营日历 |
| P20 | PMO控制中心 | 例外池、治理节奏、资源容量、项目规则矩阵、数据质量与治理动作 |
| P21 | 汇报、会议与统一决策中心 | 冻结汇报、会议结论、决策包、委员会、证据补正、SLA升级、下行回执与效果复核 |
| P22 | 业财经营与收益闭环 | 合同/成本/回款/现金/毛利、收益基线、收益复核、场景影响包、退出门禁 |
| P23 | 角色化 AI 助理 | 角色上下文、建议生成、主动扫描、建议执行预览、域对象草稿边界、效果评价 |
| P24 | 收尾与知识复用 | 收尾评估、运营/财务/知识交接、复盘知识候选、知识自动化和订阅影响 |
| P25 | 运营中心、加密与黄金链验收 | 运营中心、用户敏感配置加密、企业能力门禁、五条黄金链结构化验收 |

## 2. 核心页面入口

| 页面 | 路径 | 角色 |
|---|---|---|
| 角色助理 | `/role-assistant` | PM、运营、PMO |
| PM/运营业务助理 | `/business-assistant` | PM、运营 |
| 运营闭环 | `/business-assistant/operations-loop` | 运营、PMO |
| 经营财务 | `/business-finance` | 运营、PMO、CEO |
| PMO控制中心 | `/pmo/control-center` | PMO |
| 决策中心 | `/decision-center` | PMO、CEO、委员会 |
| 项目360 | `/projects/[id]` | PM、PMO、CEO |
| 项目生命周期 | `/projects/[id]/lifecycle` | PM、PMO |
| 项目影响包 | `/projects/[id]/impact-packages` | PMO、CEO |
| 协同收件箱 | `/collaboration-inbox` | 全角色 |
| 运营中心 | `/operations-center` | PMO、管理员 |
| 黄金链验收 | `/operations-center/golden-chains` | PMO、管理员 |
| 收尾知识 | `/closure-knowledge` | PM、PMO |
| 复盘知识 | `/closure-knowledge/retrospective` | PM、PMO |
| 管理模型配置 | `/admin/operating-model` | 管理员 |
| 项目身份治理 | `/admin/operating-model/project-identities` | 管理员/PMO |
| 安全中心 | `/admin/security` | 管理员 |

## 3. 核心 API

### P17-P20 经营治理与PMO控制

| API | 方法 | 用途 |
|---|---|---|
| `/api/context/current` | GET/POST | 当前组织、主体、业务角色、数据分类上下文 |
| `/api/admin/operating-model` | GET/POST | 业务角色、组织、组合、项目、规则、汇报关系配置 |
| `/api/admin/operating-model/project-identities` | GET/POST | 项目身份导入、预览、冲突隔离、切换 |
| `/api/projects/[id]/360` | GET | 项目360聚合视图 |
| `/api/projects/[id]/impact-packages` | GET/POST | 项目影响包读取与处理 |
| `/api/projects/[id]/lifecycle` | GET | 生命周期对象与状态 |
| `/api/projects/[id]/lifecycle/evidence` | POST | 登记生命周期证据 |
| `/api/projects/[id]/lifecycle/evidence/[evidenceId]/verify` | POST | 人工验证证据 |
| `/api/projects/[id]/lifecycle/transitions` | POST | 生命周期状态变更 |
| `/api/management/signals` | GET/POST | 管理信号列表与创建 |
| `/api/management/signals/scan` | POST | 规则化主动扫描 |
| `/api/management/signals/[id]/actions/[actionId]` | POST | 信号行动处理 |
| `/api/pmo/control-center` | GET/POST | PMO例外、容量、治理节奏和质量动作 |

### P21 汇报、会议与决策

| API | 方法 | 用途 |
|---|---|---|
| `/api/reporting/snapshots` | GET/POST | 汇报快照创建、冻结、版本化 |
| `/api/governance/meetings` | GET/POST | 会议实例、议题、结论和输出材料 |
| `/api/decisions` | GET/POST | 决策包列表和创建 |
| `/api/decisions/[id]` | GET/POST | 决策动作、证据、回执、复核 |
| `/api/decisions/committees` | GET/POST | 决策委员会创建和成员绑定 |
| `/api/cron/decision-sla` | GET | 决策SLA升级，仅生成个人飞书待确认队列；需要 `Authorization: Bearer <CRON_SECRET>` |
| `/api/cron/evidence-expiry` | GET | 证据过期恢复与重开；需要 `Authorization: Bearer <CRON_SECRET>` |
| `/api/cron/operating-calendar` | GET | 运营日历物化；需要 `Authorization: Bearer <CRON_SECRET>` |

### P22-P25 业财、AI、知识与验收

| API | 方法 | 用途 |
|---|---|---|
| `/api/business-finance` | GET/POST | 合同、成本、现金、毛利和收益复核 |
| `/api/business-assistant` | GET | PM/运营事实视图 |
| `/api/business-assistant/change-drafts` | GET/POST | 业务变更草稿 |
| `/api/business-assistant/change-drafts/[id]` | GET/POST | 草稿决策、确认、取消 |
| `/api/business-assistant/operations-loop` | GET/POST | 验收、开票、应收、回款闭环 |
| `/api/role-assistant` | GET/POST | 角色化AI建议、执行预览、评价 |
| `/api/closure-knowledge` | GET/POST | 收尾评估与知识候选 |
| `/api/closure-knowledge/automation` | POST | 知识自动化、订阅、影响 |
| `/api/operations-center` | GET | 运营中心能力门禁 |
| `/api/operations-center/golden-chains` | GET/POST | 黄金链验收运行与步骤状态 |
| `/api/user/ai-settings` | GET/POST | 用户级AI配置，密文存储 |
| `/api/user/feishu-connection` | GET/POST | 用户级飞书配置，密文存储 |
| `/api/integrations/feishu/actions/confirmations/[id]/confirm` | POST | 人工确认后执行飞书动作 |

## 4. 数据库执行顺序

生产 Supabase 必须先具备历史脚本，再执行 P17-P25 新迁移。建议顺序：

```text
supabase-schema.sql
supabase-v522-user-config.sql
supabase-v527-integration-sync-logs.sql
supabase-v529-governance-workflows.sql
supabase-v530-issue-change-action-chain.sql
supabase-v531-ai-evidence-audit.sql
supabase-v5313-migration-batches.sql
supabase-v5316-migration-remediation-actions.sql
supabase-v5317-migration-remediation-feishu-sync.sql
supabase-v5318-migration-field-mapping-profiles.sql
supabase-v5330-risk-retrospective-assets.sql
supabase-v5331-risk-retrospective-knowledge-sync.sql
supabase-v5332-risk-retrospective-value.sql
supabase-v5334-risk-retrospective-governance.sql
supabase-v5338-risk-retrospective-governance-followups.sql
supabase-v534-enterprise-security.sql
supabase-v5344-risk-retrospective-governance-operations.sql
supabase-v5347-knowledge-governance-evidence-chain.sql
supabase-v5349-feishu-action-confirmations.sql
supabase-v5352-knowledge-lifecycle.sql
supabase-v5354-knowledge-governance-operations.sql
supabase-v5355-v5358-knowledge-reference-template-audit.sql
supabase-v536-security-ops.sql
supabase/migrations/20260710052329_p17_s1_operating_foundation.sql
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

关键依赖说明：

- `supabase-v534-enterprise-security.sql` 必须早于 P17 执行，否则会缺少 `user_project_access_grants`。
- `supabase-v5349-feishu-action-confirmations.sql` 必须早于 P21 SLA 升级执行，否则不能生成飞书待确认队列。
- `supabase/migrations/20260710071709_p25_encrypt_user_credentials.sql` 执行后，应用需要 `CREDENTIAL_ENCRYPTION_KEY` 或 `AUTH_SESSION_SECRET` 才能读写用户密钥。
- P21 hardening 会使用 `pgcrypto` 的 `digest`，Supabase 中必须允许 `pgcrypto` extension；本地 PGlite 干跑使用 stub 替代。
- Vercel Hobby 计划只允许每日 Cron；`/api/cron/decision-sla` 当前部署配置为每日一次。若需要 15 分钟级 SLA，请使用外部调度器以 GET 方式携带 `Authorization: Bearer <CRON_SECRET>` 调用同一 API。

## 5. 环境变量

生产至少确认：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
AUTH_REQUIRED=true
AUTH_SESSION_SECRET
CRON_SECRET
CREDENTIAL_ENCRYPTION_KEY
CREDENTIAL_ENCRYPTION_KEY_VERSION=1
MINIMAX_API_KEY
MINIMAX_MODEL=MiniMax-M3
```

飞书可使用全局配置作为默认，但个人飞书优先：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_BASE_TOKEN
FEISHU_PROJECT_TABLE_ID
FEISHU_MILESTONE_TABLE_ID
FEISHU_TASK_TABLE_ID
FEISHU_RISK_TABLE_ID
FEISHU_CONTRACT_TABLE_ID
FEISHU_PAYMENT_TABLE_ID
FEISHU_COST_TABLE_ID
FEISHU_SYNC_LEDGER_TABLE_ID
```

注意：任何 API Key、App Secret、Service Role Key 不得写入文档和前端日志。

## 6. 本地验证证据

2026-07-11 本地验证结果：

```text
npm run lint
结果：通过，0 error，25 warning

npx tsc --noEmit --pretty false
结果：通过

npm run build
结果：通过，Next.js 生成 174 个路由

npx --yes tsx --test --test-concurrency=1 tests/*.test.ts
结果：294/294 通过

SQL干跑
顺序：supabase-schema.sql + supabase-v*.sql + supabase/migrations/*.sql
结果：44/44 文件通过
说明：PGlite 本地干跑对 pgcrypto/uuid/vector 使用 stub；生产 Supabase 使用原生扩展。
```

## 7. 生产发布状态与剩余待办

已完成：

1. Vercel Production 已补齐关键环境变量：`CRON_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、`CREDENTIAL_ENCRYPTION_KEY_VERSION`。
2. 代码版本已发布为 `6.0.0`。
3. Git Tag 已推送：`v6.0.0`。
4. GitHub Release 已创建：`https://github.com/Allen-cy/AI-PM/releases/tag/v6.0.0`。
5. Vercel Production 已部署：
   - 生产域名：`https://pmai.chunyu2026.qzz.io`
   - 部署 URL：`https://ai-pm-system-akn712ec8-chongzhengchais-projects.vercel.app`
   - 部署 ID：`dpl_487W8e15yLu1wbw2gFu2zAwRumaT`
6. 线上匿名冒烟已验证：
   - 首页按预期跳转登录页。
   - `/auth/login` 返回 200。
   - `/api/auth/me` 未登录返回 `UNAUTHORIZED`。

剩余待办：

1. Supabase Production 按第 4 节顺序执行/确认未执行 SQL。本会话内直接 SQL 执行被 Supabase MCP 权限拒绝，因此不能替代人工确认。
2. 使用真实管理员账号完成冒烟验收：
   - 登录后看到用户中心而非登录按钮。
   - 用户 AI/飞书配置可保存和测试。
   - 项目台账从飞书拉取真实数据，不用样例伪装。
   - PM/运营业务助理能读取业务上下文。
   - PMO控制中心能显示真实例外/数据质量/治理动作。
   - 决策中心能创建/推进决策包，SLA cron 不直接发送飞书，只生成确认队列。
   - 运营中心黄金链能创建验收 run，并按步骤推进。
3. 飞书写入动作必须全部经过待确认队列；不得静默写入业务表。

## 8. 2026-07-11 追加完成审计

详见 `docs/p17-p25-completion-audit-2026-07-11.md`。

追加验证结果：

- `npm run lint -- --quiet`：通过。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run build`：通过，生成 174 个路由。
- `npx --yes tsx --test --test-concurrency=1 tests/*.test.ts`：294/294 通过。
- Vercel Production 关键环境变量名存在。
- 生产部署 `dpl_487W8e15yLu1wbw2gFu2zAwRumaT` 状态 Ready。
- 生产匿名访问：`/` 跳转登录页，`/auth/login` 返回 200，`/api/auth/me` 返回 401。
- P17-P25 关键 API 未登录均返回 401。
- Cron 路由使用 GET 且未授权均返回 401。
- `POST /api/auth/bootstrap-admin` 返回 `admin_exists`，说明生产认证存储可用且管理员已存在。

仍未被本会话证明：

- Supabase Production 表/函数实际落库状态。Supabase MCP 当前无权限，Vercel CLI 不能把敏感 Production 变量提供给本地子进程做 Service Role 只读验证。
- 真实管理员登录态业务冒烟。
- 真实飞书写回与真实业务数据闭环。

## 9. 2026-07-11 v6.0.6 生产审计与必执行修复 SQL

已发布：

- GitHub Release：`https://github.com/Allen-cy/AI-PM/releases/tag/v6.0.6`
- Vercel Production：`dpl_A1B6HegpKmmSCqnK7zkLiTV3cz9M`
- 生产域名：`https://pmai.chunyu2026.qzz.io`

本地验证：

```text
npm run lint -- --quiet：通过
npx tsc --noEmit --pretty false：通过
npx --yes tsx --test --test-concurrency=1 tests/*.test.ts：294/294 通过
npm run build：通过，生成 175 个路由
```

线上严格审计：

- 基础环境：通过，`AUTH_REQUIRED=true`，MiniMax-M3 已配置，凭据加密变量已配置。
- 关键表探测：41/41 通过。
- 管理员账号：存在、active、密码校验通过。
- 飞书全局配置：健康检查 `ok`。
- 用户飞书配置读取：v6.0.6 已兼容 legacy 表结构，`GET /api/user/feishu-connection` 返回 200。
- 剩余问题：`GET /api/context/current` 仍返回 `P17_STORAGE_NOT_CONFIGURED`，具体为 Supabase PostgREST schema cache 中找不到 `public.user_business_roles`。

需要在 Supabase SQL Editor 执行：

```text
supabase/migrations/20260711102000_p17_p25_production_repair.sql
```

该脚本是幂等修复脚本，会：

1. 补齐 `user_feishu_connections` 的 P25 加密字段。
2. 补齐 `user_feishu_connections` 的 P21 飞书通知接收字段。
3. 为 active admin 用户补默认组织级 `pm`、`operations`、`pmo`、`ceo` 业务角色。
4. 建立默认组织级 `PM/运营 -> PMO -> CEO` 汇报关系。
5. 执行 `notify pgrst, 'reload schema';`，刷新 Supabase PostgREST schema cache。

执行后重新访问：

```text
GET https://pmai.chunyu2026.qzz.io/api/internal/p17-p25-audit
Header: x-audit-token: <P17P25_AUDIT_TOKEN>
```

期望：

- `/api/context/current` 返回 200。
- `/api/user/feishu-connection` 返回 200。
- `storageCompatibility.user_feishu_connections_base_columns` 通过。
- 如通知字段已补齐，`storageCompatibility.user_feishu_connections_notification_columns` 也通过。
