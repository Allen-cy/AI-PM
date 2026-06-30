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
