/**
 * 3. 协议修复与增强 (Protocol Fixes) 测试
 * 全部使用 dry-run，严格断言网关请求变换逻辑。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.mjs';
import { chatCompletion, chatCompletionStream, collectSSEEvents, safeJson } from './helpers.mjs';

function requireConfig(name, value) {
  assert.ok(value, `缺少测试配置 ${name}`);
  return value;
}

describe('3. 协议修复与增强 (Protocol Fixes)', () => {
  describe('3.1 Gemini 兼容性', () => {
    it('空 Content 剥离: assistant+tool_calls 时应删除空 content', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);
      const res = await chatCompletion(model, [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location":"London"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'call_123', content: '{"temp":20}' },
      ], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      const transformedMessages = data.debug_payload?.messages;
      assert.ok(Array.isArray(transformedMessages), '应返回 debug_payload.messages');
      const assistantMsg = transformedMessages[1];
      assert.equal(Object.prototype.hasOwnProperty.call(assistantMsg, 'content'), false, '空 content 未被剥离');
    });

    it('Gemini OpenAI 兼容端点应移除 store 字段', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);
      const res = await chatCompletion(model, [
        { role: 'user', content: 'hello' },
      ], {
        headers: { 'x-dry-run': 'true' },
        store: true,
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      assert.equal(data.dry_run, true);
      assert.equal(Object.prototype.hasOwnProperty.call(data.debug_payload || {}, 'store'), false, 'store 未被移除');
    });
  });

  describe('3.2 思维过程提取', () => {
    it('应支持从 reasoning_effort / google.thinking_config / extra_body 提取 thinking_level', async () => {
      const model = requireConfig('OPENAI_MODEL_ID', config.OPENAI_MODEL_ID);

      const res1 = await chatCompletion(model, [{ role: 'user', content: 'test' }], {
        headers: { 'x-dry-run': 'true' },
        reasoning_effort: 'high',
      });
      assert.equal(res1.status, 200);
      const data1 = await safeJson(res1);
      assert.equal(data1.thinking_level, 'high');

      const res2 = await chatCompletion(model, [{ role: 'user', content: 'test' }], {
        headers: { 'x-dry-run': 'true' },
        google: { thinking_config: { thinking_level: 'high' } },
      });
      assert.equal(res2.status, 200);
      const data2 = await safeJson(res2);
      assert.equal(data2.thinking_level, 'high');

      const res3 = await chatCompletion(model, [{ role: 'user', content: 'test' }], {
        headers: { 'x-dry-run': 'true' },
        extra_body: { google: { thinking_config: { thinking_level: 'high' } } },
      });
      assert.equal(res3.status, 200);
      const data3 = await safeJson(res3);
      assert.equal(data3.thinking_level, 'high');
    });
  });

  describe('3.3 指纹恢复', () => {
    it('应从 tool_call.id 后缀恢复 extra_content 并剥离后缀', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);
      const signature = { thought_signature: 'test-sig-123' };
      const encodedId = `call_abc::${Buffer.from(JSON.stringify(signature)).toString('base64')}`;

      const res = await chatCompletion(model, [
        { role: 'user', content: 'What time is it?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: encodedId, type: 'function', function: { name: 'get_time', arguments: '{}' } }],
        },
      ], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      const assistantMsg = data.debug_payload?.messages?.[1];
      assert.ok(assistantMsg, '应存在 assistant 消息');
      assert.equal(assistantMsg.tool_calls[0].extra_content?.thought_signature, 'test-sig-123');
      assert.equal(assistantMsg.tool_calls[0].id, 'call_abc');
      assert.equal(Object.prototype.hasOwnProperty.call(assistantMsg, 'content'), false);
    });

    it('应将消息级 extra_content 回填到每个 tool_call 并剥离消息级字段', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);

      const res = await chatCompletion(model, [
        { role: 'user', content: 'Use a tool.' },
        {
          role: 'assistant',
          content: '',
          extra_content: { google: { thought_signature: 'message-level-sig' } },
          tool_calls: [{ id: 'call_msg', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
        },
      ], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      const assistantMsg = data.debug_payload?.messages?.[1];
      assert.ok(assistantMsg, '应存在 assistant 消息');
      assert.equal(assistantMsg.tool_calls[0].extra_content?.google?.thought_signature, 'message-level-sig');
      assert.equal(Object.prototype.hasOwnProperty.call(assistantMsg, 'extra_content'), false, '消息级 extra_content 应被剥离');
    });

    it('应将消息级 thought_signature 归一化为 tool_call.extra_content', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);

      const res = await chatCompletion(model, [
        { role: 'user', content: 'Use a tool.' },
        {
          role: 'assistant',
          content: '',
          thought_signature: 'legacy-message-sig',
          tool_calls: [{ id: 'call_legacy', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
        },
      ], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      const assistantMsg = data.debug_payload?.messages?.[1];
      assert.ok(assistantMsg, '应存在 assistant 消息');
      assert.equal(assistantMsg.tool_calls[0].extra_content?.google?.thought_signature, 'legacy-message-sig');
      assert.equal(Object.prototype.hasOwnProperty.call(assistantMsg, 'thought_signature'), false, '消息级 thought_signature 应被剥离');
    });
  });

  describe('3.4 工具内容归一化', () => {
    it('tool 纯文本 content 应包装为 JSON 字符串', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);
      const res = await chatCompletion(model, [
        { role: 'user', content: 'What is the price?' },
        {
          role: 'assistant',
          tool_calls: [{ id: 'call_p', type: 'function', function: { name: 'get_price', arguments: '{}' } }],
        },
        {
          role: 'tool',
          tool_call_id: 'call_p',
          content: 'Price is $100',
        },
      ], {
        headers: { 'x-dry-run': 'true' },
      });

      assert.equal(res.status, 200);
      const data = await safeJson(res);
      const toolMsg = data.debug_payload?.messages?.[2];
      assert.ok(toolMsg, '应存在 tool 消息');
      assert.equal(toolMsg.content, JSON.stringify({ result: 'Price is $100' }));
    });
  });

  describe('3.5 流式 thought_signature 回填', () => {
    it('Gemini OpenAI 兼容流应将最终 delta.extra_content 回填到 tool_call.id', async () => {
      const model = requireConfig('GOOGLE_OPENAI_COMPATIBLE_MODEL_ID', config.GOOGLE_OPENAI_COMPATIBLE_MODEL_ID);
      const res = await chatCompletionStream(model, [
        { role: 'system', content: 'Call the requested tool immediately. Do not answer in natural language.' },
        { role: 'user', content: 'Use the get_weather tool for London.' },
      ], {
        max_tokens: 200,
        tool_choice: { type: 'function', function: { name: 'get_weather' } },
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather by location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        }],
      });

      assert.equal(res.status, 200, `流式请求失败: ${res.status}`);
      const events = await collectSSEEvents(res);
      assert.ok(events.length > 0, 'SSE 事件为空');

      const anyToolCallEvent = events.find((event) =>
        event?.choices?.some((choice) =>
          Array.isArray(choice?.delta?.tool_calls) && choice.delta.tool_calls.length > 0
        )
      );
      assert.ok(anyToolCallEvent, '模型未返回任何 tool_calls，无法验证 thought_signature 回填');

      const toolCallEvent = events.find((event) =>
        event?.choices?.some((choice) =>
          Array.isArray(choice?.delta?.tool_calls) &&
          choice.delta.tool_calls.some((toolCall) => typeof toolCall?.id === 'string' && toolCall.id.includes('::'))
        )
      );

      assert.ok(toolCallEvent, '未找到带已编码 thought_signature 的 tool_call.id');

      const nakedExtraContentEvent = events.find((event) =>
        event?.choices?.some((choice) =>
          choice?.delta?.extra_content &&
          !choice.delta.tool_calls?.some((toolCall) => typeof toolCall?.id === 'string' && toolCall.id.includes('::'))
        )
      );
      assert.equal(nakedExtraContentEvent, undefined, '存在未回填到 tool_call.id 的裸 extra_content 事件');
    });
  });
});
