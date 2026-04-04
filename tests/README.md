# Aeolian AI Gateway 功能测试点指南

本方案涵盖了网关的核心逻辑测试，旨在验证身份验证、路由算法、协议转换及日志系统的正确性。

## 0. 测试配置

### 0.1 环境变量 (.dev.vars)
在根目录的 `.dev.vars` 中配置以下信息：
1. `HOST`：网关的 Host 地址，**默认用于远程/线上环境测试**
2. `API_KEY`：用于测试的网关 API Key。
3. `PROVIDERS_LINK`：下载 Providers 使用的官方订阅链接。
4. `GOOGLE_MODEL_ID`: Google 类型的 Model ID。
5. `GOOGLE_OPENAI_COMPATIBLE_MODEL_ID`: OpenAI 兼容模式的 Gemini Model ID。
6. `OPENAI_MODEL_ID`: OpenAI 类型的 Model ID。
7. `ANTHROPIC_MODEL_ID`: Anthropic 类型的 Model ID。
8. `KEY_WEIGHTS_MODEL_ID`: 测试 Key 层负载均衡的 Model ID。
9. `MODEL_ALIAS_MODEL_ID`: 测试 Model 别名层负载均衡的 Model ID。
10. `DISABLED_MODEL_ID`: 测试已禁用 Provider 的 Model ID。
11. `DISABLED_MODEL_ALIAS`: 测试已禁用 Model Alias。
12. `DISABLED_GATEWAY_KEY`: 测试已禁用 Gateway Key。
13. `DISABLED_ALIAS_TARGET_MODEL_ID`: 测试 Alias 未禁用但 Target Model 已禁用的场景。
14. `MULTI_TYPES_MODEL_ID`: 测试如果一个model id有多个type的provider根据路径能否正确路由


### 0.2 执行测试
测试脚本支持通过参数切换环境。你可以运行单个模块，也可以运行全量测试：

- **运行全量回归测试** (推荐):
  ```bash
  # 测试线上/远程地址
  node tests/run-all.mjs
  
  # 测试本地开发地址 (localhost:3000)
  node tests/run-all.mjs --local
  ```

- **运行指定模块测试**:
  ```bash
  # 示例：仅测试身份验证 (本地)
  node tests/01-auth.test.mjs --local
  
  # 示例：仅测试协议转换 (线上)
  node tests/03-protocol.test.mjs
  ```

### 0.3 测试模块说明
| 文件名 | 测试领域 | 核心检查点 |
| :--- | :--- | :--- |
| `01-auth.test.mjs` | 身份验证 | Bearer Token, Google Key, URL Key 鉴权 |
| `02-routing.test.mjs` | 路由算法 | 显式路由, Provider 加权负载均衡 |
| `03-protocol.test.mjs` | 协议适配 | Streaming SSE, Gemini 结构转换, 思维链透传 |
| `04-observability.test.mjs`| 可观测性 | Token 统计准确性, D1 日志记录与截断 |
| `05-admin.test.mjs` | 管理后台 | JWT 登录, 权限拦截 (isAdmin) |
| `06-disabled.test.mjs` | 熔断机制 | 验证 Provider/Model/Key 禁用状态的拦截 |

---

## 1. 身份验证 (Authentication)
- [ ] **Bearer Token 验证**: 测试 `Authorization: Bearer sk-...` 是否能正确映射到 `gateway_keys` 表。
- [ ] **URL 参数验证**: 测试 `?key=...` 是否能作为备选鉴权方式。
- [ ] **Google API Key 兼容**: 测试 `x-goog-api-key` 请求头验证。
- [ ] **权限拦截**: 测试无效 Token 或已禁用 Key 是否返回 401。
- [ ] **测试OPENAI格式**： 测试OPENAI类型的Providers是时候生效 1. /api/openai/models返回模型list 2. /api/openai/xxx正常，包含response和chat/completion，流式和非流式都支持
- [ ] **测试GOOGLE格式**： 测试GOOGLE类型的Providers是时候生效 1. /api/google/models返回模型list 2. /api/google/xxx正常获得模型响应，流式和非流都支持
- [ ] **测试Anthropic格式**： 测试Anthropic类型的Providers是时候生效 1. /api/anthropic/models返回模型list 2. /api/anthropic/xxx 流式和非流都支持

## 2. 路由与负载均衡 (Routing & Load Balancing)
从数据库中提取出数据随
- [ ] **模型层加权随机**: 配置多个 Rule 对应不同 Provider，高频率请求验证分布比例是否符合权重设定。
- [ ] **Key 层负载均衡**: 单个 Provider 下配置多个 Key，验证请求是否在 Key 间按权重负载均衡。
- [ ] **自动重试机制**: 模拟上游返回 429 (Rate Limit) 或 503，验证网关是否自动切换至下一个可用 Key。

## 3. 协议修复与增强 (Protocol Fixes)
### 3.1 Gemini 兼容性
- [ ] **空 Content 剥离**: 验证当 `messages` 中 Assistant 角色只有 `tool_calls` 而 content 为空时，是否被自动清理（防止 Gemini 报错）。
- [ ] **ID 编解码**: 验证 Gemini 的 `extra_content` 是否成功编码进 `tool_call.id` 并在后续请求中通过解码还原。
- [ ] **流式 Index 注入**: 验证 Gemini SSE 流输出中是否被正确注入了 OpenAI 协议必需的 `index: 0` 字段。
- [ ] **Finish Reason 修正**: 验证 `stop` 状态是否被正确映射。

### 3.2 思维过程提取
- [ ] **Thinking Level**: 验证从 OpenAI `reasoning_effort` 或 Gemini `thinking_config` 中成功提取思维等级并记录。

## 4. 可观测性 (Observability)
- [ ] **Token 统计**: 分别测试流式与非流式请求，验证 `usage` 字段的解析和入库准确性。
- [ ] **日志截断**: 验证当 Request/Response Body 超过 `max_body_chars` 时，D1 中存储的是否为正确截断后的内容。
- [ ] **异步写入**: 验证日志写入是否不阻塞主请求响应（使用 `ctx.waitUntil`）。
- [ ] **自动清理**: 模拟高频请求，验证是否按 5% 概率触发 `cleanupLogs`。

## 5. 管理后台与路由 (Admin UI & Redirects)
- [ ] **CRUD 操作**: 供应商、密钥、别名的增删改查是否实时生效并同步到 D1。
- [ ] **模型拉取**: 验证“获取模型”按钮是否能通过 API Key 成功调用上游 `/v1/models`。
- [ ] **下载配置**: 验证是否可以下拉providers的配置并且解析，使用.dev.vars里的`PROVIDERS_LINK`
- [ ] **未登录重定向**: 验证未认证时访问根路径 `/` 是否能够正确返回 307 跳转至 `/login` 页面。
- [ ] **已登录重定向**: 验证携带有效 JWT Cookie 访问根路径 `/` 时，是否能正确识别管理员身份并返回 307 跳转至 `/admin/providers` 页面。
