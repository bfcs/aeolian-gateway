/**
 * 5. 管理后台与重定向 (Admin UI & Redirects) 测试
 * 严格验证未授权访问行为。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request, safeJson } from './helpers.mjs';

describe('5. 管理后台与重定向 (Admin UI & Redirects)', () => {
  describe('5.1 未登录重定向', () => {
    it('未认证访问根路径 / 必须重定向到 /login', async () => {
      const res = await request('/', { redirect: 'manual' });
      assert.ok([302, 307].includes(res.status), `预期 302/307，实际 ${res.status}`);
      const location = res.headers.get('location');
      assert.ok(location && location.includes('/login'), `应跳转到 /login，实际 location=${location}`);
    });

    it('未认证访问 /admin/providers 必须重定向到 /login', async () => {
      const res = await request('/admin/providers', { redirect: 'manual' });
      assert.ok([302, 307].includes(res.status), `预期 302/307，实际 ${res.status}`);
      const location = res.headers.get('location');
      assert.ok(location && location.includes('/login'), `应跳转到 /login，实际 location=${location}`);
    });
  });

  describe('5.2 未授权 API 拦截', () => {
    it('未登录调用 /api/admin/playground/stream 必须返回 401', async () => {
      const res = await request('/api/admin/playground/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'dummy',
          model: 'dummy',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });
      assert.equal(res.status, 401, `预期 401，实际 ${res.status}`);
      const data = await safeJson(res);
      assert.ok(data?.error, '应返回错误消息');
    });
  });

  describe('5.3 登录页可用性', () => {
    it('/login 必须返回 200 且包含密码输入语义', async () => {
      const res = await request('/login');
      assert.equal(res.status, 200, `预期 200，实际 ${res.status}`);
      const text = await res.text();
      const hasPasswordSemantics = text.includes('管理员密码') || text.toLowerCase().includes('password');
      assert.ok(hasPasswordSemantics, '登录页缺少密码相关语义');
    });
  });
});
