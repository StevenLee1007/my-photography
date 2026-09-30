import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
class FakeR2 {
  data = new Map(); counter = 0;
  async get(key) {
    const value = this.data.get(key); if (!value) return null;
    return { ...value, body: new Blob([value.data]).stream(), json: async () => JSON.parse(value.data) };
  }
  async head(key) { return this.get(key); }
  async put(key, data, options = {}) {
    const current = this.data.get(key); const condition = options.onlyIf;
    if (condition?.get('If-Match') && condition.get('If-Match') !== current?.httpEtag) return null;
    if (condition?.get('If-None-Match') === '*' && current) return null;
    const value = { data, httpEtag: '"' + ++this.counter + '"', httpMetadata: options.httpMetadata };
    this.data.set(key, value); return value;
  }
}
function setup() {
  const env = { PHOTOS: new FakeR2(), ADMIN_PASSWORD: 'test-password-very-long', SESSION_SECRET: 'test-session-secret-32-characters-long', LOGIN_LIMIT: { limit: async () => ({ success: true }) } };
  let cookie;
  const call = async (path, method = 'GET', body, origin = 'https://stevenlee.uk', extraHeaders = {}) => {
    const headers = { ...extraHeaders }; if (origin) headers.Origin = origin; if (cookie) headers.Cookie = cookie;
    const request = new Request('https://api.stevenlee.uk' + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });
    const response = await worker.fetch(request, env);
    if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
    return response;
  };
  return { env, call };
}
test('authenticated upload, persistent publish, order/cover change, remove and logout', async () => {
  const { env, call } = setup();
  assert.equal((await call('/api/upload', 'POST', new Uint8Array([255,216,255]))).status, 401);
  assert.equal((await call('/api/login', 'POST', { password: 'wrong' })).status, 401);
  const login = await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD }); assert.equal(login.status, 200);
  assert.match(login.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await call('/api/session')).status, 200);
  const photo = await (await call('/api/upload', 'POST', new Uint8Array([255,216,255,224]))).json();
  const gallery = { albums: [{ id: 'travel', title: '旅行', description: '', section: 'stories', layout: 'masonry', cover: photo.id, photos: [photo, { id: 'existing', src: 'images/street-cat.jpg', title: '猫', alt: '街头' }] }] };
  const first = await call('/api/gallery', 'PUT', { gallery, revision: null }); assert.equal(first.status, 200);
  const saved = await first.json();
  const publicRead = await call('/api/gallery', 'GET', undefined, null); assert.deepEqual((await publicRead.json()).gallery.albums, saved.gallery.albums);
  assert.equal((await call('/media/' + photo.src, 'GET', undefined, null)).status, 200);
  gallery.albums[0].photos.reverse(); gallery.albums[0].cover = 'existing'; gallery.albums[0].layout = 'large';
  const second = await (await call('/api/gallery', 'PUT', { gallery, revision: saved.revision })).json();
  assert.equal(second.gallery.albums[0].photos[0].id, 'existing'); assert.equal(second.gallery.albums[0].cover, 'existing');
  assert.equal((await call('/api/gallery', 'PUT', { gallery, revision: saved.revision })).status, 409);
  const removed = await call('/api/gallery', 'PUT', { gallery: { albums: [] }, revision: second.revision }); assert.equal(removed.status, 200);
  assert.deepEqual((await (await call('/api/gallery')).json()).gallery.albums, []);
  assert.ok(await env.PHOTOS.head(photo.src), 'removed source retained for recovery');
  assert.equal((await call('/api/logout', 'POST')).status, 200); assert.equal((await call('/api/session')).status, 401);
});
test('reject cross-site writes, forged sessions, executable images, excessive bodies, invalid URLs, missing uploads', async () => {
  const { env, call } = setup();
  assert.equal((await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD }, 'https://evil.example')).status, 403);
  assert.equal((await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD }, null)).status, 403);
  assert.equal((await call('/api/session', 'GET', undefined, 'https://stevenlee.uk', { Cookie: '__Host-stevenlee=bad' })).status, 401);
  await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD });
  assert.equal((await call('/api/upload', 'POST', '<svg onload="alert(1)"></svg>')).status, 400);
  assert.equal((await call('/api/upload', 'POST', new Uint8Array(10 * 1024 * 1024 + 1))).status, 413);
  const album = { id: 'a', title: 'A', description: '', section: 'works', layout: 'grid', cover: '', photos: [{ id: 'one', src: 'javascript:alert(1)', title: '', alt: '' }] };
  assert.equal((await call('/api/gallery', 'PUT', { gallery: { albums: [album] }, revision: null })).status, 400);
  album.photos[0].src = 'photos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg';
  assert.equal((await call('/api/gallery', 'PUT', { gallery: { albums: [album] }, revision: null })).status, 400);
  env.LOGIN_LIMIT.limit = async () => ({ success: false }); assert.equal((await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD })).status, 429);
});
test('conditional write rejects a race after the initial revision read', async () => {
  const { env, call } = setup(); await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD });
  const put = env.PHOTOS.put.bind(env.PHOTOS);
  env.PHOTOS.put = async (key, data, options) => {
    if (key === 'private/gallery.json') await put(key, '{"albums":[]}');
    return put(key, data, options);
  };
  assert.equal((await call('/api/gallery', 'PUT', { gallery: { albums: [] }, revision: null })).status, 409);
});
test('storage/setup errors are truthful and password changes revoke sessions', async () => {
  const { env, call } = setup(); await call('/api/login', 'POST', { password: env.ADMIN_PASSWORD }); env.ADMIN_PASSWORD += 'new';
  assert.equal((await call('/api/session')).status, 401);
  env.PHOTOS = undefined; assert.equal((await call('/api/gallery')).status, 503);
});
