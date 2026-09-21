import { validateResult } from './evaluation.mjs';

export function normalizeKey(value) {
  const key = value.trim().replace(/^Bearer\s+/i, '');
  if (!key) throw new Error('请填写你的 TypeSafe API Key；刷新页面后需要重新填写。');
  if (!/^[\x21-\x7e]{1,512}$/.test(key)) {
    throw new Error('API Key 格式不正确：包含空格、中文或不可见字符。请从 TypeSafe 控制台重新复制密钥，不要粘贴说明文字。');
  }
  return key;
}

export async function evaluate(endpoint, key, body, signal, transport = fetch) {
  const normalized = normalizeKey(key);
  let response;
  try {
    response = await transport(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${normalized}` },
      body: JSON.stringify(body), signal, credentials: 'omit', redirect: 'error'
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('等待代理响应超时，请稍后重试。');
    throw new Error('浏览器未收到转发代理的响应。请确认本地预览服务仍在运行；若服务正常，需检查浏览器的网络访问限制。');
  }
  if (!response.ok) {
    const messages = {
      400: '输入内容不符合要求，请检查文本长度后重试。',
      401: 'Jev 拒绝了 API Key：密钥无效或已失效，请从 TypeSafe 控制台复制有效密钥。',
      403: '代理或 Jev 拒绝访问，请检查站点白名单与密钥权限。',
      413: '提交的内容太长，请缩短后重试。',
      429: '请求过于频繁，请稍后重试。',
      502: '已连接代理，但代理未能取得有效的 Jev 响应，请稍后重试。',
      504: '已连接代理，但 Jev 响应超时，请稍后重试。',
      529: 'Jev 服务繁忙，请稍后重试。'
    };
    throw new Error(messages[response.status] || `代理返回错误（${response.status}），请稍后重试。`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('已连接代理，但返回的内容不是有效 JSON。请检查代理配置。'); }
  return validateResult(data);
}
