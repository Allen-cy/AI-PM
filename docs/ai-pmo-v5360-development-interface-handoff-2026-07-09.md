# AI-PMO V5.3.60 开发接口交接文档

版本：V5.3.60

日期：2026-07-09

主题：深层输出引用链、业务表单飞书确认入口、治理反写确认、组织级风险治理、迁移规模化准备度

## 1. 本版本结论

V5.3.60 按后续优化计划完成当前建议清单中的收口项：

- P16：知识运营从“问答/报告引用”扩展到治理、风险、规划、迁移、飞书确认和报告深层输出引用链。
- P15-T3：飞书确认队列从“集成中心管理”延伸到治理、风险、迁移等业务表单旁的一键发起确认记录。
- P13：治理结果不静默反写业务表，先形成治理反写确认包和飞书待确认文档。
- P14：风险管理新增组织级治理视图，聚合责任人、deadline、证据缺口、升级规则、报告事实和下一步动作。
- P12：迁移中心新增规模化准备度，把字段映射、试迁移批次、整改行动项和 Go/No-Go 决策合并为迁移门禁。

本版本不新增 SQL。若生产环境已执行 V5.3.49、V5.3.55-V5.3.58 和迁移中心相关 SQL，即可启用持久化能力；未执行时，相关接口会按既有逻辑返回 `not_configured`、`failed` 或降级运行时视图，不阻断原页面基础展示。

## 2. 数据库要求

新增 SQL：

```text
本版本不新增 SQL。
```

继续依赖：

```text
supabase-v5349-feishu-action-confirmations.sql
supabase-v5355-v5358-knowledge-reference-template-audit.sql
```

迁移中心若要显示真实持久化数据，还依赖历史脚本：

```text
迁移批次表相关 SQL
迁移整改行动项相关 SQL
字段映射方案相关 SQL
正式切换 Go/No-Go 决策相关 SQL
```

## 3. 新增和变更文件

| 类型 | 文件 | 说明 |
|---|---|---|
| 知识引用模型 | `src/features/knowledge/deep-output-references.ts` | 生成治理、风险、规划、迁移、飞书、报告六类深层输出引用候选，并支持确认后写入 `knowledge_output_references` |
| 知识引用 API | `src/app/api/knowledge/deep-references/route.ts` | `GET` 获取候选；`POST` 确认写入候选 |
| 知识运营页面 | `src/components/KnowledgeDeepReferenceClient.tsx`、`src/app/knowledge/operations/page.tsx` | 新增“深层输出引用链”操作区域 |
| 飞书确认组件 | `src/components/FeishuActionDraftLauncherClient.tsx` | 通用业务表单旁创建飞书待确认文档入口 |
| 治理确认模型 | `src/features/governance/writeback-confirmation.ts` | 将治理影响包转成治理反写确认包和飞书文档 payload |
| 治理确认 API | `src/app/api/governance/writeback-confirmations/route.ts` | `GET` 预览治理反写确认包；`POST` 创建飞书待确认记录 |
| 治理流程页面 | `src/app/api/governance/workflows/route.ts`、`src/app/governance-workflows/GovernanceWorkflowsClient.tsx` | 治理工作流接口和页面增加反写确认包 |
| 风险组织治理模型 | `src/features/risk/organizational-governance.ts` | 聚合组织级风险规则、责任人统计、报告事实和行动建议 |
| 风险组织治理 API | `src/app/api/risk/organizational-governance/route.ts` | 读取风险登记册和项目台账，返回组织级风险治理视图 |
| 风险页面 | `src/app/risk/page.tsx` | 新增组织级风险治理卡片和飞书确认入口 |
| 迁移规模化模型 | `src/features/migration/scale-readiness.ts` | 聚合字段映射、批次对比、整改行动项和切换决策，形成规模化准备度门禁 |
| 迁移规模化 API | `src/app/api/migration/scale-readiness/route.ts` | 返回指定数据对象的迁移规模化准备度 |
| 迁移页面 | `src/app/migration-center/page.tsx` | 新增迁移规模化准备度卡片和飞书确认入口 |
| 回归测试 | `tests/pmo-operating-system.test.ts` | 新增 V5.3.60 四组模型测试 |

## 4. API：深层输出引用链

### `GET /api/knowledge/deep-references`

用途：预览深层输出引用候选。

返回要点：

```json
{
  "status": "succeeded",
  "deepReferences": {
    "summary": {
      "candidates": 6,
      "autoPersistRecommended": 6,
      "governanceOutputs": 1,
      "riskOutputs": 1,
      "planningOutputs": 1,
      "migrationOutputs": 1,
      "feishuOutputs": 1,
      "reportOutputs": 1
    },
    "candidates": [
      {
        "id": "governance_workflow:governance-business-impact-writeback:KB-xxxx",
        "source": "governance_workflow",
        "outputType": "governance",
        "outputId": "governance-business-impact-writeback",
        "moduleName": "PMO治理中心",
        "pageId": "KB-xxxx",
        "citationText": "深层输出引用说明",
        "autoPersistRecommended": true
      }
    ],
    "boundary": "深层输出引用链只生成来源绑定和审计依据，不替代业务审批。"
  }
}
```

### `POST /api/knowledge/deep-references`

用途：用户确认后，将候选写入 `knowledge_output_references`。

权限：必须登录。

请求：

```json
{
  "confirm": true,
  "candidateIds": [
    "governance_workflow:governance-business-impact-writeback:KB-xxxx"
  ]
}
```

说明：

- `candidateIds` 为空时，写入全部推荐候选。
- 未传 `confirm=true` 返回 400。
- SQL 未执行时返回 503 和对应 migration 提示。
- 写入过程会记录 `knowledge_deep_output_references_persist` 操作审计。

## 5. API：治理反写确认包

### `GET /api/governance/writeback-confirmations`

用途：基于治理流程实例和治理影响包，预览可反写的确认材料。

返回要点：

```json
{
  "status": "succeeded",
  "governance_writeback_confirmation": {
    "summary": {
      "totalPackages": 3,
      "confirmationRequired": 2,
      "highSeverity": 1,
      "projectUpdates": 4,
      "riskUpdates": 2,
      "reportFacts": 6
    },
    "items": [
      {
        "id": "governance-writeback:instance-id",
        "workflowName": "阶段门评审",
        "projectName": "重点项目A",
        "confirmationRequired": true,
        "humanInputs": ["PMO确认治理流程输出是否完整。"],
        "outputArtifacts": ["治理反写确认包", "飞书待确认文档草稿"],
        "feishuDocumentPayload": {
          "type": "document",
          "title": "治理反写确认包-阶段门评审-重点项目A"
        }
      }
    ]
  }
}
```

### `POST /api/governance/writeback-confirmations`

用途：用户确认后，为治理反写包创建飞书待确认记录。

权限：必须登录。

请求：

```json
{
  "confirm": true,
  "itemIds": ["governance-writeback:instance-id"]
}
```

说明：

- `itemIds` 为空时，默认处理所有 `confirmationRequired=true` 的条目。
- 实际飞书写入仍由集成中心确认执行。
- 写入过程会记录 `governance_writeback_feishu_confirmation_create` 操作审计。

## 6. API：组织级风险治理

### `GET /api/risk/organizational-governance`

用途：聚合风险登记册、飞书项目台账和风险联动包，生成组织级风险治理视图。

返回要点：

```json
{
  "status": "succeeded",
  "risk_organizational_governance": {
    "summary": {
      "totalRisks": 12,
      "openRisks": 8,
      "highRisks": 3,
      "overdueRisks": 2,
      "missingOwnerOrDeadline": 1,
      "governanceEscalations": 2,
      "evidenceGaps": 2,
      "reportFacts": 8
    },
    "ownerStats": [
      {
        "owner": "项目经理A",
        "openRisks": 3,
        "highRisks": 1,
        "overdueRisks": 1,
        "missingEvidence": 1,
        "governanceEscalations": 1
      }
    ],
    "rules": [
      {
        "id": "risk-owner-deadline",
        "title": "开放风险必须有责任人和 deadline",
        "status": "待补充",
        "owner": "项目经理",
        "nextAction": "补齐风险责任人、应对责任人、复核日期和行动 deadline。"
      }
    ],
    "reportFacts": [],
    "nextActions": []
  },
  "source": {
    "risk": "supabase",
    "dashboard": "feishu"
  }
}
```

说明：

- 风险读取失败会回退到样例风险并返回 warning。
- 项目台账优先使用当前用户有效飞书配置；无配置时回退样例数据。
- 该接口只生成治理视图，不自动关闭风险、不删除风险、不直接写回飞书主数据。

## 7. API：迁移规模化准备度

### `GET /api/migration/scale-readiness`

查询参数：

| 参数 | 说明 |
|---|---|
| `objectName` | 数据对象名称，默认 `项目台账` |

用途：聚合字段映射、迁移批次、整改行动项和 Go/No-Go 决策，形成规模化迁移门禁。

返回要点：

```json
{
  "status": "succeeded",
  "migration_scale_readiness": {
    "objectName": "项目台账",
    "readinessLevel": "pilot_ready",
    "readinessLabel": "具备试点放大准备",
    "summary": {
      "batchCount": 2,
      "latestCoverageRate": 96,
      "latestHighIssues": 0,
      "remediationClosureRate": 80,
      "openRemediation": 2,
      "fieldMappingProfiles": 1,
      "feishuSyncedActions": 3,
      "blockers": 0,
      "warnings": 2
    },
    "gates": [
      {
        "id": "field-profile",
        "title": "字段映射方案可复用并已冻结",
        "status": "待补充",
        "owner": "PMO",
        "nextAction": "正式迁移前由 PMO 冻结字段口径并归档。"
      }
    ],
    "reportFacts": [],
    "nextActions": []
  }
}
```

权限：

- 当 `AUTH_REQUIRED=true` 时，未登录返回 401。
- 查询本身不写入数据库。

## 8. 前端入口

| 页面 | 新增入口 | 验收点 |
|---|---|---|
| `/knowledge/operations` | 深层输出引用链 | 可查看六类候选，并确认写入推荐引用链 |
| `/governance-workflows` | 治理反写确认包、飞书待确认文档入口 | 可看到治理反写材料，并创建待确认飞书文档 |
| `/risk` | 组织级风险治理、飞书待确认文档入口 | 可看到责任人统计、规则门禁、报告事实和下一步动作 |
| `/migration-center` | 迁移规模化准备度、飞书待确认文档入口 | 可看到迁移准备度等级、门禁、阻断/待补项 |
| `/integration-center` | 既有飞书确认队列 | 新创建的业务确认记录仍在这里复核和执行 |

## 9. 业务边界

- 深层知识引用链是“依据和审计”，不是业务审批结论。
- 治理、风险、迁移页面创建的是飞书待确认记录，不直接改写飞书业务表。
- 所有飞书写入仍必须通过确认队列和用户有效飞书配置执行。
- 迁移规模化准备度是 PMO 决策材料，不替代正式切换审批。
- 组织级风险治理不伪造历史趋势；历史 KPI 需要后续持久化快照后才能严格回放。

## 10. 验证记录

本版本完成后执行：

```text
npx eslint src/features/knowledge/deep-output-references.ts src/app/api/knowledge/deep-references/route.ts src/components/KnowledgeDeepReferenceClient.tsx src/components/FeishuActionDraftLauncherClient.tsx src/features/governance/writeback-confirmation.ts src/app/api/governance/writeback-confirmations/route.ts src/features/risk/organizational-governance.ts src/app/api/risk/organizational-governance/route.ts src/features/migration/scale-readiness.ts src/app/api/migration/scale-readiness/route.ts src/app/knowledge/operations/page.tsx src/app/governance-workflows/GovernanceWorkflowsClient.tsx src/app/risk/page.tsx src/app/migration-center/page.tsx tests/pmo-operating-system.test.ts
npm test
npm run build
```

验收口径：

- 变更文件定向 ESLint 通过。
- `npm test` 通过 134 项测试。
- `npm run build` 通过。
- 全仓 `npm run lint` 仍存在历史遗留 lint 基线问题：当前为 41 个 error、45 个 warning，集中在 `blueprint-v1`、`blueprint-v2`、`closing`、`contract`、`ltc`、`monitoring`、`process`、`wbs` 等既有文件，不属于本版本新增文件；本版本新增/变更文件已做定向零错误检查。

## 11. 下一设备继续开发建议

1. 先同步 GitHub 最新 `main` 并确认 tag `v5.3.60`。
2. 先确认生产 Supabase 至少已执行 `supabase-v5349-feishu-action-confirmations.sql` 和 `supabase-v5355-v5358-knowledge-reference-template-audit.sql`。
3. 继续新增用户可见能力时，仍按全局发布规则升版本、构建、打 tag、创建 Release 并部署。
4. 后续可选增强方向：模板内容版本、失效提醒、批量导入、真实邮件/飞书投递回写、更多源系统迁移适配、组织级风险 KPI 历史快照。
