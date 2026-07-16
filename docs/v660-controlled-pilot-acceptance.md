# V6.6 全模块受控试点验收说明

版本：6.6.1
状态：技术验收候选已实现；正式受控试点必须由真实人员完成  
数据库迁移：`20260716040000_v660_controlled_pilot_acceptance.sql`

V6.6.1 修复首次打开验收台时业务上下文尚未完成加载而产生的错误空态。上下文栏会广播首次解析结果，页面也会主动读取服务端当前上下文并显示初始化状态；数据库对象和正式试点门禁不变。

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

PMO 创建验收批次并绑定项目、角色；各角色切换到本人业务身份后签署和提交模块证据；PMO 关联黄金链与飞书回执；正式试点完成后由 PMO 提交终验，CEO 最终确认。用户通过业务名称选择项目和人员，不填写 UUID 或 JSON。

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

所有新表启用 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 直接权限；函数只允许 `service_role` 执行。试点事件和飞书尝试事件只能追加，不能更新或删除。

## 6. 生产数据库证据

迁移已登记为 `20260716040000`。审计结果：

- 8/8 新表 RLS 已开启。
- 客户端表授权 0。
- 客户端函数执行授权 0。
- 5/5 核心函数存在。
- 3/3 保护触发器存在。
- 全库 `audit_v61_database_security()` 违规 0。

已在 `test` 空间建立技术演练候选，绑定 5 个隔离测试项目和 4 个不同测试角色。413/413 自动化测试、TypeScript、全仓 Lint、189/189 静态页面生产构建和数据库安全审计形成 16/16 模块技术证据。当前未自动完成本人签署、黄金链 A/E 或飞书真实回执，所以数据库如实返回阻断项，不将候选伪装为技术就绪或正式通过。

## 7. 发布边界

V6.6.1 可以作为全模块技术验收候选发布。只有真实受控试点达到正式条件后才允许发布 V7.0；如果试点发现问题，只发布 V6.6.x 修复版本。原始知识资料和 215 组故意保留的冗余不删除、不改写。
