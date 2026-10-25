import { Server } from 'proxy-chain';
import { normalizeProxy } from './proxy-config.mjs';

// Firefox/Playwright cannot authenticate to SOCKS5 directly. Keep credentials
// in a private loopback HTTP bridge and give the maintained REST server only
// its supported PROXY_* settings. Never silently fall back to direct access.
try {
  const upstreamProxyUrl = normalizeProxy(process.env.BROWSER_PROXY_STRING || '');
  delete process.env.BROWSER_PROXY_STRING;
  if (!process.env.CAMOFOX_ACCESS_KEY?.trim()) {
    throw new Error('BROWSER_TOKEN is required.');
  }
  if (upstreamProxyUrl) {
    const bridge = new Server({
      host: '127.0.0.1',
      port: 0,
      verbose: false,
      prepareRequestFunction: () => ({ upstreamProxyUrl }),
    });
    bridge.on('requestFailed', () => console.error('[hermes-browser] Upstream proxy request failed (no direct fallback).'));
    await bridge.listen();
    Object.assign(process.env, {
      PROXY_STRATEGY: 'round_robin',
      PROXY_PROTOCOL: 'http',
      PROXY_HOST: '127.0.0.1',
      PROXY_PORT: String(bridge.port),
      PROXY_PORTS: '',
      PROXY_USERNAME: '',
      PROXY_PASSWORD: '',
    });
  }
  console.info(`[hermes-browser] Proxy ${upstreamProxyUrl ? 'enabled (loopback bridge)' : 'disabled (direct access)'}.`);
  // Run upstream in this process so its SIGTERM handler checkpoints profiles.
  await import('/app/server.js');
} catch {
  // Library errors can contain URLs with reusable proxy credentials.
  console.error('[hermes-browser] Startup failed; check BROWSER_TOKEN and BROWSER_PROXY_STRING.');
  process.exit(1);
}
