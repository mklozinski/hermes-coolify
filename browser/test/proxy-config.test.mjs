import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { normalizeProxy, proxiedRequestURL, createProxyPolicy } from '../proxy-config.mjs';

for (const raw of ['', ' ', '\t\n']) {
  test(`empty proxy is direct (${JSON.stringify(raw)})`, async () => {
    const policy = await createProxyPolicy(raw, { ServerClass: class { constructor() { throw new Error('must not start'); } } });
    const req = { url: '/chromium?token=fixture' };
    assert.equal(policy.enabled, false);
    assert.equal(await policy.before({ req, socket: {} }), true);
    assert.equal(req.url, '/chromium?token=fixture');
    await policy.close();
  });
}
for (const raw of ['u:p@localhost:1080', 'socks5://u:p@localhost:1080', 'socks5h://u:p@localhost:1080']) {
  test(`normalizes SOCKS5 without local destination DNS: ${raw}`, () => {
    assert.equal(normalizeProxy(raw), 'socks5h://u:p@localhost:1080');
  });
}
test('encoded credentials and IPv6 survive parsing', () => {
  const url = new URL(normalizeProxy('socks5://u%40x:p%3Aq@[::1]:1080'));
  assert.equal(decodeURIComponent(url.username), 'u@x');
  assert.equal(decodeURIComponent(url.password), 'p:q');
  assert.equal(url.hostname, '[::1]');
});
test('HTTP default port is valid', () => {
  assert.equal(normalizeProxy('http://proxy.example:80'), 'http://proxy.example/');
});
test('existing base64 launch options remain supported', () => {
  const encoded = Buffer.from(JSON.stringify({ headless: false, args: ['--lang=ro'] })).toString('base64');
  const result = new URL(proxiedRequestURL(`/chromium?launch=${encodeURIComponent(encoded)}`, 'http://127.0.0.1:1'), 'http://local');
  const launch = JSON.parse(result.searchParams.get('launch'));
  assert.equal(launch.headless, false);
  assert.ok(launch.args.includes('--lang=ro'));
  assert.ok(launch.args.includes('--proxy-server=http://127.0.0.1:1'));
});
for (const raw of ['secret@host', 'socks4://secret@host:1080', 'socks5://secret@host:0', 'socks5://secret@host:99999', 'socks5://secret@host:1080/path', 'socks5://secret@host:1080?q=1', 'socks5://secret@host:1080#x', 'socks5://%GG:secret@host:1080', 'socks5://se\ncret@host:1080']) {
  test('invalid proxy fails closed and error contains no input secret', async () => {
    await assert.rejects(createProxyPolicy(raw), (error) => {
      assert.ok(!error.message.includes('secret'));
      return true;
    });
  });
}
test('CDP launch preserves unrelated options/token and enforces loopback proxy', () => {
  const initial = { headless: false, args: ['--lang=ro', '--no-proxy-server', '--proxy-server=http://wrong', '--proxy-bypass-list=*'], proxy: { server: 'http://wrong' } };
  const result = proxiedRequestURL(`/chromium?token=fixture&--proxy-server=wrong&launch=${encodeURIComponent(JSON.stringify(initial))}`, 'http://127.0.0.1:12345');
  const parsed = new URL(result, 'http://local');
  const launch = JSON.parse(parsed.searchParams.get('launch'));
  assert.equal(parsed.searchParams.get('token'), 'fixture');
  assert.equal(parsed.searchParams.has('--proxy-server'), false);
  assert.equal(launch.headless, false);
  assert.equal(launch.proxy, undefined);
  assert.deepEqual(launch.args, ['--lang=ro', '--proxy-server=http://127.0.0.1:12345', '--proxy-bypass-list=<-loopback>', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']);
});
for (const path of ['/chromium', '/chromium/', '/chromium/puppeteer', '/chromium/playwright', '/chrome', '/edge']) {
  test(`proxy applied to launch endpoint ${path}`, () => {
    assert.match(decodeURIComponent(proxiedRequestURL(`${path}?token=t`, 'http://127.0.0.1:1')), /--proxy-server=/);
  });
}
for (const path of ['/devtools/browser/id?token=t', '/sessions?token=t', '/debugger/?token=t']) {
  test(`management/reconnect unchanged: ${path}`, () => assert.equal(proxiedRequestURL(path, 'http://127.0.0.1:1'), path));
}
for (const launch of ['bad', 'null', '[]', '{"args":"wrong"}', '{"args":[1]}']) {
  test(`invalid launch options rejected: ${launch}`, () => assert.throws(() => proxiedRequestURL(`/chromium?launch=${encodeURIComponent(launch)}`, 'http://127.0.0.1:1')));
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
function proxyGet(policy, destination) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(policy.proxyURL);
    const req = http.get({ host: proxy.hostname, port: proxy.port, path: destination }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(4000, () => req.destroy(new Error('test request timed out')));
  });
}

// A real, tiny SOCKS5 fixture implements username/password and CONNECT. The
// requested destination name intentionally cannot resolve locally.
async function socksFixture() {
  const destinations = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let data = Buffer.alloc(0), stage = 0;
    const receive = (chunk) => {
      data = Buffer.concat([data, chunk]);
      while (true) {
        if (stage === 0) {
          if (data.length < 2 || data.length < 2 + data[1]) return;
          assert.equal(data[0], 5);
          assert.ok([...data.subarray(2, 2 + data[1])].includes(2));
          data = data.subarray(2 + data[1]);
          socket.write(Buffer.from([5, 2])); stage = 1;
        } else if (stage === 1) {
          if (data.length < 2 || data.length < 3 + data[1]) return;
          const userLength = data[1], passLength = data[2 + userLength];
          if (data.length < 3 + userLength + passLength) return;
          const user = data.subarray(2, 2 + userLength).toString();
          const pass = data.subarray(3 + userLength, 3 + userLength + passLength).toString();
          data = data.subarray(3 + userLength + passLength);
          if (user !== 'fixture' || pass !== 'password') { socket.end(Buffer.from([1, 1])); return; }
          socket.write(Buffer.from([1, 0])); stage = 2;
        } else {
          if (data.length < 5) return;
          assert.equal(data[1], 1);
          assert.equal(data[3], 3, 'destination must be sent as a name, not locally resolved');
          const length = data[4];
          if (data.length < 7 + length) return;
          const hostname = data.subarray(5, 5 + length).toString();
          const port = data.readUInt16BE(5 + length);
          destinations.push({ hostname, port });
          const pending = data.subarray(7 + length);
          socket.removeListener('data', receive);
          const target = net.connect(port, '127.0.0.1', () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (pending.length) target.write(pending);
            socket.pipe(target); target.pipe(socket);
          });
          sockets.add(target);
          target.on('close', () => sockets.delete(target));
          target.on('error', () => socket.destroy());
          socket.on('close', () => target.destroy());
          return;
        }
      }
    };
    socket.on('data', receive);
  });
  const port = await listen(server);
  return { port, destinations, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise((r) => server.close(r)); } };
}

test('authenticated SOCKS5 bridge forwards real HTTP with remote destination DNS', async (t) => {
  const target = http.createServer((_req, res) => res.end('through-socks'));
  const targetPort = await listen(target);
  t.after(() => new Promise((r) => target.close(r)));
  const socks = await socksFixture(); t.after(() => socks.close());
  const policy = await createProxyPolicy(`fixture:password@127.0.0.1:${socks.port}`);
  t.after(() => policy.close());
  assert.equal(policy.server.server.address().address, '127.0.0.1');
  const result = await proxyGet(policy, `http://fixture.invalid:${targetPort}/`);
  assert.deepEqual(result, { status: 200, body: 'through-socks' });
  assert.deepEqual(socks.destinations, [{ hostname: 'fixture.invalid', port: targetPort }]);
});

test('authenticated SOCKS5 bridge forwards CONNECT tunnels', async (t) => {
  const target = net.createServer((socket) => { socket.on('data', () => socket.end('tunnel-ok')); });
  const targetPort = await listen(target); t.after(() => new Promise((r) => target.close(r)));
  const socks = await socksFixture(); t.after(() => socks.close());
  const policy = await createProxyPolicy(`socks5://fixture:password@127.0.0.1:${socks.port}`); t.after(() => policy.close());
  const proxy = new URL(policy.proxyURL);
  const response = await new Promise((resolve, reject) => {
    const req = http.request({ host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: `fixture.invalid:${targetPort}` });
    req.on('error', reject);
    req.setTimeout(4000, () => req.destroy(new Error('CONNECT timeout')));
    req.on('connect', (res, socket) => {
      assert.equal(res.statusCode, 200);
      let body = ''; socket.on('data', (d) => { body += d; }); socket.on('end', () => resolve(body));
      socket.on('error', reject); socket.write('ping');
    });
    req.end();
  });
  assert.equal(response, 'tunnel-ok');
  assert.equal(socks.destinations[0].hostname, 'fixture.invalid');
});

test('wrong SOCKS credentials fail without contacting the target directly', async (t) => {
  let directHits = 0;
  const target = http.createServer((_req, res) => { directHits++; res.end('direct'); });
  const port = await listen(target); t.after(() => new Promise((r) => target.close(r)));
  const socks = await socksFixture(); t.after(() => socks.close());
  const policy = await createProxyPolicy(`fixture:wrong@127.0.0.1:${socks.port}`); t.after(() => policy.close());
  const result = await proxyGet(policy, `http://127.0.0.1:${port}/`);
  assert.notEqual(result.status, 200);
  assert.equal(directHits, 0);
});

test('hook rejects bad launch JSON and leaves HTTP requests unchanged', async (t) => {
  const policy = await createProxyPolicy('socks5://127.0.0.1:1'); t.after(() => policy.close());
  let ended = false;
  assert.equal(await policy.before({ req: { url: '/chromium?launch=bad' }, socket: { end() { ended = true; } } }), false);
  assert.equal(ended, true);
  const req = { url: '/chromium/screenshot?token=fixture' };
  assert.equal(await policy.before({ req }), true);
  assert.equal(req.url, '/chromium/screenshot?token=fixture');
});
