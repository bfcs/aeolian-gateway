import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.mjs';
import { request, safeJson, chatCompletion } from './helpers.mjs';

function toErrorText(data) {
  const error = data?.error ?? data?.message ?? '';
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    return [error.message, error.type, error.code].filter(Boolean).join(' ');
  }
  return String(error || '');
}

function assertGatewayDisabledRejection(res, data, label) {
  const errorMsg = toErrorText(data);
  const isGatewaySideError =
    res.status === 503 ||
    errorMsg.includes('没有可用于模型') ||
    errorMsg.includes('不可用') ||
    errorMsg.includes('没有可用密钥') ||
    errorMsg.includes('匹配规则');
  const isUpstreamInvalidKey =
    errorMsg.includes('Incorrect API key provided') ||
    (data?.error?.code === 'invalid_api_key');

  assert.ok(!res.ok, `${label}: 请求应当失败`);
  assert.ok(isGatewaySideError, `${label}: 预期网关侧拦截，实际 status=${res.status}, error=${errorMsg}`);
  assert.ok(!isUpstreamInvalidKey, `${label}: 请求未在网关拦截，已泄漏到上游 invalid_api_key: ${errorMsg}`);
}

describe('6. Disabled Entities 测试', () => {

  describe('6.1 测试 Disabled Gateway Key', () => {
    it('使用被禁用的 Gateway Key 应当返回 401 Unauthorized', async () => {
      const key = config.DISABLED_GATEWAY_KEY;
      if (!key) {
        console.log('    ⚠️ 未配置 DISABLED_GATEWAY_KEY, 跳过此测试');
        return;
      }

      const res = await request('/api/openai/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      assert.equal(res.status, 401, `预期 401, 实际收到 ${res.status}`);
    });
  });

  describe('6.2 测试 Disabled Provider (通过 Model ID)', () => {
    it('调用属于被禁用 Provider 的模型应当在网关侧被拒绝', async () => {
      const modelId = config.DISABLED_MODEL_ID;
      if (!modelId) {
        console.log('    ⚠️ 未配置 DISABLED_MODEL_ID, 跳过此测试');
        return;
      }

      const res = await chatCompletion(modelId, [{ role: 'user', content: 'hello' }]);
      const data = await safeJson(res);
      assertGatewayDisabledRejection(res, data, `DISABLED_MODEL_ID=${modelId}`);
    });
  });

  describe('6.3 测试 Disabled Model Alias', () => {
    it('调用被禁用的 Model Alias 应当返回找不到模型的错误', async () => {
      const alias = config.DISABLED_MODEL_ALIAS;
      if (!alias) {
        console.log('    ⚠️ 未配置 DISABLED_MODEL_ALIAS, 跳过此测试');
        return;
      }

      const res = await chatCompletion(alias, [{ role: 'user', content: 'hello' }]);
      const data = await safeJson(res);
      assertGatewayDisabledRejection(res, data, `DISABLED_MODEL_ALIAS=${alias}`);
    });
  });

  describe('6.4 测试 Alias 指向的 Provider 被禁用', () => {
    it('调用正常的 Alias，但其目标 Provider 被禁用，应当返回找不到模型的错误', async () => {
      const alias = config.DISABLED_ALIAS_TARGET_MODEL_ID;
      if (!alias) {
        console.log('    ⚠️ 未配置 DISABLED_ALIAS_TARGET_MODEL_ID, 跳过此测试');
        return;
      }

      const res = await chatCompletion(alias, [{ role: 'user', content: 'hello' }]);
      const data = await safeJson(res);
      assertGatewayDisabledRejection(res, data, `DISABLED_ALIAS_TARGET_MODEL_ID=${alias}`);
    });
  });
});
