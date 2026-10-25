// Browserless's supported external before-request hook.
import { createProxyPolicy } from '../hermes-proxy/proxy-config.mjs';

const rawProxy = process.env.BROWSER_PROXY_STRING || '';
// Chromium inherits the service environment. Do not pass proxy credentials on
// to browser processes or expose them through Browserless configuration dumps.
delete process.env.BROWSER_PROXY_STRING;
let policy;
try {
  policy = await createProxyPolicy(rawProxy);
} catch {
  console.error('[hermes-browser] Proxy initialization failed; check BROWSER_PROXY_STRING. Refusing direct fallback.');
  process.exit(1);
}
console.info(`[hermes-browser] CDP proxy ${policy.enabled ? 'enabled (loopback bridge)' : 'disabled (direct access)'}.`);
export default policy.before;
