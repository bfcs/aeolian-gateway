/**
 * 1. 身份验证 (Authentication) 测试
 * 严格校验网关行为，不依赖“上游一定返回 200”。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.mjs';
import { request, authRequest, safeJson } from './helpers.mjs';

function requireConfig(name, value) {
  assert.ok(value, `缺少测试配置 ${name}`);
  return value;
}

describe('1. 身份验证 (Authentication)', () => {
  describe('1.1 Bearer Token 验证', () => {
    it('使用有效的 Bearer Token 调用 /api/openai/models 应通过', async () => {
      const res = await authRequest('/api/openai/models', { method: 'GET' });
      assert.equal(res.status, 200, `期望 200，实际 ${res.status}`);
      const data = await safeJson(res);
      assert.equal(data.object, 'list');
      assert.ok(Array.isArray(data.data), 'data 应为数组');
    });
  });

  describe('1.2 URL 参数验证 (?key=...)', () => {
    it('使用 ?key= 查询参数应通过验证', async () => {
      const res = await request(`/api/openai/models?key=${config.API_KEY}`, { method: 'GET' });
      assert.equal(res.status, 200, `期望 200，实际 ${res.status}`);
      const data = await safeJson(res);
      assert.equal(data.object, 'list');
    });
  });

  describe('1.3 Google API Key 兼容 (x-goog-api-key)', () => {
    it('使用 x-goog-api-key 调用 /api/google/models 应通过', async () => {
      const res = await request('/api/google/models', {
        method: 'GET',
        headers: { 'x-goog-api-key': config.API_KEY },
      });
      assert.equal(res.status, 200, `期望 200，实际 ${res.status}`);
      const data = await safeJson(res);
      assert.ok(Array.isArray(data.models), '应返回 Gemini models 数组');
    });
  });

  describe('1.4 Anthropic API Key 兼容 (x-api-key)', () => {
    it('使用 x-api-key 调用 /api/anthropic/v1/messages 应通过网关鉴权', async () => {
      const model = requireConfig('ANTHROPIC_MODEL_ID', config.ANTHROPIC_MODEL_ID);
      const res = await request('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.API_KEY,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
      });
      assert.equal(res.status, 200, `x-api-key 鉴权失败，状态码 ${res.status}`);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.notEqual(data.selected_provider, 'none', '应命中可路由供应商');
    });
  });

  describe('1.5 权限拦截', () => {
    it('无效 Token 应返回 401', async () => {
      const res = await authRequest('/api/openai/models', {
        method: 'GET',
        apiKey: config.INVALID_API_KEY,
      });
      assert.equal(res.status, 401, `期望 401，实际 ${res.status}`);
    });

    it('缺少 Token 应返回 401', async () => {
      const res = await request('/api/openai/models', { method: 'GET' });
      assert.equal(res.status, 401, `期望 401，实际 ${res.status}`);
    });

    it('空 Token 应返回 401', async () => {
      const res = await request('/api/openai/models', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' },
      });
      assert.equal(res.status, 401, `期望 401，实际 ${res.status}`);
    });
  });

  describe('1.6 OpenAI 格式路由', () => {
    it('/api/openai/models 应返回模型列表', async () => {
      const res = await authRequest('/api/openai/models', { method: 'GET' });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.object, 'list');
      assert.ok(Array.isArray(data.data), 'data 应为数组');
    });

    it('/api/openai/chat/completions 干跑应返回完整路由诊断信息', async () => {
      const model = requireConfig('OPENAI_MODEL_ID', config.OPENAI_MODEL_ID);
      const res = await authRequest('/api/openai/chat/completions', {
        method: 'POST',
        headers: { 'x-dry-run': 'true' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 50,
        }),
      });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.notEqual(data.selected_provider, 'none');
      assert.ok(typeof data.target_model === 'string' && data.target_model.length > 0);
      assert.ok(data.debug_payload && typeof data.debug_payload === 'object');
    });
  });

  describe('1.7 Google 原生格式路由', () => {
    it('/api/google/models 应返回模型列表', async () => {
      const res = await request('/api/google/models', {
        method: 'GET',
        headers: { 'x-goog-api-key': config.API_KEY },
      });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.ok(Array.isArray(data.models), '应返回 models 数组');
    });

    it('/api/google/models/*:generateContent 干跑应可路由', async () => {
      const model = requireConfig('GOOGLE_MODEL_ID', config.GOOGLE_MODEL_ID);
      const modelPath = model.startsWith('models/') ? model : `models/${model}`;
      const res = await request(`/api/google/${modelPath}:generateContent?key=${config.API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        }),
      });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.notEqual(data.selected_provider, 'none');
      assert.ok(typeof data.target_model === 'string' && data.target_model.length > 0);
    });
  });

  describe('1.8 Anthropic 格式路由', () => {
    it('/api/anthropic/models 应返回模型列表', async () => {
      const res = await request('/api/anthropic/models', {
        method: 'GET',
        headers: { 'x-api-key': config.API_KEY },
      });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.type, 'model_list');
      assert.ok(Array.isArray(data.data), 'data 应为数组');
    });

    it('/api/anthropic/v1/messages 干跑应返回路由决策', async () => {
      const model = requireConfig('ANTHROPIC_MODEL_ID', config.ANTHROPIC_MODEL_ID);
      const res = await request('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.API_KEY}`,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
      });
      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.notEqual(data.selected_provider, 'none');
      assert.ok(typeof data.target_model === 'string' && data.target_model.length > 0);
    });
  });
});
