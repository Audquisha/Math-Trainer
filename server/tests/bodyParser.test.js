jest.mock('uuid', () => ({ v4: () => 'test-opid' }));

const http = require('node:http');
const { gzipSync, deflateSync, brotliCompressSync } = require('node:zlib');
const app = require('../app');
let server;

beforeAll(done => { server = app.listen(0, '127.0.0.1', done); });
afterAll(done => { server.close(done); });

function sendBody(body, encoding, trailing = Buffer.alloc(0)) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: server.address().port, path: '/api/health', method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': encoding,
        'Content-Length': body.length + trailing.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.write(body);
    setImmediate(() => req.end(trailing));
  });
}

test.each([
  ['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync],
])('continues accepting valid %s JSON requests', async (encoding, compress) => {
  const result = await sendBody(compress(Buffer.from('{"ok":true}')), encoding);
  expect(result.status).toBe(200);
  expect(result.body.ok).toBe(true);
});

test('rejects trailing garbage after compressed JSON and remains available', async () => {
  const result = await sendBody(gzipSync(Buffer.from('{"ok":true}')), 'gzip', Buffer.from('invalid trailing bytes'));
  expect(result.status).toBe(400);
  expect(result.body).toEqual({ message: 'Invalid request.' });
  expect((await sendBody(gzipSync(Buffer.from('{}')), 'gzip')).status).toBe(200);
});

test('retains the decompressed request-size limit', async () => {
  const result = await sendBody(gzipSync(Buffer.from(JSON.stringify({ value: 'x'.repeat(110000) }))), 'gzip');
  expect(result.status).toBe(413);
  expect(result.body).toEqual({ message: 'Invalid request.' });
});