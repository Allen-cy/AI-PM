# V6.6.6 飞书数据分类受控写回闭环

## 目标

V6.6.4 已能给出逐条分类建议和 CSV，但业务人员仍需离开系统进入飞书手工定位记录，操作结果也没有进入统一确认、审计和恢复链。V6.6.6 在不降低外部写入门禁的前提下补齐：

`隔离记录 → PMO选择分类并填写依据 → 原子创建分类草稿与飞书确认 → 二次确认 → 当前值复核 → 同步流水占位 → Base写回 → 重新对账`。

## 业务规则

1. 只有组织级有效 PMO 可以创建分类决定。
2. 分类只能是正式、样例、测试、诊断，飞书字段固定为中文“数据分类”。
3. 选择正式必须显式承担分类责任；源载荷存在样例或测试标记时，前端、API和数据库均拒绝。
4. 创建草稿不执行飞书写入；确认队列保持高风险并要求二次风险确认。
5. 写回使用申请人的个人飞书连接，不回退到管理员或组织共享身份。
6. 写回前重新读取飞书当前值；当前值变化时返回冲突，不覆盖他人更新。
7. 分类写回不携带、创建或猜测 `project_id`。只有后续目标数据空间对账通过后，项目身份才进入稳定镜像。

## 接口

### 查询治理清单

`GET /api/integrations/feishu/quarantine-governance`

每条记录新增 `classificationDraft`。活动草稿存在时返回状态、目标分类、确认ID和错误码，页面刷新后不会重复提交。

### 创建分类写回确认

`POST /api/integrations/feishu/quarantine-governance`

请求必须带组织级 PMO 业务上下文，正文：

```json
{
  "quarantine_id": "稳定隔离记录ID",
  "target_data_class": "production|sample|test|diagnostic",
  "reason": "人工分类依据",
  "production_acknowledged": false
}
```

成功返回 HTTP 202、`confirmation_required=true`、分类草稿及确认队列入口。接口内没有飞书 `updateRecord` 调用。

### 最终确认和取消

- `POST /api/integrations/feishu/actions/confirmations/{id}/confirm`
- `POST /api/integrations/feishu/actions/confirmations/{id}/cancel`

确认路由根据 `classification_draft_id` 进入专用执行器；原有 `business_update_draft_id` 流程保持兼容。

## 数据库

Migration：`20260716152000_v666_data_classification_writeback.sql`

- `feishu_data_classification_drafts`：保存组织、隔离记录、稳定飞书记录ID、分类决定、依据、状态、确认、版本、租约和结果。
- `create_v666_data_classification_draft_tx`：原子创建草稿与确认队列并执行PMO/样例门禁。
- `claim_v666_data_classification_writeback_tx`：校验身份与关联，获取五分钟写回租约和栅栏令牌。
- `finalize_v666_data_classification_writeback_tx`：原子完成或失败；成功时关闭本次分类隔离项并明确等待目标空间重新对账。
- `cancel_v666_data_classification_writeback_tx`：取消草稿和确认，保留审计历史。

生产应用证据：48份migration完整；新增表RLS开启，`PUBLIC/anon/authenticated`直接授权0；4个函数仅`service_role`可执行；`audit_v61_database_security()`为0。

## 验收边界

事务烟测使用现有带样例标记的隔离记录，在数据库事务内验证“归入正式”被 `V666_SAMPLE_TO_PRODUCTION_FORBIDDEN` 阻断；合法样例分类完成草稿、确认、claim、finalize和隔离关闭，随后整体回滚，生产测试草稿与确认为0。

本版本没有替用户对237条记录做分类，没有外部写回飞书，也没有把样例记录变成正式项目。正式试点仍需真实数据负责人、四位真实角色和CEO完成相应确认。
