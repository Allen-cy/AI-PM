# V6.5.0 跨角色、飞书、AI 与知识闭环实施说明

日期：2026-07-15  
版本：6.5.0  
状态：功能与生产数据库迁移完成，发布门禁执行中

## 1. 业务闭环

跨角色流转按以下状态运行：

`submitted_to_pmo → pmo_reviewed → report_frozen → decision_submitted → decision_made → action_dispatched → receipt_acknowledged → effect_reviewed → closed`

- PM 或运营录入变化、经营影响、责任 PMO、截止日期和证据。
- PMO 人工复核，并选择已生成的正式汇报快照冻结输出。
- PMO 提交决策事项，CEO 人工记录决策。
- PMO 下发责任到人、有 deadline 的行动；PM/运营提交执行回执。
- PMO 复核效果，CEO 关闭业务事项。

AI 可以分析和建议，但信息源、复核、审批、决策、回执和关闭均由真实用户完成。

## 2. 一致性、幂等与并发

- 创建与状态迁移通过数据库事务函数完成，领域记录和 `business_events` 同时成功或同时失败。
- `business_events` 只允许追加，数据库触发器拒绝更新和删除。
- 写入要求 `org_id、subject_scope、subject_id、business_role、data_class、idempotency_key、expected_version`。
- 重放相同幂等键返回已有结果；期望版本落后时返回 `409`，不覆盖新版本。
- 角色 AI 扫描计划和组织飞书配置同样执行幂等重放与乐观锁。

## 3. 飞书身份边界

| 使用场景 | 身份来源 | 失败策略 |
|---|---|---|
| 共享项目 Base 读取与八类对账 | 当前组织加密连接；兼容已有组织环境配置 | 缺少配置则明确失败 |
| 消息、任务、文档、个人动作 | 当前操作人的个人飞书连接 | 禁止回退到组织或管理员身份 |
| 外部写入 | 当前用户人工确认后执行 | 不允许 AI 静默写入 |

组织连接配置入口为 `/integration-center/organization-feishu`，只允许管理员或当前组织 PMO 管理；接口不返回密钥明文。

## 4. 角色 AI

- 页面：`/role-assistant`
- 定时入口：`GET /api/cron/role-ai-scan`，由 `CRON_SECRET` 保护。
- 支持小时、每日、每周扫描。
- 每次运行重新校验用户状态、业务角色、组织、项目范围和数据分类。
- 事实只来自授权范围的管理信号、风险和行动项。
- 每条建议保留依据、置信度和人工确认状态；执行后可评价效果。
- 规则扫描或模型建议都不自动执行飞书或业务写入。

## 5. 动态知识 RAG

`POST /api/rag/query` 在静态审定语料之外，加载当前上下文内已发布的 `knowledge_items` 和正式 `knowledge_asset`。未发布、跨组织、跨项目、越级数据分类或无权限内容不会进入检索。响应返回动态文档数量、来源、引用和警告；证据不足时继续拒答。

## 6. 数据库迁移

生产 Supabase 已按顺序应用以下增量迁移，历史 SQL 不得重跑：

1. `20260716010000_v650_cross_role_feishu_ai_knowledge.sql`
2. `20260716012000_v650_security_audit_fix.sql`
3. `20260716014000_v650_org_feishu_version.sql`
4. `20260716020000_v650_configuration_idempotency.sql`

新增核心对象：`business_events`、`cross_role_flows`、`cross_role_flow_actions`、`role_ai_scan_schedules`、`organization_feishu_connections`。全部开启 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 的直接表权限，仅服务端受控访问。

## 7. 知识库自动同步

`scripts/sync-ai-pmo-vault-release.mjs` 在发布时同步 AI-PMO-SYS 的 README、STATE、Task_Log、log 和产品版本，并检查发布记录及 215 组故意保留的原始冗余边界。脚本只更新受控状态文档，不删除、不合并、不改写其余原始材料。

## 8. V6.6 验收边界

V6.5 证明工程能力、数据库安全和隔离测试链可运行，不等于真实人员受控试点。V6.6 必须明确区分：

- 系统可自动完成：测试账号隔离、五个测试项目、状态机、接口、权限、数据质量、黄金链演练和失败恢复。
- 必须真实用户完成：四位真实人员登录、业务签字、真实飞书消息/任务/智能表确认写入、真实项目结果与效果复核。
- 未取得真实证据时只标记“技术候选已就绪”，不得宣称 V7.0 正式推广。
