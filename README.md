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

## AI-PMO System V4.0

V4.0 将知识问答从演示 Mock 切换为真实、可追溯的项目管理知识快照。首批语料来自 AI-PMO-SYS 中10篇 `reviewed` 综合知识页。

### 已实现

- `POST /api/rag/query`：中文关键词检索、领域/状态/密级过滤、引用、拒答和审计ID。
- `GET /api/rag/health`：索引版本、页面数、检索模式和向量状态。
- `/knowledge`：展示真实 `KB-xxxx` 与 `SRC-xxxx` 引用。
- `/api/knowledge`：旧客户端兼容入口，已移除 Mock 生成器。
- `npm test`：20个RAG、飞书、契约、拒答、权限、证据门槛和摘录质量测试。
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
