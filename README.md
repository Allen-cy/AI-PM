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

## AI-PMO System V5.0

V5.0 将审定知识扩展为27篇，并建立长期 Bot 身份下的飞书事件与动作闭环。

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

飞书事件订阅地址为 `/api/integrations/feishu/events`。当前只接受明文回调；加密载荷会明确拒绝。动作接口只接受服务器到服务器调用，不应把 `AI_PM_INTEGRATION_API_KEY` 暴露给浏览器。

### 当前边界

- AI-PM部署内的检索仍为词法与元数据加权；本地 GBrain 向量混合检索单独运行，不在部署健康接口中冒充生产向量。
- 实时项目清单公共查询仍未开放；需要先完成用户登录、行级权限和查询审计。
- Bot创建的日历属于Bot主日历，必须邀请用户；Bot创建的文档建议放入已共享文件夹。
