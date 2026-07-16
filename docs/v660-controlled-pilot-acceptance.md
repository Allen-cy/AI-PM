# V6.6 全模块受控试点验收说明

版本：6.6.4
状态：技术验收候选已实现；正式受控试点必须由真实人员完成  
数据库迁移：`20260716040000_v660_controlled_pilot_acceptance.sql`、`20260716123000_v663_formal_pilot_identity_evidence_guard.sql`、`20260716124000_v663_account_kind_change_guard.sql`

V6.6.1 修复首次打开验收台时业务上下文尚未完成加载而产生的错误空态。上下文栏会广播首次解析结果，页面也会主动读取服务端当前上下文并显示初始化状态；数据库对象和正式试点门禁不变。

V6.6.2 进一步禁止活动汇报关系由同一用户同时承担上下游角色。旧自循环关系只暂停、不删除；数据库约束和管理员接口共同阻止再次创建，四角色测试账号与正式试点的职责分离门禁保持一致。

V6.6.3 将用户账号分类固化为数据库权威属性，正式试点只接受 `real_user`，技术演练只接受 `test_account`；同一账号不能在同一批次承担多个角色。飞书确认必须执行成功、绑定稳定项目且该项目已进入当前批次，历史无项目范围回执只保留为审计记录，不能作为试点证据。

V6.6.4 新增飞书隔离分类治理台和正式试点启动包。系统逐条解释为什么记录被隔离，并只在飞书显式标记“正式”时认可 production 候选；带样例/测试标记和未知记录不会自动提升。启动包可以在尚未创建正式批次时导出当前差距和操作顺序。

## 1. 业务目标

V6.6 不再用“页面存在”判断系统是否可推广，而是要求 PM、运营、PMO、CEO 围绕真实项目完成输入、处理、审批、外部协同、回执和效果复核。验收分成两条互不替代的路径：

- 技术演练：只允许 `test` 数据和四个不同测试账号，用于证明权限、状态机、并发、证据和恢复契约可以运行。
- 正式试点：只允许 `production` 数据，必须由四位不同真实人员本人签署；测试账号、管理员代签和系统任务代签均不能通过。

## 2. 正式通过条件

正式试点只有同时满足以下条件才能由 CEO 执行“正式通过”：

1. 至少 5 个不同的 `production` 项目。
2. PM、运营、PMO、CEO 由 4 个不同真实账号承担。
3. 四个角色分别登录并本人签署验收声明。
4. 16 个模块检查均为通过，且每项至少有一条证据。
5. 黄金链 A“延期→经营影响→PMO→CEO→行动→效果”和黄金链 E“收尾→验收/财务关闭→复盘→知识发布复用”均已在 P25 正式通过。
6. 飞书消息、任务、智能表记录更新三类确认均真实执行成功。
7. 至少一条智能表写回经历实际失败，并通过第二次或后续受控尝试恢复成功。

技术演练可达到 `technical_ready`，但永远不会产生 `formal_passed=true`。

## 3. 页面与操作路径

- 运营中心：`/operations-center`
- 五条黄金链路验收：`/operations-center/golden-chains`
- V6.6 受控试点验收：`/operations-center/pilot-acceptance`
- 飞书人工确认：`/integration-center`
- 飞书隔离数据分类治理：`/integration-center/data-governance`

PMO 创建验收批次并绑定项目、角色；各角色切换到本人业务身份后签署和提交模块证据；PMO 关联黄金链与飞书回执；正式试点完成后由 PMO 提交终验，CEO 最终确认。用户通过业务名称选择项目和人员，不填写 UUID 或 JSON。

正式试点页面顶部提供启动检查，分别显示 production 项目数量、四个角色与四位不同真实用户的最大匹配数、黄金链 A/E 和三类飞书写入准备度，并提供项目/角色、黄金链和飞书配置的直接入口。启动检查只帮助补齐条件，不替代本人签署或真实外部写入。

## 4. API 契约

### 4.1 读取与报告

`GET /api/operations-center/pilot-acceptance`

查询参数必须包含：

- `role`
- `org_id`
- `subject_scope`
- `subject_id`
- `data_class`
- 可选 `run_id`

响应包含 `status、request_id、context、source、data_class、generated_at、warnings、data`。`data` 包含批次、当前验收包、16模块定义，以及项目、角色、黄金链和飞书确认候选。

下载 Markdown 报告：

`GET /api/operations-center/pilot-acceptance?...&run_id=<批次>&format=markdown`

下载正式试点启动包（无需先创建批次，仅组织级 PMO）：

`GET /api/operations-center/pilot-acceptance?...&format=startup-pack`

### 4.2 创建批次

`POST /api/operations-center/pilot-acceptance`

```json
{
  "operation": "create",
  "mode": "technical_rehearsal",
  "name": "V6.6全模块技术演练",
  "objective": "验证全模块闭环",
  "idempotency_key": "稳定请求键"
}
```

只有 PMO 可创建。`technical_rehearsal` 必须配合 `test`；`formal_pilot` 必须配合 `production`。

### 4.3 修改批次

所有修改必须包含：

```json
{
  "operation": "add_project",
  "run_id": "批次标识",
  "expected_version": 1,
  "idempotency_key": "稳定请求键",
  "payload": {}
}
```

支持的 `operation`：

- `add_project`
- `bind_participant`
- `record_module_check`
- `link_golden_chain`
- `link_feishu_confirmation`
- `self_signoff`
- `transition`

版本冲突返回 HTTP 409；跨组织、跨项目、跨数据空间和角色越权均拒绝。本人签署以当前登录用户和当前业务角色为准，不接收代签用户参数。

### 4.4 飞书试点动作

`POST /api/integrations/feishu/actions/confirmations`

从受控试点创建消息或任务确认时，必须同时提交并校验 `business_context`。确认记录持久化 `org_id、project_id、data_class`，只有人工确认并真实执行成功后才会出现在试点证据候选中。通用 token 动作和历史无范围确认不具备试点证据资格。

## 5. 数据库对象

- `controlled_pilot_runs`
- `controlled_pilot_projects`
- `controlled_pilot_participants`
- `controlled_pilot_module_checks`
- `controlled_pilot_golden_chains`
- `controlled_pilot_feishu_evidence`
- `controlled_pilot_events`
- `feishu_confirmation_attempt_events`

核心函数：

- `create_v660_controlled_pilot_tx`
- `mutate_v660_controlled_pilot_tx`
- `evaluate_v660_controlled_pilot`
- `capture_v660_feishu_attempt_event`
- `prevent_v660_pilot_event_mutation`
- `enforce_v663_pilot_participant_identity`
- `enforce_v663_pilot_feishu_project_scope`

所有新表启用 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 直接权限；函数只允许 `service_role` 执行。试点事件和飞书尝试事件只能追加，不能更新或删除。

`app_users.account_kind` 是试点身份判断的权威字段，可取 `real_user、test_account、service_account`。数据库触发器独立拒绝正式试点使用测试/服务账号，也拒绝技术演练使用真实账号。参与人表对 `(run_id,user_id)` 建立唯一索引，保证同一账号不能在同一批次承担多个角色。

## 6. 生产数据库证据

迁移已登记为 `20260716040000`。审计结果：

- 8/8 新表 RLS 已开启。
- 客户端表授权 0。
- 客户端函数执行授权 0。
- 5/5 核心函数存在。
- 3/3 保护触发器存在。
- 全库 `audit_v61_database_security()` 违规 0。

已在 `test` 空间建立技术演练候选，绑定 5 个隔离测试项目和 4 个不同测试角色。417/417 自动化测试、TypeScript、全仓 Lint（0错误，15条既有警告）、189/189 静态页面生产构建和数据库安全审计形成 16/16 模块技术证据。生产库已登记 47 份迁移，现有 221 张表、259 个函数名、88 个触发器和 713 个索引，安全审计违规为 0。当前未自动完成本人签署、黄金链 A/E 或飞书真实回执，所以数据库如实返回阻断项，不将候选伪装为技术就绪或正式通过。

## 7. 发布边界

V6.6.4 可以作为全模块技术验收候选发布。只有真实受控试点达到正式条件后才允许发布 V7.0；如果试点发现问题，只发布 V6.6.x 修复版本。原始知识资料和 215 组故意保留的冗余不删除、不改写。
