# P21 汇报、会议与统一决策中心实施规格

## 目标

把汇报快照、会议结论、正式决策、下行行动、接收回执和效果复核组成可持久化、可审计的业务闭环，同时严格遵循 `org_id + subject_scope + subject_id + data_class` 隔离。

## 状态机

- 汇报：`draft -> submitted -> returned -> submitted -> frozen -> superseded`。退回必须记录原因和补正截止时间；冻结后不得原地修改，只能生成新版本。
- 会议：`scheduled -> agenda_frozen -> in_progress -> minutes_pending -> actions_pending -> effect_review -> closed`，另有 `cancelled/postponed`。取消、延期和代理出席必须有原因、时间与授权。
- 决策：`draft -> evidence_required <-> pending_decision -> decided -> translated -> executing -> effect_review -> closed -> reopened`。请求补证、拒绝承接、委员会弃权、超时升级和重新打开均必须写事件。

## 标准决策类型

支持 `continue`、`accelerate`、`downgrade`、`pause`、`terminate`、`resource_adjustment`、`risk_acceptance`、`evidence_request` 八类。每类由版本化定义给出：

1. 必需输入字段。
2. 可决策角色与决策层级。
3. 标准下行行动模板。
4. 效果复核指标。
5. 撤销/重新打开条件。

## 业务规则

- 例会决策必须关联已冻结会议或已冻结汇报；紧急决策必须填写触发事件并使用版本化 SLA。
- 个人决策只能由目标决策人、有效限时代理人或指定委员会处理。代理、回避、拒绝和弃权均保留审计证据。
- 会议每条结论必须三选一：生成决策包、生成统一行动项，或明确标记无需处理并填写理由。
- 决策转译必须按类型模板生成行动；所有接收人完成回执、证据、效果复核前不得关闭。
- SLA 处理作业只生成持久化升级记录和审计事件，不伪造飞书消息已发送。

## 验收

- 状态机对非法跳转显式拒绝。
- 会议输出在单一数据库事务内生成决策/行动/复审计划或无需处理记录。
- 八类决策的输入、下行模板、复核指标和撤销条件可追溯到定义版本。
- 所有列表与动作都按组织、主体和数据分类隔离；新表开启 RLS，只由服务端 `service_role` 访问。
- 单元/结构测试、全量测试、lint 和构建通过；真实 Supabase/飞书联调另需部署环境凭据。
