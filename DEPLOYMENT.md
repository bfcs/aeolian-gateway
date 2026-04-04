# 部署文档

## 部署步骤
按照下面的步骤部署项目到Cloudflare Workers上

1. 注册一个域名，并将其托管到Cloudflare,假设域名是`example.com`
2. 注册Cloudflare workers账户，确保D1,workers正常使用
3. 下载并安装wrangler
4. `wrangler login`登录您的账户
5. 创建 D1 数据库：执行 `npx wrangler d1 create ai-gateway-db`。**完成后请记下返回结果中的 `database_id`**。
6. 将`wrangler.jsonc.simple`复制一份到`wrangler.jsonc`，填写其中的d1数据库id，你要赋予的域名，比如`gw.example.com`
7. 初始化远程数据库表结构（必须）：执行 `npx wrangler d1 execute ai-gateway-db --file=./schema.sql --remote`
8. 设置管理密码：`echo "你的密码" | npx wrangler secret put ADMIN_PASSWORD`
9. 执行部署：`npm run deploy`
10. 浏览器打开你之前配置的域名，比如`gw.example.com`，输入管理密码进入

## 使用教程

1. 添加和配置Providers，Models
2. 添加一个key
3. 在应用中使用下面的配置进行API访问: 
 - `https://gw.example.com/api/openai`(或者google, anthropic取决于你访问的模型类型)
 - key填写网关的key，不是模型供应商的key
 - model填写你想要访问的模型，比如`gpt-5.4`

## 常见问题

### 网络请求被Cloudflare拦截
如果使用 OpenClaw 等工具访问时出现 `403 You Request Was Blocked`，请到 Cloudflare Dashboard 的 `Domain -> Security -> Security Rules` 新增一条规则：

- `Hostname equals <你的 Workers 域名>`
- `Action = Skip`
- `Products = All Super Bot Fight Mode Rules`


## 加固您的网关
- 开启Cloudflare Access
- 为 `/api` 单独配置skip策略