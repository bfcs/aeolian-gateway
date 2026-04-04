/**
 * 2. 路由与负载均衡 (Routing & Load Balancing) 测试
 * 严格验证网关路由决策，不使用松散断言。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion, request, safeJson } from './helpers.mjs';
import { config } from './config.mjs';

function requireConfig(name, value) {
  assert.ok(value, `缺少测试配置 ${name}`);
  return value;
}

describe('2. 路由与负载均衡 (Routing & Load Balancing)', () => {
  describe('2.1 模型层路由与别名分发', () => {
    it('别名模型应分发到至少 2 个不同 target_model', async () => {
      const model = requireConfig('MODEL_ALIAS_MODEL_ID', config.MODEL_ALIAS_MODEL_ID);
      const iterations = 40;
      const modelCounts = new Map();
      const providerMapping = new Map();

      for (let i = 0; i < iterations; i++) {
        const res = await chatCompletion(model, [{ role: 'user', content: `alias-${i}` }], {
          headers: { 'x-dry-run': 'true' },
        });
        assert.equal(res.status, 200, `Dry Run 状态码异常: ${res.status}`);
        const data = await safeJson(res);
        assert.equal(data.dry_run, true);
        assert.notEqual(data.selected_provider, 'none', `第 ${i + 1} 次 dry-run 未命中供应商`);
        assert.ok(typeof data.target_model === 'string' && data.target_model.length > 0, 'target_model 为空');

        modelCounts.set(data.target_model, (modelCounts.get(data.target_model) || 0) + 1);
        providerMapping.set(data.target_model, data.selected_provider);
      }

      modelCounts.forEach((count, target) => {
        console.log(`    target=${target} provider=${providerMapping.get(target)} count=${count}`);
      });
      assert.ok(modelCounts.size >= 2, `别名分发失效：仅观察到 ${modelCounts.size} 个 target_model`);
    });
  });

  describe('2.2 Key 层负载均衡', () => {
    it('同一模型应在多个物理 key 间轮转', async () => {
      const model = requireConfig('KEY_WEIGHTS_MODEL_ID', config.KEY_WEIGHTS_MODEL_ID);

      const preflight = await chatCompletion(model, [{ role: 'user', content: 'preflight' }], {
        headers: { 'x-retry-dry-run': 'true' },
      });
      assert.equal(preflight.status, 429);
      const preflightData = await safeJson(preflight);
      const discoveredKeys = preflightData.attempted_keys || [];
      assert.ok(discoveredKeys.length >= 2, `当前配置仅发现 ${discoveredKeys.length} 把 key，不满足轮转测试前提`);

      const iterations = 40;
      const keyCounts = new Map();
      for (let i = 0; i < iterations; i++) {
        const res = await chatCompletion(model, [{ role: 'user', content: `key-${i}` }], {
          headers: { 'x-dry-run': 'true' },
        });
        assert.equal(res.status, 200, `Dry Run 状态码异常: ${res.status}`);
        const data = await safeJson(res);
        assert.equal(data.dry_run, true);
        assert.ok(typeof data.selected_key === 'string' && data.selected_key.length > 0, 'selected_key 缺失');
        keyCounts.set(data.selected_key, (keyCounts.get(data.selected_key) || 0) + 1);
      }

      keyCounts.forEach((count, key) => {
        console.log(`    key=${key} count=${count}`);
      });
      assert.ok(keyCounts.size >= 2, `Key 轮转失效：仅观察到 ${keyCounts.size} 把 key`);
    });
  });

  describe('2.3 内部重试决策路径', () => {
    it('重试链条应满足：长度 1~3 且无重复 key', async () => {
      const model = requireConfig('KEY_WEIGHTS_MODEL_ID', config.KEY_WEIGHTS_MODEL_ID);
      const res = await chatCompletion(model, [{ role: 'user', content: 'retry-check' }], {
        headers: { 'x-retry-dry-run': 'true' },
      });

      assert.equal(res.status, 429, `重试预检应返回 429，实际 ${res.status}`);
      const data = await safeJson(res);
      const attempted = data.attempted_keys || [];
      const unique = new Set(attempted);

      assert.ok(attempted.length >= 1, 'attempted_keys 至少应有 1 项');
      assert.ok(attempted.length <= 3, `attempted_keys 不应超过 3 项，实际 ${attempted.length}`);
      assert.equal(unique.size, attempted.length, '重试链条出现重复 key，失败 key 排除机制失效');
    });
  });

  describe('2.4 健全性与错误诊断', () => {
    it('未知模型 dry-run 应返回明确诊断信息而非 500', async () => {
      const res = await chatCompletion(`non-existent-model-${Date.now()}`, [{ role: 'user', content: 'hi' }], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.equal(data.selected_provider, 'none');
      assert.ok(typeof data.error === 'string' && data.error.includes('没有可用于模型'));
    });
  });

  describe('2.5 同一模型多类型路由 (Dry Run)', () => {
    it('同一个 model id 在不同路径应命中对应 provider type', async () => {
      const model = requireConfig('MULTI_TYPES_MODEL_ID', config.MULTI_TYPES_MODEL_ID);

      const openaiRes = await request('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.API_KEY}`,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'route-openai' }],
        }),
      });
      assert.equal(openaiRes.status, 200);
      const openaiData = await safeJson(openaiRes);
      assert.equal(openaiData.dry_run, true);
      assert.equal(openaiData.route_hint_type, 'openai');
      assert.equal(openaiData.selected_provider_type, 'openai');

      const anthropicRes = await request('/api/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.API_KEY}`,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 32,
          messages: [{ role: 'user', content: 'route-anthropic' }],
        }),
      });
      assert.equal(anthropicRes.status, 200);
      const anthropicData = await safeJson(anthropicRes);
      assert.equal(anthropicData.dry_run, true);
      assert.equal(anthropicData.route_hint_type, 'anthropic');
      assert.equal(anthropicData.selected_provider_type, 'anthropic');

      const googleRes = await request(`/api/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.API_KEY}`,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model,
          contents: [{ role: 'user', parts: [{ text: 'route-google' }] }],
        }),
      });
      assert.equal(googleRes.status, 200);
      const googleData = await safeJson(googleRes);
      assert.equal(googleData.dry_run, true);
      assert.equal(googleData.route_hint_type, 'google');
      assert.equal(googleData.selected_provider_type, 'google');
    });
  });

  describe('2.6 Multipart 音频上传路由 (Dry Run)', () => {
    it('audio/transcriptions 应能从 multipart/form-data 中提取 model 并完成选路', async () => {
      const model = requireConfig('KEY_WEIGHTS_MODEL_ID', config.KEY_WEIGHTS_MODEL_ID);
      const formData = new FormData();
      formData.set('model', model);
      formData.set('file', new File([new Uint8Array([82, 73, 70, 70])], 'sample.wav', { type: 'audio/wav' }));

      const res = await request('/api/openai/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.API_KEY}`,
          'x-dry-run': 'true',
        },
        body: formData,
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.equal(data.route_hint_type, 'openai');
      assert.equal(data.selected_provider_type, 'openai');
      assert.notEqual(data.selected_provider, 'none');
      assert.equal(data.debug_form_data.model, data.target_model);
      assert.equal(data.debug_form_data.file.name, 'sample.wav');
    });
  });

  describe('2.7 Google Native model 前缀兼容 (Dry Run)', () => {
    it('Google native 请求体中的 model 不带 models/ 前缀时也应命中已配置规则', async () => {
      const configuredModel = requireConfig('GOOGLE_MODEL_ID', config.GOOGLE_MODEL_ID);
      const bodyModel = configuredModel.replace(/^models\//, '');

      const res = await request(`/api/google/${encodeURIComponent(configuredModel)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.API_KEY,
          'x-dry-run': 'true',
        },
        body: JSON.stringify({
          model: bodyModel,
          contents: [{ role: 'user', parts: [{ text: 'route-google-prefixless-model' }] }],
        }),
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.equal(data.route_hint_type, 'google');
      assert.equal(data.selected_provider_type, 'google');
      assert.equal(data.target_model, configuredModel);
    });
  });
});
