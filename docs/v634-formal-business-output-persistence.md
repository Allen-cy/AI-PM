# AI-PMO V6.3.4 正式汇报与业务成果持久化契约

- 版本：V6.3.4
- 日期：2026-07-15
- 状态：生产数据库、代码发布与线上验收已完成
- 边界：正式业务成果只以 Supabase 为权威历史；浏览器 `localStorage` 不再保存报告历史

## 1. 业务目标

V6.3.4 把“生成一段文字”改为“生成一份可提交、可审核、可发布、可追溯的业务成果”。报告、会议纪要、迁移评审、迁移批次对比、Go/No-Go 决策包和已发布知识资产共用同一套治理字段：

- `org_id / subject_scope / subject_id / project_id`
- `business_role / data_class`
- `output_key / idempotency_key`
- `version / state_version / content_hash`
- `source_definition / source_snapshot_at`
- 关联汇报快照、治理会议、迁移批次和知识条目

## 2. 数据模型

### `formal_business_outputs`

保存完整 Markdown/结构化成果。同一 `output_key` 修订时生成新 `version`，旧版标记为 `superseded`，不物理删除。状态为：

`draft → submitted → approved → published → archived`

已有新修订时，上一版进入 `superseded`。归档要求填写理由；批准、发布、归档仅 PMO/质量角色可执行。

### `formal_business_output_events`

保存创建、提交、批准、发布、归档和被新版取代事件。表层开启 RLS，并通过数据库触发器禁止 UPDATE/DELETE，保持追加式审计链。

## 3. 原子事务

| 函数 | 用途 | 关键门禁 |
|---|---|---|
| `save_v634_formal_output_tx` | 留存通用正式成果 | 范围、数据空间、角色、项目 UUID、来源、幂等、期望版本 |
| `save_v634_report_output_tx` | 同一事务内创建报告正文与 `reporting_snapshots` | 任一一步失败则全部回滚 |
| `transition_v634_formal_output_tx` | 成果状态变更 | 业务角色、当前状态、`state_version`、原因 |

会议纪要在 `record_governance_meeting_outcome_tx` 更新 `governance_meetings.minutes` 的同一事务内自动生成 `meeting_minutes` 成果。收尾知识经人工审核发布后，同一事务生成 `knowledge_asset` 成果。AI 不代替会议结论录入和知识发布审批。

## 4. 接口

### `GET /api/formal-outputs`

按当前组织、业务对象、项目、角色和数据空间读取成果。可重复传入 `output_type`。

### `POST /api/formal-outputs`

- `action=create`：强制 `idempotency_key` 和 `expected_version`。
- `action=submit|approve|publish|archive`：强制当前 `expected_version`（对应 `state_version`）。

### `GET/POST /api/reports`

- GET 从 `formal_business_outputs` 读取正式历史。
- POST 只允许 PM、运营、PMO；先读取当前授权飞书事实与风险/业财事实，再同一事务创建完整报告与汇报快照。
- 当前范围没有已归类、已映射、可访问项目时返回 `REPORT_SCOPE_EMPTY`，不以“0项目”伪造正式报告。

### 迁移报告

`/api/migration/report`、`/api/migration/batch-comparison/report`、`/api/migration/cutover-decision/report` 在生产模式下必须先持久化成果，然后返回下载；失败时不伪造已留档。响应头返回 `X-Formal-Output-Id` 和 `X-Output-Version`。

## 5. 安全与生产数据库证据

生产库 `nxhvzfsuzelnxbrrglxk` 已应用：

1. `20260715201000_v634_formal_business_outputs.sql`
2. `20260715203000_v634_security_posture_repair.sql`
3. `20260715204000_v634_knowledge_data_class_guard.sql`

验收结果：

- 2 张表均开启 RLS。
- `PUBLIC / anon / authenticated` 表权限计数为 0。
- 三个事务函数、三个触发器均存在。
- 旧复盘知识缺少 `data_class` 时从稳定项目读取真实分类；显式分类与项目冲突时拒绝发布，不默认提升为 `production`。
- `audit_v61_database_security()` 违规数为 0。
- Supabase Security Advisor：ERROR 0；WARN 6 均为既有基线（5 个旧函数 `search_path`、1 个 public extension）；V6.3.4 新增 WARN 0。两条 V6.3.4 INFO 为“RLS 开启但无客户端策略”，符合仅服务端访问设计。
- 已在回滚事务中验证：报告+汇报快照原子创建、状态提交、事件追加和事件修改拒绝。回滚后生产业务数据仍为 0 条新成果。

## 6. 当前真实数据前置

生产库当前 `projects=0`，原因是 V6.2 首次飞书对账读取到的记录没有明确归类为 `production`，已按安全策略进入隔离队列，未冒充正式项目。因此项目级报告页面会如实显示无可选项目。这是真实运行前置，必须通过飞书中文字段“数据分类”和项目身份治理解决，不得写入演示项目绕过。

## 7. 回滚

代码回滚只切回旧读路径，不删除两张新表、不删除已生成成果、不改写事件。数据库迁移已登记为应用，禁止修改或重跑；后续修复必须新增 migration。

## 8. 下一波次

V6.4.0 将在这套正式成果台账之上重组 PM、运营、PMO、CEO 工作台与统一收件箱，并把责任人、项目、证据、审批人全部替换为真实选择器。

## 9. 发布门禁与线上验收

- 自动化测试：394/394 通过。
- TypeScript：通过。
- ESLint：0 error；13 条既有 warning，V6.3.4 新增 warning 0。
- Next.js 生产构建：180 路由通过。
- 生产域名：`https://pmai.chunyu2026.qzz.io`。
- `GET /api/version`：200，版本 `6.3.4`。
- `GET /api/formal-outputs`（未登录）：401。
- `GET /api/reports`（未登录）：401。
- `GET /reports`（未登录）：307 转登录页。
