// BROWSER_PROXY_STRING is a deployment setting, not a Camofox env variable.
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
    // Let the SOCKS gateway resolve target names, including plain HTTP URLs.
    if (url.protocol === 'socks5:') url.protocol = 'socks5h:';
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return url.href;
  } catch {
    throw new Error('Invalid BROWSER_PROXY_STRING; use socks5://user:password@host:port (URI-encode credentials).');
  }
}
