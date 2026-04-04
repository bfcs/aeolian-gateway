/**
 * 4. 可观测性 (Observability) 测试
 * 严格验证 usage 与流式注入行为。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletion, chatCompletionStream, collectSSEEvents, safeJson } from './helpers.mjs';
import { config } from './config.mjs';

function requireConfig(name, value) {
  assert.ok(value, `缺少测试配置 ${name}`);
  return value;
}

describe('4. 可观测性 (Observability)', () => {
  describe('4.1 非流式 usage', () => {
    it('非流式响应必须包含 usage 且 total_tokens > 0', async () => {
      const model = requireConfig('OPENAI_MODEL_ID', config.OPENAI_MODEL_ID);
      const res = await chatCompletion(model, [{ role: 'user', content: 'Say hello' }]);
      assert.equal(res.status, 200, `非流式请求失败: ${res.status}`);
      const data = await safeJson(res);
      assert.ok(data.usage, '响应中缺少 usage');
      assert.ok(Number(data.usage.total_tokens) > 0, 'total_tokens 应大于 0');
      assert.ok(Number(data.usage.prompt_tokens) >= 0, 'prompt_tokens 应为非负数');
      assert.ok(Number(data.usage.completion_tokens) >= 0, 'completion_tokens 应为非负数');
    });
  });

  describe('4.2 流式 usage', () => {
    it('流式 SSE 中必须出现 usage 事件且 total_tokens > 0', async () => {
      const model = requireConfig('OPENAI_MODEL_ID', config.OPENAI_MODEL_ID);
      const res = await chatCompletionStream(model, [{ role: 'user', content: 'Say hi' }]);
      assert.equal(res.status, 200, `流式请求失败: ${res.status}`);

      const events = await collectSSEEvents(res);
      assert.ok(events.length > 0, 'SSE 事件为空');
      const usageEvent = events.find((e) => e.usage !== undefined);
      assert.ok(usageEvent, '流式响应中缺少 usage 事件');
      assert.ok(Number(usageEvent.usage.total_tokens) > 0, '流式 total_tokens 应大于 0');
    });
  });

  describe('4.3 流式 include_usage 注入', () => {
    it('当 stream=true 时，dry-run payload 必须包含 stream_options.include_usage=true', async () => {
      const model = requireConfig('OPENAI_MODEL_ID', config.OPENAI_MODEL_ID);
      const res = await chatCompletion(model, [{ role: 'user', content: 'dry-run stream' }], {
        headers: { 'x-dry-run': 'true' },
        stream: true,
      });
      assert.equal(res.status, 200, `dry-run 失败: ${res.status}`);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.equal(data.debug_payload?.stream, true);
      assert.equal(data.debug_payload?.stream_options?.include_usage, true, '网关未注入 include_usage=true');
    });
  });
});
