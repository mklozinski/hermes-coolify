// Launch-logic smoke test against a HOOK-DISABLED endpoint, not built-image
// acceptance. A proxy-enabled server hook would override both test requests.
// Starts a temporary bridge on this container's private interface.
import { networkInterfaces } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'proxy-chain';
import { createProxyPolicy, proxiedRequestURL } from '../proxy-config.mjs';

if (process.env.RUN_LIVE_BROWSER_PROXY_TEST !== '1') throw new Error('Live test requires explicit opt-in.');
if (process.env.BROWSER_TEST_HOOK_DISABLED !== '1') {
  throw new Error('This launch-logic test requires a hook-disabled endpoint. Set BROWSER_TEST_HOOK_DISABLED=1 only after verifying that prerequisite.');
}
const base = process.env.BROWSER_CDP_URL;
if (!base || !process.env.BROWSER_PROXY_STRING) throw new Error('CDP endpoint and proxy are required.');
const address = Object.values(networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address;
if (!address) throw new Error('No private test interface.');
class PrivateInterfaceServer extends Server {
  constructor(options) { super({ ...options, host: address }); }
}
const policy = await createProxyPolicy(process.env.BROWSER_PROXY_STRING, { ServerClass: PrivateInterfaceServer });
const testProxy = `http://${address}:${policy.server.port}`;

async function browserIP(useProxy) {
  const url = new URL(base);
  if (useProxy) {
    const rewritten = new URL(proxiedRequestURL(url.pathname + url.search, testProxy), 'http://local');
    url.search = rewritten.search;
  }
  const ws = new WebSocket(url);
  let nextID = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const value = JSON.parse(data);
    const handler = pending.get(value.id);
    if (!handler) return;
    pending.delete(value.id);
    value.error ? handler.reject(new Error('CDP request failed.')) : handler.resolve(value.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextID;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout.')); }, 20000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  let context;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout.')), 30000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed.')); }, { once: true });
    });
    context = (await send('Target.createBrowserContext')).browserContextId;
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: context });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    const navigation = await send('Page.navigate', { url: 'https://api.ipify.org?format=json' }, sessionId);
    if (navigation.errorText) throw new Error('Browser navigation failed.');
    for (let i = 0; i < 60; i++) {
      const result = await send('Runtime.evaluate', { expression: 'document.body?.innerText || ""', returnByValue: true }, sessionId);
      try {
        const ip = JSON.parse(result.result.value).ip;
        if (ip) return ip;
      } catch { /* wait for navigation */ }
      await delay(500);
    }
    throw new Error('IP page did not complete.');
  } finally {
    if (context && ws.readyState === WebSocket.OPEN) await send('Target.disposeBrowserContext', { browserContextId: context }).catch(() => {});
    ws.close();
  }
}
try {
  const direct = await browserIP(false);
  const proxy = await browserIP(true);
  console.log(JSON.stringify({ direct_browser_ip: direct, proxied_browser_ip: proxy, different: direct !== proxy }));
  if (direct === proxy) process.exitCode = 1;
} catch {
  // Neither ws errors nor upstream errors should print credential-bearing URLs.
  console.error('Live CDP smoke test failed; no credential-bearing error data printed.');
  process.exitCode = 1;
} finally {
  await policy.close();
}
