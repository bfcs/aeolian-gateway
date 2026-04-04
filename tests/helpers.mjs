/**
 * 测试辅助函数
 */
import { config } from './config.mjs';

/**
 * 带超时的 fetch 封装
 */
export async function request(path, options = {}) {
  const url = `${config.HOST}${path}`;
  const maxAttempts = options.maxAttempts || 2;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || config.TIMEOUT);

    try {
      const headers = { ...options.headers };
      if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
        headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
        headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
      }

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

/**
 * 发送带 Bearer Token 认证的请求
 */
export async function authRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options.apiKey || config.API_KEY}`,
    ...options.headers,
  };
  return request(path, { ...options, headers });
}

/**
 * 发送 OpenAI 格式的 Chat Completion 请求（非流式）
 */
export async function chatCompletion(model, messages, options = {}) {
  const { headers, ...extraBody } = options;
  return authRequest('/api/openai/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 50,
      ...extraBody,
    }),
  });
}

/**
 * 发送 OpenAI 格式的 Chat Completion 请求（流式）
 */
export async function chatCompletionStream(model, messages, options = {}) {
  const { headers, ...extraBody } = options;
  return authRequest('/api/openai/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 50,
      stream: true,
      ...extraBody,
    }),
  });
}

/**
 * 发送 Gemini 原生格式的 generateContent 请求
 */
export async function geminiGenerateContent(model, contents) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  return request(`/api/google/${modelPath}:generateContent?key=${config.API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
}

/**
 * 发送 Gemini 原生格式的 streamGenerateContent 请求
 */
export async function geminiGenerateContentStream(model, contents) {
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  return request(`/api/google/${modelPath}:streamGenerateContent?alt=sse&key=${config.API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
}

/**
 * 解析 SSE 流并收集所有事件数据
 */
export async function collectSSEEvents(response) {
  const text = await response.text();
  const events = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
      try {
        events.push(JSON.parse(trimmed.slice(6)));
      } catch { }
    }
  }
  return events;
}

/**
 * 用于统计频率分布的辅助
 */
export function countDistribution(items) {
  const counts = {};
  for (const item of items) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

/**
 * 管理后台登录并获取 cookie
 */

/**
 * 发送带管理员 cookie 的请求
 */

/**
 * 格式化测试结果输出
 */
export function formatResult(testName, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`  ${icon} [${status}] ${testName}${detail ? ` - ${detail}` : ''}`);
}

/**
 * 安全地读取响应 JSON
 */
export async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 等待指定毫秒
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 探测是否被 Cloudflare Access 拦截
 */
export function isCloudflareInterception(res) {
  // 仅依靠明确的 Access 特征：
  // 1. 存在 cf-access-domain 响应头
  // 2. 状态码为 302 且重定向目标包含 cloudflareaccess.com
  // 3. 状态码为 403 且包含 cf-ray 头但 Content-Type 为 text/html (通常是 Access 拒绝页)
  const isCfAccess = res.headers.get('cf-access-domain') || 
                     (res.status === 302 && res.headers.get('location')?.includes('cloudflareaccess.com')) ||
                     (res.status === 403 && res.headers.get('content-type')?.includes('text/html') && res.headers.get('cf-ray'));
  
  if (isCfAccess) {
    // console.log(`    🛡️ [Cloudflare Access] 检测到拦截: status=${res.status}, location=${res.headers.get('location') || 'none'}`);
  }
  return !!isCfAccess;
}
