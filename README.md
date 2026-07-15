This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI-PMO System V6.5.1

V6.5.1 修复角色 AI 定时入口被全局登录门禁提前拦截的问题。`/api/cron/role-ai-scan` 现在与其他 Vercel Cron 入口一致，可穿过登录门禁到达自身的 `CRON_SECRET` 鉴权；匿名或错误密钥仍返回 401，只有 Vercel 调度器和持有正确专用密钥的受控调用可执行扫描。

## AI-PMO System V6.5.0

V6.5.0 把 PM/运营提交 → PMO 复核与正式汇报冻结 → CEO 决策 → 下行行动 → 执行回执 → 效果复核变成可操作、可追溯的跨角色业务事件链。每次状态变化都在同一数据库事务内保存领域状态与追加式事件，所有写入强制业务上下文、稳定项目、数据分类、幂等键和期望版本；正式报告可直接复用为汇报快照，不再重复录入。

飞书身份边界明确为“组织连接读取共享 Base，个人连接执行消息、任务、文档和个人写回”，个人动作缺少配置时明确失败，不静默借用管理员身份。角色 AI 支持按小时、每日或每周定时扫描，只基于授权项目事实生成带证据、置信度和人工确认的建议，并保存接受/驳回及效果评价。已发布动态知识资产进入组织/项目/数据分类受控的 RAG；发布脚本同步代码版本与 AI-PMO-SYS 的 README、STATE、Task_Log、log 和产品版本，同时检查 215 组故意保留的原始冗余边界。详细契约见 `docs/v650-cross-role-feishu-ai-knowledge.md`。

## AI-PMO System V6.4.0

V6.4.0 将 PM、运营、PMO 和 CEO 的首屏工作体验按真实职责重新编排。PM 聚焦今日行动、关键路径、里程碑和正式周报；运营聚焦验收、开票、应收、回款和现金；PMO 运营例外池、数据质量、治理 SLA 和会议事项；CEO 只看战略项目、现金、收益、重大风险和待决策收件箱。四个角色继续使用共同项目事实，不拆成四套系统。

统一收件箱聚合九类治理事项并保存个人处理回执。项目、人员、证据、正式成果和业务对象统一通过业务名称选择器录入，复杂内容改为结构化编辑，正式页面不再要求业务用户手填 UUID 或 JSON。生产数据库已应用 V6.4.0 增量迁移，四张新表均启用 RLS 且客户端直接权限为 0；四个不同测试账号、五个隔离测试项目和 PM/运营→PMO→CEO 汇报关系已建立。自动化账号不冒充真实人员试点，详细边界与接口见 `docs/v640-role-workbench-and-inbox.md`。

## AI-PMO System V6.3.4

V6.3.4 将报告、治理会议纪要、迁移评审/对比/Go-No-Go 决策包和已审批知识资产统一为可追溯的“正式业务成果”。完整正文、来源时点、结构化数据、稳定项目、数据空间、幂等键、内容哈希、版本和状态事件均持久化到 Supabase。报告正文与 `reporting_snapshots` 在同一事务创建，浏览器 `localStorage` 不再是报告历史的权威存储。

会议纪要与已发布知识资产由数据库触发器在原业务事务内自动留档，迁移报告必须先留档再下载。两张成果表已开启 RLS，客户端直接权限为 0，生产库安全审计为 0 违规；知识数据分类缺失或冲突时不会默认提升为 `production`。当前生产项目镜像仍为 0，项目报告会返回真实空态而不冒充成功。详细契约和数据库证据见 `docs/v634-formal-business-output-persistence.md`。

## AI-PMO System V6.3.3

V6.3.3 将执行、监控、风险、问题、变更、行动项、质量和收尾统一到同一项目事实与状态机。执行与监控页面只读取当前授权项目的飞书事实镜像和 Supabase 人工治理记录；AI 状态摘要与监控洞察由服务端重新加载真实快照生成，不再信任浏览器提交的任务数组，也不会在数据不可用时伪造演示成功。

问题、变更与行动项现在通过同一原子事务写入，强制组织、稳定项目 UUID、业务角色、数据分类、幂等键和期望版本；状态变化、关联行动和追加式事件在同一事务内完成。生产库已应用两份 V6.3.3 migration，并通过数据库安全审计零违规。详细接口、状态机与生产证据见 `docs/v633-project-control-unification.md`。

## AI-PMO System V6.3.2

V6.3.2 将合同、应收、回款、干系人、质量计划与检查、缺陷整改、验收和签发接入同一项目事实与人工状态机。合同链同时展示 V6.2 飞书镜像事实与系统内受治理记录；质量与验收链要求责任人、期限、证据和人工签发，AI 仅生成候选分析，不代替业务录入、审批、验收或签字。

正式页面已移除 `TEST_CONTRACTS`、预置干系人、测试缺陷和测试验收标准，不再使用浏览器本地状态作为权威存储。所有写入强制项目 UUID、组织、业务角色、数据分类、幂等键和期望版本；新增 13 张表均启用 RLS，撤销 `PUBLIC`、`anon`、`authenticated` 直接权限，仅允许服务端事务函数写入。详细接口与生产数据库证据见 `docs/v632-commercial-quality-acceptance-realization.md`。

## AI-PMO System V6.3.1

V6.3.1 完成 WBS、关键路径、挣值和资源容量四条交付控制链的真实化。WBS 进入版本化保存、人工提交/审批和工作包实绩管理；CPM 只能从当前项目已持久化 WBS 读取任务与前置关系，并保存确定性计算快照；EVM 只能使用已批准成本基准、已批准 WBS、工作包实绩和真实成本台账形成指标；资源页面使用已授权项目成员建立 8–12 周容量计划，超配自动生成责任到人、有期限、有证据复核的冲突动作。

正式页面不再以内置任务、`TEST_*`、随机人员能力或浏览器本地状态作为权威数据。所有写入继续强制校验项目 UUID、业务角色、数据分类、幂等键和期望版本；数据库对象启用 RLS，并撤销 `PUBLIC`、`anon`、`authenticated` 的直接权限。详细接口与部署门禁见 `docs/v631-delivery-control-realization.md`。

## AI-PMO System V6.3.0

V6.3.0 完成立项与规划第一条真实业务链：项目经理录入立项事实，AI 可基于当前项目事实辅助起草商业论证、项目章程和管理计划，但保存、提交、退回、批准与发起新版本必须由有权限的真实用户完成。范围、进度、成本三类基准均进入 Supabase 正式状态机，页面刷新后仍能恢复记录，不再依赖浏览器本地状态或“示例项目”。

所有写入强制稳定 `project_id`、组织、业务角色、数据分类、幂等键与乐观版本；状态机支持草稿、提交、批准、拒绝、退回修改和已批准成果的新版本流程。审批决定、操作回执与追加式事件链均持久化，已批准内容不能无痕覆盖。正式接口统一返回业务上下文、来源、数据分类、生成时间、警告和真实数据。

Supabase 生产库已应用并登记 `20260713223000_v63_initiation_planning_realization.sql`。新增 6 张表均启用 RLS，`PUBLIC`、`anon`、`authenticated` 的直接权限为 0；5 个业务事务函数仅允许 `service_role` 执行，安全顾问无错误项。发布前 362/362 自动化测试、TypeScript、Lint 与生产构建门禁通过。详细接口与状态机见 `docs/v63-initiation-planning-realization.md`。

## AI-PMO System V6.2.0

V6.2.0 建立“飞书业务事实源 → Supabase 受治理镜像”的统一真实数据底座。项目、里程碑、任务、风险、合同、回款、成本和同步账本八类数据支持人工触发与每日定时对账，按飞书记录 ID 或项目编号形成稳定 UUID，禁止按项目名称关联；重复请求通过幂等键复用同一批次，源端删除只生成软删除标记，不物理删除历史事实。

新增同步批次、明细账本、隔离队列、游标与里程碑镜像，旧业务表补齐组织、项目、数据分类、来源记录、更新时间、行哈希和版本字段。正式、样例、测试、诊断数据空间强制隔离，字段缺失、项目关联不明或跨空间记录进入治理队列。数据与集成中心可查看数据来源、最近更新时间、质量状态和八类表记录数，并由 PMO/运营角色人工确认后发起完整对账。

本版本新增 `POST/GET /api/integrations/feishu/reconcile` 与 `/api/cron/feishu-reconcile`，统一返回业务上下文、来源、数据分类、生成时间、警告和数据载荷。Supabase 已应用 `20260713210000_v62_feishu_real_data_foundation.sql` 与 `20260713213000_v62_reconcile_trigger_security_fix.sql`；数据库安全审计为 0 项违规。详细契约见 `docs/v62-feishu-real-data-reconcile.md`。

V6.2.0 生产验收已完成：线上版本为 `V6.2.0 · e845caa`，357/357 测试通过，八个对账领域都建立了成功游标，重复使用同一幂等键只保留 1 个批次。首次真实对账读取 237 条飞书记录；这些记录尚未显式声明为 `production`，因此全部进入数据质量隔离队列，没有混入生产镜像。这是预期的安全行为；正式数据转入镜像前，需在飞书中补齐中文字段“数据分类”并明确其业务空间。

## AI-PMO System V6.1.0

V6.1.0 建立“安全与数据库治理门禁”：所有应用自有 `public` 表启用 RLS，撤销 `PUBLIC`/`anon`/`authenticated` 业务读写权，并把表、函数、序列、策略和 `service_role` 必需权限纳入自动审计。新建数据库对象默认不再暴露到 Data API，后续 migration 必须显式声明服务端权限。

风险主链路现在强制 `org_id + project_id + data_class + business context`，新增项目级唯一键、乐观锁、幂等回执、状态/事件原子事务和软归档。未关联项目的 18 条历史风险保留原记录并进入组织隔离治理队列；安全中心新增可视化治理页，只能选择当前授权项目，不再输入 UUID 或 JSON。同时修复用户中心错误链接与 375px 手机登录页布局。

V6.1.0 是 V6.1–V6.6 全模块真实化计划的第一个版本；V6.2.0 已完成八类飞书事实同步与对账底座，V6.3.0 完成立项与规划持久化，V6.3.1 完成交付控制真实化，V6.3.2 完成业财、干系人、质量与验收链真实化，V6.3.3 完成执行、监控、风险、问题、变更、行动项和收尾贯通，V6.3.4 完成正式汇报、会议、迁移结果和知识成果持久化，V6.4.0 完成四角色工作台与统一收件箱，V6.5.0 完成跨角色事件、飞书身份、角色 AI 和动态知识闭环，下一步进入 V6.6.0 全模块验收候选与受控试点。

## AI-PMO System V6.0.10

V6.0.10 收口版本与发布治理：将 P17-P25 经营操作系统正式并入 `main`，并以 `package.json` 作为唯一产品版本源。首页页头与页脚不再维护独立的硬编码版号，构建时自动注入版本号和 Git 短提交号，统一显示为 `V6.0.10 · <commit>`。

本版本新增匿名只读的 `GET /api/version`，用于验证线上版本、构建提交、Vercel 环境和来源分支；接口使用 `no-store`，不返回任何密钥、账号或环境变量值。发布门禁会同时校验 `package.json`、`package-lock.json`、首页和版本 API 的一致性，防止再出现代码版本、文档版本和页面版号相互漂移。

## AI-PMO System V4.0

V4.0 将知识问答从演示 Mock 切换为真实、可追溯的项目管理知识快照。首批语料来自 AI-PMO-SYS 中10篇 `reviewed` 综合知识页。

### 已实现

- `POST /api/rag/query`：中文关键词检索、领域/状态/密级过滤、引用、拒答和审计ID。
- `GET /api/rag/health`：索引版本、页面数、检索模式和向量状态。
- `/knowledge`：展示真实 `KB-xxxx` 与 `SRC-xxxx` 引用。
- `/api/knowledge`：旧客户端兼容入口，已移除 Mock 生成器。
- `npm test`：RAG、飞书、契约、拒答、权限、证据门槛和摘录质量测试。
- `GET /api/integrations/feishu/health`：以长期 Bot 身份验证 Base 与表映射；未配置时关闭失败。

### 知识快照更新

运行时不读取本机 Obsidian 路径。发布前显式生成并提交快照：

```bash
AI_PMO_KB_PATH=/absolute/path/to/AI-PMO-SYS npm run corpus:build
npm test
npm run build
```

仅 `reviewed/published` 且非 `restricted` 的 `KB-xxxx` 页面会进入快照。

### 当前边界

- 检索模式为确定性 `keyword`，`embedded_chunk_count=0`。
- 飞书实时业务表已建立，但知识问答尚未获得行级查询授权，相关问题仍会拒答。
- 飞书端已建立8张业务表；公开项目记录API会等用户登录和授权模型完成后再开放。
- 全仓历史 ESLint 基线仍有旧问题；V4新增/改动文件执行独立零错误门禁。

## AI-PMO System V5.3.60

V5.3.60 将前一阶段剩余的“深层闭环”补齐为可验收入口：P16 新增 `/api/knowledge/deep-references` 和知识运营页“深层输出引用链”，把治理、风险、规划、迁移、飞书确认和报告输出统一纳入 `knowledge_output_references` 候选与人工确认写入；P13 新增治理反写确认包，治理流程结果不会静默写回业务表，而是生成可确认的飞书待办文档；P14 新增组织级风险治理视图，将风险责任人、deadline、证据缺口、升级规则和报告事实聚合到风险管理页；P12 新增迁移规模化准备度，把字段映射、试迁移批次、整改行动项和 Go/No-Go 决策合并为生产迁移门禁；P15-T3 新增通用业务表单飞书确认入口，治理、风险和迁移页面可直接创建待确认飞书记录。本版本不新增 SQL，继续依赖已存在的 `supabase-v5355-v5358-knowledge-reference-template-audit.sql`、`supabase-v5349-feishu-action-confirmations.sql` 和迁移中心历史 SQL。

## AI-PMO System V5.3.59

V5.3.59 将 P15-T3 飞书写入确认队列补齐到“生产可控的批量处理体验”：`GET /api/integrations/feishu/actions/confirmations` 会为每条待确认写入返回 `riskReview`，并返回队列 `summary`、高风险/逾期待处理/二次确认统计和提醒草稿；新增 `POST /api/integrations/feishu/actions/confirmations/batch-review`，用于批量确认前只读风险复核，不执行飞书写入；`/confirm` 对高风险、逾期或失败重试记录要求传入 `riskAcknowledged=true` 后才允许执行。集成中心新增批量确认、批量确认前复核、风险清单和待处理提醒草稿；项目组合看板、风险管理、PMO治理中心、报告工厂、PM/PMO每日工作台、知识库问答新增“飞书写入确认提醒”内联入口。本版本不新增 SQL，继续依赖 `supabase-v5349-feishu-action-confirmations.sql`。

## AI-PMO System V5.3.58

V5.3.58 将 P16 知识运营补齐为“可下载审计包”：新增 `/api/knowledge/change-reports/[id]/download` 与 `/api/knowledge/audit-packages/[id]/download`，知识变更报告和 PMO 知识运营审计包均可下载 Markdown 归档。`POST /api/knowledge/operations` 新增 `generate_knowledge_audit_package`，会汇总知识版本引用链、模板/最佳实践目录、模板使用事件、订阅投递回执和知识变更报告，保存到 `knowledge_audit_packages`，并写入生命周期事件和操作审计。`/knowledge/operations` 新增“PMO知识运营审计包预览/生成/下载”区域。

## AI-PMO System V5.3.57

V5.3.57 将知识订阅从“生成通知记录”推进到“投递回执闭环”：新增 `knowledge_subscription_delivery_receipts`，支持记录站内、飞书、邮件提醒的 queued、sent、read、handled、failed、cancelled 状态；`POST /api/knowledge/operations` 新增 `record_subscription_delivery_receipt`，使用者可以为通知补充接收对象、投递状态和处理状态。飞书提醒仍保持待确认队列边界，不会静默外发；确认后的结果可通过投递回执补充到知识运营审计包。

## AI-PMO System V5.3.56

V5.3.56 将模板与最佳实践目录从运行时关联推进到可维护目录：新增 `knowledge_template_directory_items` 和 `knowledge_template_usage_events`，支持模板/最佳实践目录持久化、责任人、关联知识 pageId、生命周期状态、下载次数和引用次数。`POST /api/knowledge/operations` 新增 `upsert_template_directory_item` 与 `record_template_usage`；`/knowledge/operations` 可维护目录并记录“下载/引用”统计，为后续制度、模板、最佳实践运营提供数据底座。

## AI-PMO System V5.3.55

V5.3.55 将知识引用从“页面展示引用”推进到“输出绑定具体知识版本”：新增 `knowledge_output_references`，记录 AI 问答、RAG 问答、报告工厂、治理结论、风险输出和模板引用使用的 `page_id`、`knowledge_item_versions`、版本号和引用说明。`GET /api/knowledge/operations` 新增 `referenceAudit`，返回已保存引用、候选引用、模板目录、投递回执和审计包预览；`POST /api/knowledge/operations` 新增 `create_output_reference`。`/api/knowledge`、`/api/rag/query` 和 `/api/reports` 会在知识生命周期表可用时尝试自动写入输出引用链；SQL 未执行或知识条目未同步时不阻断原功能。本版本新增的统一 SQL 为 `supabase-v5355-v5358-knowledge-reference-template-audit.sql`，前置依赖 `supabase-v5352-knowledge-lifecycle.sql` 与 `supabase-v5354-knowledge-governance-operations.sql`。

## AI-PMO System V5.3.54

V5.3.54 将 P16 知识运营继续推进到“可操作治理闭环”：新增 `supabase-v5354-knowledge-governance-operations.sql`，扩展 `knowledge_lifecycle_events` 事件类型，并新增 `knowledge_subscription_notifications`、`knowledge_change_reports` 两张表，用于记录订阅提醒发送状态和知识变更报告。`GET /api/knowledge/operations` 新增 `governance`，返回可管理知识条目、订阅关系、通知记录、历史报告和知识变更报告预览；`PATCH /api/knowledge/operations` 支持 `target=knowledge_item` 的状态流转，可将知识条目流转为草稿、已评审、已发布、已废弃/过期、已归档，并强制填写复核/审批意见；`POST /api/knowledge/operations` 新增 `upsert_subscription`、`update_subscription_status`、`send_subscription_reminders`、`generate_change_report`，分别用于维护订阅、启停订阅、生成提醒发送记录和保存知识变更报告。`/knowledge/operations` 新增“知识状态流转、订阅发送与变更报告”操作面板；飞书提醒不会直接外发，而是进入既有飞书写入待确认队列。本版本需要在 Supabase SQL Editor 执行 `supabase-v5354-knowledge-governance-operations.sql`；如果使用飞书待确认队列，还需已执行 `supabase-v5349-feishu-action-confirmations.sql`。

## AI-PMO System V5.3.53

V5.3.53 将 P16 知识运营从“持久化第一版”推进到“变更控制闭环”：`GET /api/knowledge/operations` 新增 `changeControl`，会对比当前 RAG 快照与 Supabase 中上一持久化版本，形成新增、更新、撤出和无变化统计；基于 `knowledge_subscriptions` 生成订阅提醒草稿；从 `knowledge_impact_reviews` 中提取 P0/P1 复核任务作为行动项候选。`POST /api/knowledge/operations` 新增 `action=create_action_items`，必须 `confirm=true` 且用户登录后才会把 P0/P1 知识影响复核转为 `unified_action_items`，并写入操作审计和知识生命周期事件；已存在行动项会被跳过，避免重复创建。`/knowledge/operations` 页面新增“知识版本差异与订阅提醒”面板，展示版本差异、订阅提醒、行动候选和“生成统一行动项”按钮。本版本不新增 SQL，继续依赖 `supabase-v5352-knowledge-lifecycle.sql`；如要生成统一行动项，还需要已执行既有 `supabase-v530-issue-change-action-chain.sql`。

## AI-PMO System V5.3.52

V5.3.52 将 V5.3.51 的运行时知识运营视图推进到 Supabase 持久化第一版：新增 `supabase-v5352-knowledge-lifecycle.sql`，创建 `knowledge_items`、`knowledge_item_versions`、`knowledge_lifecycle_events`、`knowledge_impact_reviews`、`knowledge_subscriptions` 五张表，用于保存知识条目、版本摘要、生命周期事件、影响模块复核和订阅关系；新增 `src/features/knowledge/lifecycle-repository.ts`，支持把当前 RAG 快照同步到知识生命周期表，并关闭/标记无需处理影响复核；`GET /api/knowledge/operations` 返回持久化状态，`POST /api/knowledge/operations` 在 `confirm=true` 后同步当前快照，`PATCH /api/knowledge/operations` 更新影响复核状态；`/knowledge/operations` 页面新增“知识生命周期持久化”面板，可提示 SQL 未执行、同步当前快照、填写复核结论并关闭影响复核。本版本需要在 Supabase SQL Editor 执行 `supabase-v5352-knowledge-lifecycle.sql` 后启用持久化能力；未执行时页面仍保留运行时知识运营视图。

## AI-PMO System V5.3.51

V5.3.51 启动 P16 知识运营：新增 `src/features/knowledge/operations.ts`，基于现有 RAG 快照和模板目录生成知识生命周期运营看板，包含知识状态统计、责任人、版本、有效期、过期/复核健康状态、影响模块、关联模板和候选复核动作；新增 `GET /api/knowledge/operations` 对外输出同一结构；新增 `/knowledge/operations` 子页面“知识生命周期运营”，从知识问答页提供入口，可查看知识变更影响到的 PMO治理中心、风险管理、报告工厂、模板中心等模块。本版本不新增 SQL，当前为运行时派生视图，不会自动修改知识条目、模板或业务数据。

## AI-PMO System V5.3.50

V5.3.50 完成 P15-T2 第二版与 P15-T3 体验增强：新增 `IntegrationStatusPanelClient`，把统一集成状态覆盖到项目组合看板、风险管理、PMO治理中心、报告工厂、PM/PMO每日工作台、知识库与AI问答等核心页面，页面内可直接看到当前账号实际使用的 AI 模型、飞书业务底座、RAG 知识库和同步审计状态，并跳转到用户中心或集成中心处理配置缺口。集成中心的“飞书写入待确认队列”新增状态筛选、关键词搜索、全选可取消动作和批量取消能力，便于处理多条待确认/失败写入记录。本版本不新增 SQL，继续依赖 V5.3.49 的 `supabase-v5349-feishu-action-confirmations.sql`。

## AI-PMO System V5.3.49

V5.3.49 将通用飞书写入动作从“token 直写”升级为“预览 + 待确认队列 + 当前用户确认执行”：新增 `supabase-v5349-feishu-action-confirmations.sql` 和 `feishu_action_confirmations`，保存动作类型、幂等键、目标摘要、风险等级、预览、载荷、状态、执行资源和错误信息；`POST /api/integrations/feishu/actions` 不再直接调用飞书 OpenAPI，而是返回 `confirmation_required` 并创建待确认记录；新增 `/api/integrations/feishu/actions/confirmations`、`/confirm`、`/cancel`，支持登录用户查看、创建、确认执行或取消写入。确认执行时使用当前登录用户的有效飞书配置，先写同步流水再执行消息/任务/日程/文档动作，并写入操作审计与集成同步日志。集成中心新增“飞书写入待确认队列”，可查看风险提示、字段预览、确认执行或取消。

## AI-PMO System V5.3.48

V5.3.48 补齐用户级飞书与 AI 配置的“一键测试 + 状态可见”闭环：新增 `POST /api/user/ai-settings/test`，按当前登录用户的个人模型配置或输入草稿测试 DeepSeek、MiniMax、GLM、Anthropic、OpenAI 兼容接口，并返回失败原因分类、延迟、端点来源和下一步处理建议；新增 `POST /api/user/feishu-connection/test`，逐项检查用户飞书 App、Base Token、表 ID、字段映射权限，写入权限测试只在用户明确确认后向同步流水表写入一条测试记录。用户中心新增“测试AI模型 / 测试飞书连接 / 确认写入测试”入口；集成中心新增 `IntegrationStatusPanel`，统一展示当前账号实际使用的 AI、飞书、RAG 和同步审计状态。本版本不新增 SQL，继续依赖 V5.3.22 用户配置表和 V5.3.27 集成同步日志表。

## AI-PMO System V5.3.47

V5.3.47 将知识治理升级从“治理流程候选”推进到“证据链与人工确认反写”：新增 `supabase-v5347-knowledge-governance-evidence-chain.sql` 和 `risk_retrospective_governance_evidence_links`，把风险复盘二次治理待办、知识治理运营提醒日志、统一行动项和治理流程实例串成可审计链路；新增 `/api/risk/retrospective/assets/governance/followups/evidence-chain`，支持查询证据链、生成 `confirmation_required` 反写建议，以及在 `confirm=true` 后追加关闭/复核说明并反写二次治理待办状态。PMO 治理中心的知识治理来源流程卡片新增“知识治理证据链”面板，支持查看证据链、生成反写建议和确认反写待办；系统不会静默覆盖已有关闭证据，也不会直接写飞书或项目台账。

## AI-PMO System V5.3.46

V5.3.46 将知识治理升级从“统一行动项”推进到“治理流程候选与人工确认闭环”：风险管理页的已升级提醒日志新增“转治理流程”，先返回候选流程预览和二次确认信息，用户确认后才创建治理流程实例；PMO 治理中心新增“知识治理升级候选流程”，可将升级来源、项目、资产、责任人、审批人、截止时间和输入材料带入治理流程创建表单。本版本包含重复创建防护和来源追溯字段，不新增 SQL，继续依赖 V5.3.44 的运营快照和提醒日志表；系统不会静默创建治理流程，必须由 PMO 或授权用户确认。

## AI-PMO System V5.3.45

V5.3.45 将知识治理提醒从“提醒日志”推进到“待办联动和运营看板”：提醒日志标记为“已处理”时会同步将对应风险复盘二次治理待办推进到“待验收”；标记为“已升级”时会将待办保持在“处理中”，并生成来源为 `governance` 的统一行动项，后续行动项关闭仍可反写待办关闭证据。飞书周运营提醒新增本周重复提醒抑制：同一提醒在本周已发送、已处理、无需处理或已升级后不会再次外发，发送失败可重试。PMO 治理中心新增“知识治理运营趋势”，基于 V5.3.44 快照和提醒日志展示未关闭、逾期、提醒数、处理率和责任人闭环 Top 追踪。本版本不新增 SQL，继续依赖 `supabase-v5344-risk-retrospective-governance-operations.sql`。

## AI-PMO System V5.3.44

V5.3.44 将知识治理运营从“当前回算趋势”升级为“可审计历史与提醒闭环”：新增 `supabase-v5344-risk-retrospective-governance-operations.sql`，创建知识治理运营快照表和提醒日志表；新增 `/api/risk/retrospective/assets/governance/followups/operation-history`，支持读取历史快照、保存今日快照，并将提醒日志标记为已处理、无需处理或已升级；`/api/risk/retrospective/assets/governance/followups/weekly-reminder` 在飞书发送成功/失败后会记录提醒日志并保存当日快照；风险管理页新增“运营历史快照与提醒闭环”，展示历史快照、提醒日志和关闭动作。未执行 SQL 时现有报表、提醒草稿和飞书发送不被阻断，只显示历史持久化提示。

## AI-PMO System V5.3.43

V5.3.43 将知识治理运营从“当前快照和周清单”推进到“趋势与提醒”：`buildRiskRetrospectiveGovernanceFollowupOperationReport` 新增最近 6 周趋势、逾期/待验收/证据缺口自动提醒草稿和飞书周运营提醒草稿；`/risk` 的“知识治理待办运营报表”新增趋势卡片、自动提醒草稿和“确认发送飞书提醒”入口，发送前必须填写 `chat_id` 或 `open_id` 并二次确认；新增 `/api/risk/retrospective/assets/governance/followups/weekly-reminder`，只有 `confirm=true` 且提供接收对象时才调用飞书消息接口；`/workbench` 新增“知识治理运营提醒草稿”，并把提醒数量纳入今日优先动作。本版本不新增 SQL，继续复用 V5.3.38 待办表。

## AI-PMO System V5.3.42

V5.3.42 将知识治理待办进一步升级为 PMO 可运营的周报与负责人追踪能力：`/api/risk/retrospective/assets/governance/followups` 新增 `operation_report` 和 `format=markdown` 导出，支持按责任人、状态、优先级、逾期/7天内/待验收/证据缺口/本周关闭、飞书同步状态筛选，并生成“知识治理待办周运营清单”。风险管理页新增“知识治理待办运营报表”，展示关闭率、逾期、P0未关闭、证据缺口、负责人追踪和筛选结果，并可一键导出 Markdown 周清单；PMO治理中心新增“知识治理运营”指标卡，展示关闭率、证据完整率、逾期未关闭和飞书待确认。本版本不新增 SQL，继续复用 V5.3.38 待办表。

## AI-PMO System V5.3.41

V5.3.41 将知识治理待办从“可进入工作台和统一行动项”推进到“关闭证据可反写、可进报告”：当统一行动项来源为 `risk-retro-governance-followup-{id}` 且用户补充关闭证据后，系统会自动把对应风险复盘二次治理待办流转为“已关闭”，写入关闭说明和复核结果；如果待办表不可用，行动项关闭仍成功并返回联动警告。报告工厂新增“知识治理待办闭环”数据源和 AI 依据审计，周报/月报可引用待办总数、未关闭、已关闭、关闭率、逾期、P0 和关闭证据；风险复盘资产治理报告也新增“知识治理待办闭环”章节。本版本不新增 SQL，依赖 V5.3.38 待办表和 P5 统一行动项表。

## AI-PMO System V5.3.40

V5.3.40 修正 V5.3.39 的工作台兜底行为：当飞书项目台账未配置或当前用户尚未配置个人飞书接入时，`/api/operating-system/workbench` 仍会把已保存的风险复盘二次治理待办纳入工作台 KPI、今日优先动作和“知识治理待办”区块，同时保留 SQL/配置提示。这样 PMO 即使暂时没有飞书业务数据，也能看到 Supabase 中已保存的知识治理待办，避免知识治理闭环被飞书配置状态阻断。本版本不新增 SQL。

## AI-PMO System V5.3.39

V5.3.39 将 V5.3.38 已保存的风险复盘二次治理待办接入 PM/PMO 每日工作台：`/api/operating-system/workbench` 现在会读取 `risk_retrospective_governance_followups`，按当前用户姓名、邮箱、手机或管理员角色过滤，生成“知识治理待办”KPI、逾期/P0/飞书待确认统计和今日优先动作。`/workbench` 新增“知识治理待办”区域，展示资产、原因、处理动作、责任人、deadline、关闭标准和飞书同步状态，并支持用户确认后“转统一行动项”，进入现有 P5 问题-变更-行动项闭环。该版本不新增 SQL，依赖已执行 V5.3.38 的 `supabase-v5338-risk-retrospective-governance-followups.sql` 和既有 `supabase-v530-issue-change-action-chain.sql`。

## AI-PMO System V5.3.38

V5.3.38 将 V5.3.37 的运行时二次治理待办升级为可保存、可流转、可审计、可确认同步飞书的正式闭环：新增 `supabase-v5338-risk-retrospective-governance-followups.sql`、`/api/risk/retrospective/assets/governance/followups` 和 `/api/risk/retrospective/assets/governance/followups/feishu-sync`，支持保存低效果治理待办、读取历史待办、流转“待复核 → 处理中 → 待验收 → 已关闭”，并在用户明确确认后创建飞书任务。`/risk` 的“知识治理效果”区域新增“保存待办”和“已保存二次治理待办”，展示责任人、deadline、关闭标准、同步状态、飞书任务链接和错误提示。系统不会自动外发飞书任务；必须先“准备同步飞书”，再“确认写入飞书任务”。本版本需要在 Supabase SQL Editor 执行 `supabase-v5338-risk-retrospective-governance-followups.sql` 后才能持久化待办。

## AI-PMO System V5.3.37

V5.3.37 将 V5.3.36 的治理效果趋势进一步转化为 PMO 可执行的二次治理待办和提醒：`/api/risk/retrospective/assets/governance` 的 `effect` 新增 `actionItems` 和 `reminders`，针对质量分下降、治理后低于70分、治理后无改善、发布/恢复后无 RAG 引用增长、合并后重复风险未下降等低效果治理动作，自动生成责任人、deadline、优先级、复核动作和关闭标准。风险管理页“知识治理效果”区域新增“二次治理待办”和提醒列表；治理报告新增“二次治理待办”章节，便于 PMO 每周复盘知识运营质量。本版本不新增 SQL，待办为运行时派生结果，后续可再接入统一待办或飞书任务持久化。

## AI-PMO System V5.3.36

V5.3.36 将复盘资产治理从“有动作审计”推进到“能看治理效果”：`risk_retrospective_asset_governance_logs` 中已有的 before/after 快照会被用于计算每次治理动作的质量分变化、RAG 引用增长和重复风险下降。`/api/risk/retrospective/assets/governance` 返回体新增 `effect`，治理报告新增“治理效果趋势”章节，展示本月治理动作、质量分净变化、质量提升动作、被引用资产数、RAG 引用增长和重复风险下降。`/risk` 的“复盘资产”页签新增“知识治理效果”小卡片，并在顶部统计展示本月治理和质量净提升。本版本不新增 SQL，复用 V5.3.34 治理审计表和 V5.3.32 价值度量字段。

## AI-PMO System V5.3.35

V5.3.35 将复盘资产治理动作沉淀为可查看、可下载的审计台和治理报告：新增 `src/features/risk/retrospective-governance.ts` 和 `/api/risk/retrospective/assets/governance`，读取 V5.3.34 的 `risk_retrospective_asset_governance_logs`，输出治理动作数、补充编辑数、合并数、涉及资产数、最近动作时间和当前质量均分，并生成“风险复盘资产治理报告” Markdown。`/risk` 的“复盘资产”页签新增“治理审计台”和“下载治理报告”，用于查看补充、合并、发布、撤回、恢复等动作历史。本版本不新增 SQL，但需要已执行 `supabase-v5334-risk-retrospective-governance.sql` 才能读取真实治理审计。

## AI-PMO System V5.3.34

V5.3.34 将风险复盘资产治理从“评分建议队列”推进到“可编辑、可合并、可审计”：新增 `supabase-v5334-risk-retrospective-governance.sql`，创建 `risk_retrospective_asset_governance_logs` 治理动作审计表；`/api/risk/retrospective/assets` 新增 `update` 和 `merge` 动作，支持补充资产标题、适用范围、经验教训、早期预警规则、可复用做法和标签，也支持将重复资产合并到主资产并把源资产归档。`/risk` 的“已确认资产库”新增“补充资产”和“合并到主资产”操作。本版本需要执行 `supabase-v5334-risk-retrospective-governance.sql` 后才能持久化治理动作日志；未执行时编辑/合并主流程仍可执行，但会提示审计未持久化。

## AI-PMO System V5.3.33

V5.3.33 为风险复盘资产增加质量评分和人工治理队列：新增 `src/features/risk/retrospective-quality.ts` 和 `/api/risk/retrospective/assets/quality`，从关闭证据完整度、PMO复核意见、经验教训、早期预警规则、可复用做法、适用范围、重复风险和 RAG 引用价值计算 A/B/C/D 质量等级。`/risk` 的“复盘资产”页签新增“资产质量与治理队列”，展示平均分、待治理数量、重复风险数量，并为低质量或重复资产给出治理动作、责任人和 deadline。本版本不新增 SQL，复用 V5.3.30-5.3.32 的资产、引用和重复检测数据。

## AI-PMO System V5.3.32

V5.3.32 将风险复盘资产从“可发布到 RAG / 可导出知识页”继续推进到“可度量复用价值、可识别重复资产”：新增 `supabase-v5332-risk-retrospective-value.sql`，为 `risk_retrospective_assets` 增加 RAG 引用次数、最后引用时间、最近导出时间和最近导出 SHA256，并新增 `risk_retrospective_asset_usage_logs` 记录 RAG 引用日志。`/api/rag/query` 在引用 `RISK-RETRO-*` 来源时会尝试回写引用记录，不影响问答主流程；`/api/risk/retrospective/assets` 会返回同标题、同来源风险、同复盘内容、同导出哈希的重复提示；`/risk` 的“复盘资产”页签展示重复资产提示、每条资产的 RAG 引用次数和最近导出信息。本版本需要执行 `supabase-v5332-risk-retrospective-value.sql` 后才能持久化价值指标；未执行时核心资产确认/发布/导出仍可继续使用。

## AI-PMO System V5.3.31

V5.3.31 将已发布风险复盘资产进一步导出为 AI-PMO-SYS 知识库 Markdown，并增加导出审计：新增 `supabase-v5331-risk-retrospective-knowledge-sync.sql`、`src/features/risk/retrospective-knowledge-sync.ts` 和 `/api/risk/retrospective/assets/export`。`/risk` 的“复盘资产”页签新增“导出AI-PMO-SYS知识页”按钮，可下载结构化 Markdown，包含 YAML 元数据、资产目录、触发器、有效应对、经验教训、预警规则、可复用做法、关闭与复核证据；右侧新增“知识库导出审计”，展示最近导出的目标路径、资产数、人员、日期和 SHA256 摘要。本版本需要执行 `supabase-v5331-risk-retrospective-knowledge-sync.sql` 后才能保存导出审计；未执行时仍可下载 Markdown，但页面会提示审计未持久化。

## AI-PMO System V5.3.30

V5.3.30 将 V5.3.29 的运行时“风险复盘资产包”升级为可确认、可发布、可撤回的组织过程资产：新增 `supabase-v5330-risk-retrospective-assets.sql`、`src/features/risk/retrospective-assets.ts`、`/api/risk/retrospective/assets` 和 `/api/risk/retrospective/recommendations`。`/risk` 的“复盘资产”页签现在支持把复盘知识卡确认为组织过程资产、发布到 RAG、从 RAG 撤回，并展示已确认资产库与同类项目预警推荐。RAG 查询和健康检查会动态读取已发布复盘资产，形成 `RISK-RETRO-*` 引用，不需要重建静态 corpus 即可让知识问答引用已发布风险复盘卡。本版本需要在 Supabase SQL Editor 执行 `supabase-v5330-risk-retrospective-assets.sql` 后才能保存/发布资产；脚本未执行时页面会提示，不影响风险复盘清单生成。

## AI-PMO System V5.3.29

V5.3.29 将风险关闭后的信息继续沉淀为“风险复盘资产”：新增 `src/features/risk/retrospective.ts` 和 `/api/risk/retrospective`，基于已关闭风险的关闭证据、复核意见、触发器、应对动作和经验教训生成复盘知识卡、早期预警规则、待补复盘事项和可下载 Markdown 清单。`/risk` 新增“复盘资产”页签，展示复盘概览、知识卡、预警规则和待补复盘，并提供“下载复盘清单”入口。报告工厂新增“风险复盘资产包”数据源、风险事实和 AI 依据审计条目，周报/月报/会议纪要可引用复盘资产。本版本不新增 SQL，不自动写入知识库或飞书；AI 只整理和提炼，复盘结论仍需使用者在复盘会中确认。

## AI-PMO System V5.3.28

V5.3.28 将风险关闭从普通状态流转升级为“关闭证据门禁”：新增 `src/features/risk/closure.ts` 和 `/api/risk/closure`，对已关闭风险生成关闭证据包、关闭缺口、条件关闭和报告事实。`/api/risk` 的 `PATCH` 在流转到 `closed` 时会强制校验关闭证据、复核意见、复核人、复核日期和依赖处置说明；有条件关闭还必须填写后续动作、责任人和 deadline。`/risk` 新增“关闭证据”页签，展示关闭缺口、已形成证据包和边界说明；关闭弹窗提供专门的关闭证据与复核意见输入区。`/risk/tracking` 同步支持关闭证据门禁，避免在跟踪页绕过关闭要求。报告工厂新增“风险关闭证据包”数据源、风险事实和 AI 依据审计条目，周报/月报/会议纪要可引用风险关闭证据状态。本版本不新增 SQL，复用现有风险登记册 `evidence` 与 `risk_workflow_events` 字段；不自动关闭风险，必须由使用者提交证据并确认。

## AI-PMO System V5.3.27

V5.3.27 将风险敏感性分析从单页手工工具推进到组合看板和报告工厂联动：新增 `src/features/risk/sensitivity-impact.ts` 和 `/api/risk/sensitivity-impact`，基于飞书/当前项目台账推导合同金额、实施成本、交付延期、回款延迟四类敏感因素，生成项目级敏感性等级、健康矩阵建议、下一步动作和报告事实。项目组合看板的“项目健康矩阵”新增敏感性外圈和右侧建议清单，高敏/中敏项目会提示首要变量、摆动值和待确认动作；`/risk/sensitivity` 新增系统联动口径说明，可跳转健康矩阵、报告工厂和只读影响包 API。报告工厂新增“风险敏感性影响包”数据源、风险事实和 AI 依据审计条目，周报/月报/会议纪要可以引用敏感性分析来源。本版本不新增 SQL，不自动写回飞书，不自动改变项目健康状态；所有健康分区调整仍需项目负责人或 PMO 人工确认。

## AI-PMO System V5.3.26

V5.3.26 将 V5.3.25 的风险联动建议推进到“人工确认后创建治理流程/行动项”：新增 `src/features/risk/escalation.ts` 和 `/api/risk/escalation-drafts`，从风险联动包中筛选高风险、逾期风险和需要上报的风险，生成风险升级治理流程草稿与统一行动项草稿。`/risk` 的“风险联动”页签新增“风险升级确认队列”，用户可逐条确认创建风险升级评审流程或统一行动项；确认前不写 Supabase、不写飞书、不改变风险或项目主数据。确认后复用既有 `/api/governance/workflows` 和 `/api/issue-change` 的持久化能力，并做重复检查，避免刷新后重复创建同名流程或行动项；治理流程元数据会记录风险联动来源，便于后续审计包追溯。本版本不新增 SQL。

## AI-PMO System V5.3.25

V5.3.25 将风险管理从“登记册内部闭环”扩展到“跨项目健康、任务、里程碑、回款、治理和报告的联动包”：新增 `src/features/risk/integration.ts` 和 `/api/risk/integration`，基于风险登记册与飞书项目台账生成风险影响对象、建议写回字段、下一步动作、报告事实和责任期限。`/risk` 新增“风险联动”页签，展示风险对项目健康、任务、里程碑、回款、治理升级和报告输出的影响；`/workbench` 新增“风险联动提醒”，让 PM/PMO 在日常工作台看到高风险、回款影响、治理升级和待确认写回；报告工厂新增“风险联动包”数据源和依据说明。本版本不新增 SQL，不静默改写飞书或 Supabase 主数据；所有写回建议均为 `manual_confirmation_required`，需要后续用户确认队列承接。

## AI-PMO System V5.3.24

V5.3.24 将治理工作流从“人工选择流程”升级为“按项目分层推荐治理策略”：新增 `src/features/governance/strategy.ts` 和 `/api/governance/strategy`，按项目等级（S/A/B/C）、项目类型、风险等级、重点项目标记和当前阶段推荐治理流程、审批人、优先级、必填输入、输出成果和 SLA。`/governance-workflows` 新增“治理策略配置与预览”区域，缺少项目等级、项目类型或风险等级时只提示补齐，不静默套用默认策略；策略可一键带入创建流程。创建治理流程时会把策略版本、规则 ID 和策略摘要写入现有元数据与创建事件，保证后续审计可追溯；本版本不新增 SQL，历史治理流程和已生成审计包不被自动改写。

## AI-PMO System V5.3.23

V5.3.23 将治理下载从“流程输出报告”升级为“可审计归档包”：新增 `src/features/governance/audit-package.ts`，单流程审计包覆盖输入材料、审批意见、状态流转、附件索引、输出成果、行动项闭环、SLA 与业务联动建议，并对密钥类内容做基础脱敏。新增 `/api/governance/audit-package`，支持按项目名称和日期范围下载 PMO 治理审计包汇总；原 `/api/governance/workflows/[id]/report` 升级为单流程审计包下载，并在启用登录保护时要求先登录。`/governance-workflows` 新增“治理审计包导出”区域，支持汇总导出和单流程导出。本版本不新增 SQL，复用 V5.2.9 治理表。

## AI-PMO System V5.3.22

V5.3.22 将治理审批结果从“流程内部状态”推进到“跨模块可追溯联动”：新增 `src/features/governance/impact.ts`，将立项、阶段门、变更、风险升级、收尾验收等治理状态转换为项目台账、风险登记册和报告工厂可引用的业务影响包。`/api/governance/workflows` 现在返回 `governance_impact` 和实例级 `businessImpact`；`/governance-workflows` 新增“治理结果业务联动”区域，每个流程卡片展示建议写回字段、下一步动作和“需人工确认”的写回模式。治理流转会把业务影响包写入事件输出和集成审计日志，避免静默改写业务主数据。报告工厂会引用治理流程结果、SLA、逾期和写回建议，生成含治理依据的周报/月报/项目例外报告。本版本不新增数据库脚本，复用 V5.2.9 治理流程表与 V5.2.7 集成日志表。

## AI-PMO System V5.3.21

V5.3.21 将治理工作流从“可创建、可流转”推进到“可运营待办”：新增 `src/features/governance/sla.ts`，基于治理流程实例的状态、责任人、审批人、创建人和 `deadline` 计算 SLA 状态、逾期、今日到期、即将到期、未设 SLA 和“待我处理”事项。`/api/governance/workflows` 现在返回 `governance_workbench` 和实例级 `sla`；`/governance-workflows` 新增“治理 SLA 与待我处理”区域，每个流程卡片显示 SLA 建议动作；`/workbench` 新增“待我处理治理事项”区块，将治理流程拉入 PM/PMO 每日工作台。本版本不新增数据库脚本，复用 V5.2.9 治理流程表的 `deadline/owner/approver/state`。

## AI-PMO System V5.3.20

V5.3.20 将迁移中心补齐“正式切换前最后一公里”：新增 `src/features/migration/cutover-decision.ts` 和 `/api/migration/cutover-decision/report`，基于迁移成熟度、字段映射方案、多轮试迁移批次、整改关闭率、飞书写入配置、权限安全、回滚预案和业务签字生成 Go/No-Go 决策包。`/migration-center` 新增“正式迁移前检查清单与 Go/No-Go 决策包”区域，区分系统证据和人工确认项，展示阻断项、待补充项、下一步动作，并可下载带签字栏的 Markdown 决策材料。本版本不新增数据库脚本，复用 V5.3.13、V5.3.16、V5.3.18 已有迁移证据。

## AI-PMO System V5.3.19

V5.3.19 将迁移中心的历史批次从“列表查看”升级为“多轮趋势对比与 Go/No-Go 决策辅助”：新增 `src/features/migration/batch-comparison.ts` 和 `/api/migration/batch-comparison/report`，复用 V5.3.13 试迁移批次与 V5.3.16 整改行动项数据，计算字段覆盖率变化、质量问题变化、高优先级问题变化、整改关闭率和 Go/No-Go 建议。`/migration-center` 新增“试迁移批次对比与问题关闭率”区域，可查看最近轮次改善/退化、最新批次指标、下一步动作，并下载多轮试迁移对比报告。本版本不新增数据库脚本。

## AI-PMO System V5.3.18

V5.3.18 将迁移中心的字段映射从“单次分析结果”升级为“可保存、可复用、可差异检查”的方案库：新增 `supabase-v5318-migration-field-mapping-profiles.sql`、`/api/migration/field-mappings` 和 `src/features/migration/field-mapping-repository.ts`，支持保存字段映射方案、来源字段、覆盖率、缺失字段数和人工备注。`/migration-center` 新增“保存字段映射方案”和“字段映射方案库”，用户选择历史方案后会先看到匹配度、变化字段、新增/缺失来源字段和未映射字段，不会静默套用历史映射。

## AI-PMO System V5.3.17

V5.3.17 将迁移整改行动项接入“飞书任务回写确认队列”：新增 `supabase-v5317-migration-remediation-feishu-sync.sql` 与 `/api/migration/remediation-actions/feishu-sync`，为已保存整改项增加飞书同步状态、任务 GUID/链接、同步错误和请求 ID。`/migration-center` 的整改行动项跟踪表新增“飞书任务”列，支持“准备同步飞书 → 待确认 → 确认写入飞书任务 → 已同步/同步失败”的显式确认流程；写入时复用个人飞书配置优先、全局飞书兜底的任务创建能力，并写入操作审计。系统内整改项仍是主记录，飞书任务只作为协同执行通道。

## AI-PMO System V5.3.16

V5.3.16 将迁移整改行动项从“可生成清单”升级为“可保存、可跟踪、可流转”：新增 `supabase-v5316-migration-remediation-actions.sql`、`/api/migration/remediation-actions` 和 `src/features/migration/remediation-repository.ts`，支持保存迁移整改项、读取历史整改项，并在系统内流转“待处理 → 处理中 → 待复检 → 已关闭”。`/migration-center` 新增“保存整改行动项”和“整改行动项跟踪”区域；当前仍不直接写飞书任务，下一阶段再进入飞书任务回写确认队列。

## AI-PMO System V5.3.15

V5.3.15 将迁移中心的质量问题进一步转换为“整改行动项”：新增 `buildMigrationRemediationActions`，每个问题会形成标题、优先级、责任角色、建议截止日期、状态、来源问题、样例、修复建议和验收标准；`/migration-center` 在试迁移分析后展示整改行动项，迁移评审报告同步加入“整改行动项”章节。该版本仍不写入 Supabase 或飞书任务，先完成可执行整改清单的生成和评审输出，为后续持久化、状态流转和飞书任务回写打基础。

## AI-PMO System V5.3.14

V5.3.14 将迁移中心补齐“评审输出物”：新增 `/api/migration/report` 和 `buildMigrationReviewReport`，可基于当前试迁移分析下载 Markdown 评审报告/修复清单，内容包括评审结论、字段映射确认表、数据质量问题与修复清单、下一步动作、迁移评审签字栏和生成边界。该能力不依赖 Supabase SQL，适合在迁移批次保存前先输出会议材料；如果已执行 V5.3.13 SQL，仍可先保存批次再下载同一批次名称的报告。

## AI-PMO System V5.3.13

V5.3.13 将 `/migration-center` 的试迁移结果从一次性页面报告升级为“迁移批次管理”：新增 `supabase-v5313-migration-batches.sql`、`/api/migration/batches` 和迁移批次仓储模型，支持保存每次试迁移的字段覆盖率、质量问题、高优先级问题、准入结论、原始分析 JSON 和下一步动作；页面新增“保存为迁移批次”和“历史迁移批次”，SQL 未执行时仍可继续分析文件，并明确提示需要在 Supabase SQL Editor 执行脚本后才能保存历史记录。保存成功会写入操作审计，便于正式迁移前复盘和评审。

## AI-PMO System V5.3.12

V5.3.12 将 `/migration-center` 从迁移评估入口升级为第一版“试迁移作业台”：新增迁移模板下载 `/api/migration/template`，新增试迁移文件分析 `/api/migration/analyze`，支持 xlsx/xls/csv 小批量迁移包分析；系统会输出字段映射、字段覆盖率、重复编号、空值、日期/金额格式、高风险缺少应对动作等质量问题，并给出是否可进入试迁移及下一步动作。该版本仍不写入数据库或飞书，适合在正式迁移前做数据可迁移性验证。

## AI-PMO System V5.3.11

V5.3.11 按“竞品A忠实用户永久迁移条件”新增 `/migration-center`「迁移与数据接入中心」：提供迁移成熟度自评、永久迁移条件检查、迁移阶段门、数据对象清单和字段质量检查要求；首页 PMO操作系统分区与数据与集成中心均新增入口。该版本先完成不依赖数据库的迁移决策和试迁移准备闭环，为后续接入真实导入日志、字段映射结果、试点反馈和正式迁移模板打基础。

## AI-PMO System V5.3.10

V5.3.10 优化「项目全流程交付管理蓝图」BPM 子页面：扩大流程画布和项目泳道高度，修复文本框/箭头标签重叠；将原图蓝色编号说明 ①-⑩ 固定放回对应流程位置；移除原图红色疑问描述；在蓝图数据源补齐 WBS拆解、制定资源计划、项目预算审批、项目进度管理、资源管理、里程碑管理下方的子任务节点，并由页面统一渲染短虚线父子关系。

## AI-PMO System V5.3.9

V5.3.9 修正蓝图信息架构与展示样式：首页「蓝图v2-BPM视图」入口恢复指向原 `/blueprint-v3`，原蓝图v2-BPM视图继续保留；`/blueprint-v3/delivery-management` 作为独立子页面「项目全流程交付管理蓝图」存在。该子页面从看板式展示重做为 BPM 泳道流程图，使用销售管理、项目管理、监控管理、成本管理、工具五条泳道，并通过箭头表达流程流转、跨泳道触发和节点状态变更。

## AI-PMO System V5.3.8

V5.3.8 修复管理员安全中心 P9 SQL 误报：`/admin/security` 不再通过 Supabase 嵌套关系 `app_users(name,email)` 读取项目授权，改为先读取 `app_users` 与 `user_project_access_grants` 后在服务端完成用户名称映射，避免 PostgREST schema cache 的 relationship 错误被误判为 `user_project_access_grants` 表不存在；同时收窄缺表判断逻辑，只在真实缺表时显示“P9 SQL 未执行”。

## AI-PMO System V5.3.7

V5.3.7 完成蓝图v2-BPM视图正式优化：新增 `/blueprint-v3/delivery-management`「项目全流程交付管理蓝图」子页面，将原附件流程图结构化为销售管理、项目管理、监控管理、成本管理和工具支撑五类泳道；沉淀 7 个销售节点、4 个项目交付阶段、10 个交付经营联动控制点、3 条贯穿监控轨道和成本管理闭环。首页「蓝图v2-BPM视图」入口已直达正式页面，旧 `/blueprint-v3` 继续保留为蓝图入口和原图参考。

## AI-PMO System V5.3.6

V5.3.6 完成 P10「企业化运营增强」第一版：新增 `supabase-v536-security-ops.sql`，创建 `project_access_requests` 表、索引和更新时间触发器；普通用户可在 `/account/project-access` 提交项目访问申请，管理员可在 `/admin/security` 审批或驳回，批准后自动生成项目级授权；管理员安全中心新增安全风险面板、待审批访问申请列表，以及 Markdown/CSV 审计导出入口；新增 `/api/admin/security/export`，导出用户角色、项目授权、访问申请、审计日志和风险提示，响应全部 `no-store` 且不包含密钥字段。本版同时移除未使用的 `echarts` / `echarts-for-react` 运行时依赖，减少供应链暴露面。

## AI-PMO System V5.3.5

V5.3.5 是 P9 安全热修版本：`/api/admin/security` 管理员安全中心接口所有响应显式增加 `Cache-Control: no-store`，避免管理员权限、项目授权和审计数据被中间层缓存。

## AI-PMO System V5.3.4

V5.3.4 完成 P9「权限、审计与企业化」第一版：新增 `supabase-v534-enterprise-security.sql`，创建项目级授权、操作审计日志和系统配置表；新增统一权限矩阵，管理员拥有用户管理、项目管理、配置管理和审计查看权限，普通用户只能访问本人负责或被显式授权的项目、治理/风险和报告能力；项目组合看板、业财经营驾驶舱、PM/PMO工作台和报告工厂已接入项目级数据过滤，避免普通用户跨项目查看全量飞书项目台账；新增 `/admin/security` 管理员安全配置中心，支持查看权限矩阵、调整用户角色/状态、授予/撤销项目访问权限、查看操作审计日志和保存企业安全策略配置；关键读写动作写入 `operation_audit_logs`，审计详情会脱敏 secret/token/api key/password 等字段；表格上传解析新增后缀、MIME、大小和行数限制，用于缓解 `xlsx` 上游暂无修复版本的上传解析风险。

## AI-PMO System V5.3.3

V5.3.3 完成 P8「报告工厂与会议闭环」第一版：重构 `/reports` 页面和 `/api/reports`，支持项目周报、PMO月报、项目进度报告、会议纪要和验收报告；报告生成会聚合用户录入、飞书项目台账、业财经营驾驶舱、风险/回款预警和 AI 依据审计，不再只生成孤立文本；会议纪要支持按「事项｜责任人｜截止日期｜优先级」识别行动项，并可转入 P5 统一行动项链路继续跟踪；报告结果展示数据来源、输入/输出摘要、模型、置信度和审计写入状态，P6 SQL 未执行时不阻断报告生成；首页入口已调整为“报告工厂与会议闭环”。

## AI-PMO System V5.3.2

V5.3.2 完成 P7「业财一体化经营驾驶舱」第一版：新增 `/finance` 页面和 `/api/finance`，复用飞书项目台账真实数据，把合同额、预算/成本、已回款、应收、预计毛利、毛利率、验收状态和到期日统一到项目经营口径；成本字段优先读取飞书中文字段「实际成本、预计成本、预算金额、计划成本」，缺失时基于合同额、成本健康度和项目进度进行估算并明确标记为 derived，不冒充真实财务结果；新增回款节点与验收/收尾状态联动，识别验收阻塞回款、逾期应收、低毛利、成本超预算和回款滞后；经营预警可转入 P5 统一行动项，形成责任人、deadline 和关闭证据闭环；首页新增业财一体化驾驶舱入口。

## AI-PMO System V5.3.1

V5.3.1 完成 P6「AI 依据与审计」：新增统一 AI 证据结构和 `supabase-v531-ai-evidence-audit.sql`，用于持久化 AI 输出场景、模型、置信度、输入摘要、输出摘要、依据来源、引用、建议动作和审计人；新增 `/api/ai/evidence` 读写 AI 依据审计。商业论证、风险扫描、执行状态摘要现在都会展示依据、引用、置信度和审计状态；风险扫描和执行状态摘要会把服务端模型调用或规则兜底结果一并记录；商业论证、风险扫描、执行摘要和每日工作台的 AI 建议均可转为 P5 统一行动项，进入责任人、deadline、状态和关闭证据闭环。

## AI-PMO System V5.3.0

V5.3.0 完成 P5「风险-问题-变更-行动项链路」：新增 `supabase-v530-issue-change-action-chain.sql`，创建问题、变更、统一行动项和审计事件四张表；新增 `/api/issue-change`，支持风险升级为问题、问题状态流转、问题触发变更、变更影响范围/成本/进度/收入/回款录入、变更审批实施和行动项关闭证据；新增 `/api/issue-change/report` 下载 Markdown 链路报告；新增 `/issue-change` 页面，让使用者参与录入、审批、实施和关闭，不再用静态展示代替事务闭环；首页和风险管理页已接入 P5 入口。

## AI-PMO System V5.2.9

V5.2.9 完成 P4「治理流程持久化」：新增 `supabase-v529-governance-workflows.sql`，创建治理流程实例、状态流转审计和行动项表；新增 `/api/governance/workflows`，支持治理流程实例创建、提交、审批、有条件通过、退回、驳回和关闭；新增 `/api/governance/workflows/[id]/report`，可下载 Markdown 输出报告；治理工作流中心从静态说明页升级为可操作页面，支持录入输入材料、审批意见、输出成果和行动项；治理动作会写入 Supabase 审计日志，并尝试回写飞书同步账本，失败不阻断主流程。

## AI-PMO System V5.2.8

V5.2.8 完成 P3「工作台真实数据驱动」：`/api/operating-system/workbench` 改为从飞书项目、风险、任务、里程碑和回款表实时聚合；普通用户按姓名、邮箱、手机号匹配项目经理/责任人字段，管理员显示全量视角；工作台页面新增数据范围、我的项目、我的风险、今日待办、经营提醒，并保留重点项目进度链和 AI 今日建议；AI 建议明确展示扫描记录数、P0事项、高风险、经营提醒等依据；工作台生成动作会写入 Supabase `integration_sync_logs`，便于审计。

## AI-PMO System V5.2.7

V5.2.7 完成 P2「数据质量与同步日志」：`/api/operating-system/integrations` 从状态聚合升级为可运行诊断层，新增飞书字段映射检查、实时业务数据质量扫描、故障诊断建议和同步日志写入；数据与集成中心页面新增字段缺口、数据质量样例、处理建议和同步日志展示；新增 `/api/operating-system/sync-logs` 与 `supabase-v527-integration-sync-logs.sql`，用于在 Supabase 持久化集成健康检查日志；字段要求全部以中文业务字段展示，避免把页面做成静态演示。

## AI-PMO System V5.2.6

V5.2.6 修复数据与集成中心的 RAG 健康字段兼容：线上 `/api/operating-system/integrations` 透传 RAG 健康检查时使用 `index_version`、`page_count`、`retrieval_mode` 等 snake_case 字段，页面现在同时兼容 snake_case 和 camelCase，避免知识库索引版本、语料数量、检索模式显示为 undefined。

## AI-PMO System V5.2.5

V5.2.5 将“PM/PMO真实使用视角”的增强建议沉淀为正式需求与任务计划，并落地第一批 P1 功能入口：新增 `docs/ai-pmo-pm-pmo-operating-system-requirements-2026-07-01.md`，同时同步到主工作区可见知识库；首页新增“PMO操作系统”分区，接入 `/workbench` PM/PMO每日工作台、`/integration-center` 数据与集成中心、`/governance-workflows` 治理工作流中心；新增 `/api/operating-system/integrations` 聚合 AI模型、飞书、RAG 和数据质量规则的脱敏状态，新增 `/api/operating-system/workbench` 基于飞书项目组合数据生成今日动作、重点项目进度链和 AI 建议依据；治理工作流中心固化立项评审、阶段门、变更评审、风险升级和项目收尾验收的输入、输出、责任人、状态和审计要求，为后续 Supabase 持久化审批、飞书回写、风险-问题-变更-行动项链路打通奠定结构。

## AI-PMO System V5.2.4

V5.2.4 增加首页运行时模型显示与默认配置回退：`/api/auth/me` 返回脱敏的当前 AI 模型摘要，首页顶部和“模型路由”区域显示当前模型名称、配置来源和待配置状态，不暴露 API Key；登录用户未配置个人飞书时，飞书后端能力自动回退到管理员全局飞书配置，避免项目台账、看板、健康检查等功能因个人配置为空而失效；保留项目台账直达当前飞书多维表格视图的链接；新增 `npm run config:seed-runtime` 脚本，用于在 Supabase 中为管理员账号写入 MiniMax-M3 与飞书表映射配置，脚本输出仅显示配置状态，不打印密钥。

## AI-PMO System V5.2.3

V5.2.3 修复关键路径计算页的网络图重叠问题：将原先按最早开始时间比例压缩的横向布局，改为按任务依赖层级分列、同层任务分泳道的稳定布局；节点宽高加大并显示 ES/EF、LS/LF 和浮动时间；依赖箭头改为正交折线，普通依赖走列间空白通道，长跨度依赖从顶部通道绕行，避免箭头穿过任务框；新增 `src/lib/cpm-network.ts` 纯布局计算与回归测试，验证依赖节点左右分层、节点不重叠、跨层依赖可生成绕线路径。

## AI-PMO System V5.2.2

V5.2.2 将风险管理和规划中心继续从“展示型模块”升级为“使用者参与的事务工作流”：新增 `/risk/sensitivity` 风险敏感性分析，支持录入基准值、低值、高值和影响方向，生成敏感度排序、龙卷风图和可下载分析报告；新增 `/risk/tracking` 风险跟踪管理，从正式风险登记册选择风险，录入本次动作、下一步动作、责任人和deadline，并写回风险工作流审计；新增 `/templates` 工具/模板下载中心，植入风险登记册、风险应对计划、项目风险跟踪、敏感性分析、中途接手项目和新项目接手最佳实践模板，支持风险模板导入正式登记册；规划中心新增 `/planning/takeover` 中途接手项目工作流和 `/planning/new-project` 新项目接手最佳实践工作流，基于用户输入生成可下载输出报告；用户中心新增个人 AI 模型配置，支持 DeepSeek、MiniMax、GLM、Anthropic 和 OpenAI-compatible，并新增个人飞书接入配置，飞书看板/健康检查/立项写入优先使用当前登录用户的飞书配置，缺配置时给出网页端与 lark-cli 本机直连提示；新增 `supabase-v522-user-config.sql` 用于创建用户 AI 设置和个人飞书连接表。

## AI-PMO System V5.2.1

V5.2.1 将风险管理从“页面交互原型”升级为“可持久化的正式管理闭环”：新增 `/api/risk` 的 GET/POST/PATCH/DELETE 风险登记册接口，风险新增/编辑写入 Supabase，状态流转写入 `risk_workflow_events` 审计表；新增 `supabase-risk-v521.sql` 增量迁移脚本，扩展风险表字段，支持项目名称、风险编号、阶段、来源、影响领域、紧迫度、优先级、应对策略、预防措施、应急计划、触发条件、跟踪方法、责任人、deadline、复核日期、关闭条件、关联模块、证据、当前输入/输出和管理动作；风险页面新增“工作流追踪”，覆盖识别风险、分析风险、规划应对、实施应对、监督风险、执行跟踪，每个环节都有输入、输出、状态变更、责任人和deadline；AI风险扫描与飞书项目台账导入会直接写入正式登记册，不再只停留在前端临时状态。

## AI-PMO System V5.2.0

V5.2.0 修复并扩展项目组合、关键路径和风险管理：项目健康矩阵散点改为固定实心圆，避免 SVG 拉伸导致圆点变椭圆；项目组合看板新增“重点项目进度链”，支持飞书中文字段 `重点项目标记`、`重点项目原因`、`执行阶段进度`、`监控阶段进度`、`收尾阶段进度`，并在字段缺失时按项目等级、合同金额、风险、进度偏差和应收金额自动识别重点项目；关键路径 AI 计算改为本地 CPM 稳定计算优先、AI 只生成解释，LLM格式异常不再导致计算失败，并优化网络图泳道和关键连线；风险管理模块按风险识别、分析、应对、跟踪、关闭闭环重构，吸收风险核查表、风险跟踪表、风险管理计划、定性分析表和风险种类清单，新增总览闭环、风险登记册、核查清单、P-I矩阵、应对跟踪，支持从飞书项目台账导入风险线索和 AI/规则兜底扫描。

## AI-PMO System V5.1.9

V5.1.9 修复项目组合看板“回款分组（账龄）”口径和展示：原逻辑按回款率分桶，且把应收金额为0的已回款项目计入账龄，导致“>90天项目数很大但金额为0”等异常；新逻辑仅统计应收金额大于0的项目，并按到期日划分未到期、逾期1-30天、逾期31-60天、逾期61-90天、逾期90天以上、未设到期日。柱状图同步显示金额和项目数，并增加无应收金额时的空状态说明。

## AI-PMO System V5.1.8

V5.1.8 补强项目组合看板图表修复：本地缓存升级到 `ai-pmo-dashboard-data-v3`，页面加载时会读取旧 v1/v2 缓存并基于 records 重新计算月度趋势、健康矩阵等衍生图表数据，避免用户浏览器仍持有旧飞书缓存导致“月度趋势仍为空”；`monthKey` 同步支持飞书时间戳字符串，新增旧缓存回归测试。

## AI-PMO System V5.1.7

V5.1.7 修复项目组合看板图表异常：飞书日期字段支持毫秒时间戳、秒级时间戳、Excel日期序列号和 yyyymmdd 字符串，月度趋势从飞书实时数据中恢复按年月聚合曲线；月度趋势图补充空数据提示、单点趋势绘制和横向网格线；项目健康矩阵重做绘图区、坐标轴和健康说明布局，避免图例与坐标说明重叠；新增 dashboard normalizer 回归测试防止飞书时间戳再次导致趋势为空。

## AI-PMO System V5.1.6

V5.1.6 将“申请使用”页面升级为与用户注册页一致的浅色 glassmorphism 玻璃拟态：复用薰衣草渐变背景、白色半透明毛玻璃容器、通透输入框和玻璃质感按钮；保留申请提交接口、提交成功后按钮置灰并等待审核的业务逻辑。

## AI-PMO System V5.1.5

V5.1.5 将用户注册页升级为浅色 glassmorphism 玻璃拟态：使用薰衣草渐变背景、白色半透明毛玻璃容器、柔和光斑层次、通透输入框和玻璃质感按钮；保留原有注册接口、注册码自动大写、成功后禁止重复提交等业务逻辑。

## AI-PMO System V5.1.4

V5.1.4 优化账号体系界面与审核状态：登录页改为拟物化风格，使用木质桌面、纸张卡片、内嵌输入框和实体按钮质感；用户中心改为拟物化身份卡与完整用户信息展示，每项信息后提供独立修改按钮；注册审核页将申请状态改为中文状态展示，只有“待审核”可审批，已同意/已注册状态刷新后不再重复要求管理员审核；后端审批接口也限制仅 pending 申请可发码。

## AI-PMO System V5.1.3

V5.1.3 完善登录注册体验：注册时用户名称改为必填；登录后首页问候语前显示用户名称，顶部不再显示“登录/申请使用”，改为“用户中心”，管理员额外显示“注册审核”；新增用户中心 `/account`，支持修改用户名称、邮箱、手机号和密码；用户申请提交成功后按钮置灰并显示“申请已提交，请等待审核”，后端也阻止同一邮箱或手机号重复提交待处理申请。

## AI-PMO System V5.1.2

V5.1.2 新增生产环境首次管理员初始化接口 `/api/auth/bootstrap-admin`。该接口只读取 Vercel 服务端环境变量中的 `ADMIN_EMAIL`、`ADMIN_PHONE`、`ADMIN_PASSWORD` 和 Supabase service role，不接受外部传入账号密码；当系统已存在管理员时不覆盖，便于在 Vercel 敏感变量无法回拉到本机的情况下完成首次初始化。

## AI-PMO System V5.1.1

V5.1.1 将监控中心从页面硬编码演示数据改为优先读取飞书项目台账实时数据：复用 `/api/dashboard/feishu` 的标准化数据源，由项目进度、合同金额、已回款、应收、风险、状态等字段派生健康概览、进度、经营/EVM代理指标、范围、质量、风险、变更和绩效视图。飞书不可用时页面显示连接失败和零值状态，不再用静态假数据伪装为业务数据。

## AI-PMO System V5.1.0

V5.1.0 新增申请制注册登录框架：支持用户申请、管理员审批、一次性注册码、邮箱发码、邮箱/手机号注册、密码规则校验、Supabase 用户/会话/注册码表和管理员初始化脚本；MiniMax 默认模型切换为 `MiniMax-M3` 且密钥仅通过环境变量注入；修复规划中心 AI 接口路径、执行与交付页 AI 摘要崩溃和新增按钮无响应；项目组合看板增强空/单点趋势兜底并优化健康矩阵排版；关键路径页新增网络图；监控中心补充数据源说明，PMO治理中心完成排版优化，立项商业论证补充 AI 生成依据说明。

## AI-PMO System V5.0.10

V5.0.10 修正飞书项目组合看板的数据口径：从飞书拉取项目数据时，以项目台账中的合同金额、已回款金额、应收金额、回款率为 KPI 主口径，合同/回款/风险表作为关联明细和风险补充，不再将回款计划表的应收节点反向均摊到项目 KPI；同时优先展示样例源表的“当前状态”，便于导入样例数据后保持看板分布一致。

## AI-PMO System V5.0.9

V5.0.9 修复项目组合看板首屏闪现后被覆盖的问题：默认不再静默自动拉取飞书数据，避免样例数据被飞书当前少量数据覆盖；同时更换本地缓存键并清理旧缓存，防止历史缓存导致看板从 56 条样例数据切换为空或少量数据。用户仍可手动点击“从飞书智能表拉取”切换数据源。

## AI-PMO System V5.0.8

V5.0.8 将用户提供的「作业帮/项目台账&一表通/项目/样例数据源.xlsx」转换为项目组合看板默认样例数据源。看板默认展示 56 条项目记录，并继续保留 Excel/CSV 导入、中文字段模板下载和飞书智能表拉取能力；当用户导入文件或拉取飞书后，会切换为对应真实数据源。

## AI-PMO System V5.0.7

V5.0.7 将项目组合看板从静态演示改为数据驱动：支持从 Excel/CSV 文件导入、下载中文字段导入模板、从飞书智能表拉取项目/风险/合同/回款数据，并在保持原有 KPI、状态分布、趋势、省域、账龄、项目分级、健康矩阵、风险列表和回款计划展示不减少的前提下，按缺失字段自动补充可解释测试值。

## AI-PMO System V5.0.6

V5.0.6 修复飞书原始 OpenAPI 写入项目台账时的日期字段格式：服务端接口使用毫秒时间戳写入日期/时间字段，兼容飞书 Bitable v1 记录创建接口；CLI 写入仍可使用可读日期字符串。

## AI-PMO System V5.0.5

V5.0.5 修复主页阶段标签、蓝图入口命名、PMO治理中心返回首页入口、知识库问答错误可诊断性，并把项目组合看板、LTC全流程和立项管理中的飞书入口接入真实多维表格表/视图。立项页现在可通过服务端接口写入飞书项目台账，覆盖项目类型、发起人、业务立项理由、申请日期等字段。

## AI-PMO System V5.0.4

V5.0.4 将审定知识扩展为27篇，并建立长期 Bot 身份下的飞书事件与动作闭环；同时将PMO Base健康检查与同步账本统一到飞书 Bitable v1 协议，确保8张业务表、账本查重和状态回写使用同一套真实接口模型。本版补齐生产 `FEISHU_VERIFICATION_TOKEN`，用于验证飞书明文事件回调 URL challenge。

### 已实现

- `POST /api/rag/query`：27篇审定知识的确定性 `lexical-hybrid` 检索，保留密级过滤、引用和拒答。
- `GET /api/rag/health`：如实报告27页、0向量和 `lexical-hybrid`，不把本地词法检索冒充向量检索。
- `POST /api/integrations/feishu/events`：支持明文 URL 校验和 V2 事件，校验 verification token、事件类型和事件ID。
- 飞书同步账本：处理前持久化、重复事件去重、失败状态和最多3次重试。
- `POST /api/integrations/feishu/actions`：以服务器端 Bot 身份发送消息、创建任务、创建日程和发布结构化文档。
- 动作接口由独立 Bearer 密钥保护；消息/任务叠加飞书原生幂等键；日程添加参会人失败时自动回滚空日程。
- `npm test`：41项自动化测试，含30题V2黄金问题 Top1 全通过。

### 飞书服务器配置

除8张Base表映射外，生产环境还需配置：

```text
FEISHU_VERIFICATION_TOKEN
FEISHU_EVENT_ALLOWED_TYPES=im.message.receive_v1
AI_PM_INTEGRATION_API_KEY
FEISHU_DOCUMENT_PARENT_TOKEN
FEISHU_DOCUMENT_GRANT_OPEN_ID
```

飞书事件订阅地址为 `https://pmai.chunyu2026.qzz.io/api/integrations/feishu/events`。当前只接受明文回调；加密载荷会明确拒绝。动作接口只接受服务器到服务器调用，不应把 `AI_PM_INTEGRATION_API_KEY` 暴露给浏览器。

### 当前边界

- AI-PM部署内的检索仍为词法与元数据加权；本地 GBrain 向量混合检索单独运行，不在部署健康接口中冒充生产向量。
- 实时项目清单公共查询仍未开放；需要先完成用户登录、行级权限和查询审计。
- Bot创建的日历属于Bot主日历，必须邀请用户；Bot创建的文档建议放入已共享文件夹。
