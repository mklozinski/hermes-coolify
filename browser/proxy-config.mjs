import { Server } from 'proxy-chain';

const LAUNCH_PATHS = new Set([
  '/', '/chromium', '/chromium/puppeteer', '/chromium/playwright',
  '/chrome', '/chrome/puppeteer', '/chrome/playwright',
  '/edge', '/edge/puppeteer', '/edge/playwright',
]);
const MANAGED_FLAGS = [
  '--proxy-server', '--proxy-bypass-list', '--no-proxy-server',
  '--proxy-pac-url', '--proxy-auto-detect', '--disable-quic',
  '--force-webrtc-ip-handling-policy',
];

export function normalizeProxy(raw = '') {
  const value = raw.trim();
  if (!value) return null;
  try {
    // A bare user:password@host:port is SOCKS5, not HTTP.
    const url = new URL(value.includes('://') ? value : `socks5://${value}`);
    if (!['socks5:', 'socks5h:', 'http:', 'https:'].includes(url.protocol)
        || !url.hostname || (!url.port && !['http:', 'https:'].includes(url.protocol))
        || (url.port && Number(url.port) < 1) || url.hash || url.search
        || (url.pathname && url.pathname !== '/') || /[\r\n\t]/.test(value)) throw new Error();
    // Resolve target hostnames at the SOCKS gateway for HTTP as well as CONNECT.
    if (url.protocol === 'socks5:') url.protocol = 'socks5h:';
    // Force URI decoding now: malformed credentials must fail at startup.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return url.href;
  } catch {
    // Never include the input: it can contain reusable credentials.
    throw new Error('Invalid BROWSER_PROXY_STRING; use socks5://user:password@host:port (URI-encode credentials).');
  }
}

export function proxiedRequestURL(requestURL, proxyURL) {
  const url = new URL(requestURL, 'http://browserless.invalid');
  if (!LAUNCH_PATHS.has(url.pathname.replace(/\/$/, '') || '/')) return requestURL;
  let launch;
  try {
    const encoded = url.searchParams.get('launch') || '{}';
    try { launch = JSON.parse(encoded); }
    catch { launch = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
    if (!launch || Array.isArray(launch) || typeof launch !== 'object'
        || (launch.args !== undefined && (!Array.isArray(launch.args)
        || launch.args.some((arg) => typeof arg !== 'string')))) throw new Error();
  } catch {
    throw new Error('Invalid browser launch options.');
  }
  // Do not let caller-supplied legacy flags override the deployment policy.
  for (const key of [...url.searchParams.keys()]) {
    if (MANAGED_FLAGS.some((flag) => key === flag || key === flag.slice(2))) {
      url.searchParams.delete(key);
    }
  }
  delete launch.proxy;
  launch.args = (launch.args || []).filter((arg) => !MANAGED_FLAGS.some(
    (flag) => arg === flag || arg.startsWith(`${flag}=`),
  ));
  launch.args.push(
    `--proxy-server=${proxyURL}`,
    '--proxy-bypass-list=<-loopback>',
    '--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  );
  url.searchParams.set('launch', JSON.stringify(launch));
  return `${url.pathname}${url.search}`;
}

export async function createProxyPolicy(raw, { ServerClass = Server } = {}) {
  const upstreamProxyUrl = normalizeProxy(raw);
  if (!upstreamProxyUrl) {
    return { enabled: false, before: async () => true, close: async () => {} };
  }
  const server = new ServerClass({
    host: '127.0.0.1',
    port: 0,
    verbose: false,
    prepareRequestFunction: () => ({ upstreamProxyUrl }),
  });
  // Do not log library errors or URLs: they can contain upstream credentials.
  server.on('requestFailed', () => console.error('[hermes-browser] Upstream proxy request failed (no direct fallback).'));
  await server.listen();
  const proxyURL = `http://127.0.0.1:${server.port}`;
  return {
    enabled: true,
    proxyURL,
    server,
    async before({ req, socket, res }) {
      // Browserless's before hook runs before request URL/query parsing.
      // Only WebSocket browser launches need injection; reconnect/management
      // URLs and HTTP APIs retain their original behavior.
      if (!socket) return true;
      try {
        req.url = proxiedRequestURL(req.url || '/', proxyURL);
        return true;
      } catch {
        if (res) { res.writeHead(400); res.end('Invalid browser launch options.'); }
        else { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); }
        return false;
      }
    },
    close: () => server.close(true),
  };
}
