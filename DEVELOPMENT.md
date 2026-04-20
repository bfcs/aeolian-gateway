# 开发文档

## 环境部署

项目基于 Cloudflare Workers 部署，以 `wrangler.jsonc` 和 `scripts/deploy.sh` 为准。

| 环境 | Worker 名称 | 域名 | D1 数据库 | 部署命令 |
| :--- | :--- | :--- | :--- | :--- |
| Production | `ai-gateway` | `your-gw.example.com` | `ai-gateway-db` | `pnpm run deploy` |

## 开发环境

### 1. 前置依赖

- Node.js 20+
- npm 或 pnpm
- Cloudflare 账号 + Wrangler 已登录

```bash
pnpm dlx wrangler login
pnpm install
```

### 2. 本地环境变量

把 `.dev.vars.simple`复制一份并重命名为 `.dev.vars`，然后在 `.dev.vars`修改你的密码

- `ADMIN_PASSWORD`：管理员密码

### 3. 数据库初始化

初始化本地 D1：

```bash
pnpm exec wrangler d1 execute ai-gateway-db --file=./schema.sql --local
```

初始化远程 D1（生产）：

```bash
pnpm exec wrangler d1 execute ai-gateway-db --file=./schema.sql --remote
```

### 4. 启动开发

```bash
pnpm dev
```

本地 Cloudflare Worker 预览：

```bash
pnpm preview
```

### 5. 常用命令

```bash
pnpm build
pnpm lint
pnpm cf-typegen
```

## 测试

运行全部测试：

```bash
pnpm test
```

运行单文件：

```bash
node tests/01-auth.test.mjs
```

本地模式（指向 `http://localhost:3000`）：

```bash
node tests/01-auth.test.mjs --local
# 或
TEST_LOCAL=1 node --test tests/01-auth.test.mjs
```


## 部署（重点）

### 推荐方式：使用 `scripts/deploy.sh`

脚本可以自动化构建和 Secrets 同步。

```bash
./scripts/deploy.sh production
```

### 直接部署命令（不走脚本）

```bash
pnpm run deploy
```



## D1 同步

使用 `scripts/d1-sync.sh` 在本地 D1 与远程 D1 间同步：

```bash
# 下载远程 -> 本地
./scripts/d1-sync.sh download production [table]

# 上传本地 -> 远程
./scripts/d1-sync.sh upload production [table]
```

示例：

```bash
./scripts/d1-sync.sh download
./scripts/d1-sync.sh upload staging providers
```

## 网关鉴权与路由

### 网关鉴权入口

下列方式都可作为网关 API Key：

- `Authorization: Bearer <gateway-key>`
- `x-goog-api-key: <gateway-key>`
- `x-api-key: <gateway-key>`
- `?key=<gateway-key>`

### 显式协议路由

请求路径统一为：

- `/api/openai/...`
- `/api/google/...`
- `/api/anthropic/...`

网关按以下顺序做路由：

1. 过滤可用规则（规则启用 + Provider 启用 + Provider 至少一把启用 Key）
2. 别名优先，按权重选择命中规则
3. 在命中 Provider 的可用 Key 中按权重选 Key
4. 对 429/503/401 触发 Key 级重试（最多 3 次）

### 协议细节

- Anthropic 上游请求自动注入 `x-api-key` 和 `anthropic-version`
- Gemini OpenAI 兼容修复：
  - `tool_call.id` 编解码 `extra_content`（保留 thought signature）
  - 清理 assistant 空 `content`
  - tool 文本结果包装为 JSON 字符串

## 测试
1. 查看 `tests/README.md`
2. `.dev.vars.test.simple` 测试需要用到的环境变量模板