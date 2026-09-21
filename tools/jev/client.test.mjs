import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, evaluate } from './client.mjs';

test('pasted Bearer prefix is normalized; invalid header characters are identified before network access', async () => {
  assert.equal(normalizeKey(' Bearer test-key '), 'test-key');
  for (const key of ['复制你的密钥', 'test\u200bkey', 'test key', '']) {
    let called = false;
    await assert.rejects(evaluate('/api/evaluate', key, {}, undefined, async () => { called = true; }), /API Key/);
    assert.equal(called, false);
  }
});
test('browser transport error differs from upstream and authentication errors', async () => {
  await assert.rejects(evaluate('/api/evaluate', 'test-key', {}, undefined, async () => { throw new TypeError('Failed to fetch'); }), /浏览器未收到/);
  for (const [status, message] of [[401, /Jev 拒绝了 API Key/], [502, /已连接代理/], [504, /Jev 响应超时/]]) {
    await assert.rejects(evaluate('/api/evaluate', 'test-key', {}, undefined, async () => new Response('{}', { status })), message);
  }
});
test('malformed response is not mislabeled as a connection error', async () => {
  await assert.rejects(evaluate('/api/evaluate', 'test-key', {}, undefined, async () => new Response('<html>oops</html>')), /不是有效 JSON/);
  await assert.rejects(evaluate('/api/evaluate', 'test-key', {}, undefined, async () => Response.json({})), /数据格式不完整/);
});
