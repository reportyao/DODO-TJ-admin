# DODO-TJ 批量商品上架服务

基于阿里云百炼（Qwen-VL 视觉模型）的独立批量商品上架处理服务，专为 DODO-TJ 十元店平台设计。

## 核心特性

- **彻底解决超时问题**：独立于 Supabase Edge Function 运行，不受 150 秒限制
- **AI 自动识别**：拍照即上架，Qwen-VL 自动识别商品名称、规格、材质等信息
- **三语文案生成**：自动生成塔吉克语、俄语、中文三种语言的商品标题和描述
- **异步任务队列**：基于数据库状态机的可靠任务处理，支持失败重试和断点续传
- **灵活的并发控制**：可配置同时处理的商品数量，避免 API 限流

## 项目结构

```
dodo-batch-listing/
├── processor.mjs           # 核心处理服务（长驻进程）
├── upload-images.mjs       # 本地图片上传工具
├── quick-add.mjs           # URL 模式快速上架工具
├── manage-tasks.mjs        # 任务管理工具
├── 001_batch_upload_tables.sql  # 数据库迁移脚本
├── ecosystem.config.cjs    # PM2 部署配置
├── .env.example            # 环境变量模板
├── .env                    # 环境变量（需配置）
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
cd dodo-batch-listing
npm install
```

### 2. 执行数据库迁移

在 Supabase Dashboard 的 SQL Editor 中执行 `001_batch_upload_tables.sql`。

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
```

### 4. 启动处理服务

```bash
# 开发模式
node processor.mjs

# 生产模式（使用 PM2）
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs dodo-batch-listing
```

### 5. 上传商品图片

```bash
# 方式一：上传本地图片目录
node upload-images.mjs ./photos --price 39.90 --batch-name "新品上架"

# 方式二：通过 URL 列表快速上架
node quick-add.mjs urls.txt --price 29.90
```

### 6. 管理任务

```bash
node manage-tasks.mjs list              # 查看所有批次
node manage-tasks.mjs status <batch_id> # 查看批次详情
node manage-tasks.mjs retry <batch_id>  # 重试失败任务
node manage-tasks.mjs stats             # 查看总体统计
```

## 处理流程

```
拍照/上传图片 → Supabase Storage → 创建任务 → 队列等待
                                                  ↓
                                          Processor 拉取任务
                                                  ↓
                                    Step A: Qwen-VL 视觉识别
                                                  ↓
                                    Step B: 三语文案生成
                                                  ↓
                                    Step C: AI 商品理解
                                                  ↓
                                    写入 inventory_products
                                                  ↓
                                          更新任务状态 ✓
```

## 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `SUPABASE_URL` | 是 | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase Service Role Key |
| `DASHSCOPE_API_KEY` | 是 | 阿里云百炼 API Key |
| `CONCURRENCY` | 否 | 并发处理数量，默认 3 |
| `POLL_INTERVAL_MS` | 否 | 轮询间隔（毫秒），默认 10000 |
| `MAX_RETRY_COUNT` | 否 | 最大重试次数，默认 3 |
| `AI_REQUEST_TIMEOUT_MS` | 否 | AI 请求超时（毫秒），默认 60000 |
| `DEFAULT_PRICE` | 否 | 默认价格，默认 39.90 |
| `DEFAULT_STOCK` | 否 | 默认库存，默认 100 |
| `DEFAULT_CURRENCY` | 否 | 默认货币，默认 TJS |
