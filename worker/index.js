const ORIGINS = new Set(['https://stevenlee.uk', 'https://www.stevenlee.uk']);
const MANIFEST = 'private/gallery.json';
const encoder = new TextEncoder();
const imageKey = /^photos\/[a-f0-9-]{36}\.(jpg|png|webp)$/;
const cookieName = '__Host-stevenlee';
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
async function bytes(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) fail('文件或内容过大', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); fail('文件或内容过大', 413); } parts.push(value); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
async function bodyJson(request, max = 1000000) {
  try { return JSON.parse(new TextDecoder().decode(await bytes(request, max))); }
  catch (error) { if (error.status) throw error; fail('内容格式不正确'); }
}
async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
function equal(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
async function signingKey(env) {
  return crypto.subtle.importKey('raw', await digest(env.SESSION_SECRET + ':' + env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function session(env) {
  const payload = Math.floor(Date.now() / 1000) + 28800 + ':' + crypto.randomUUID();
  const sig = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  return payload + '.' + Array.from(new Uint8Array(sig), n => n.toString(16).padStart(2, '0')).join('');
}
async function authenticated(request, env) {
  const value = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!value || !/^\d+:[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) return false;
  const [payload, hex] = value.split('.'); const expiry = Number(payload.split(':')[0]);
  if (expiry < Date.now() / 1000 || expiry > Date.now() / 1000 + 28801) return false;
  return crypto.subtle.verify('HMAC', await signingKey(env), Uint8Array.from(hex.match(/../g), s => parseInt(s, 16)), encoder.encode(payload));
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('名称或说明不符合要求');
  return value.trim();
}
export function validateGallery(value) {
  if (!value || !Array.isArray(value.albums) || value.albums.length > 100) fail('最多支持 100 个相册');
  const ids = new Set(); let total = 0;
  return { version: 1, albums: value.albums.map(album => {
    if (!/^[a-z0-9-]{1,80}$/.test(album.id) || ids.has(album.id)) fail('相册编号重复或不正确'); ids.add(album.id);
    if (!['grid', 'masonry', 'large', 'featured'].includes(album.layout) || !['works', 'stories'].includes(album.section)) fail('排版或位置不正确');
    if (!Array.isArray(album.photos) || (total += album.photos.length) > 2000) fail('最多支持 2000 张照片');
    const photoIds = new Set();
    const photos = album.photos.map(photo => {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(photo.id) || photoIds.has(photo.id)) fail('照片编号重复或不正确'); photoIds.add(photo.id);
      if (typeof photo.src !== 'string' || !(imageKey.test(photo.src) || /^images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(photo.src))) fail('照片地址不正确');
      return { id: photo.id, src: photo.src, title: text(photo.title, 150), alt: text(photo.alt, 300) };
    });
    const cover = photos.some(p => p.id === album.cover) ? album.cover : photos[0]?.id || '';
    return { id: album.id, title: text(album.title, 150, true), description: text(album.description, 2000), layout: album.layout, section: album.section, cover, photos };
  }) };
}
async function readGallery(env) {
  const object = await env.PHOTOS.get(MANIFEST);
  return object ? { gallery: await object.json(), revision: object.httpEtag } : { gallery: null, revision: null };
}
function photoType(data) {
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return ['jpg', 'image/jpeg'];
  if ([137,80,78,71,13,10,26,10].every((n, i) => data[i] === n)) return ['png', 'image/png'];
  const ascii = new TextDecoder().decode(data.slice(0, 12));
  if (ascii.startsWith('RIFF') && ascii.endsWith('WEBP')) return ['webp', 'image/webp'];
  fail('仅支持 JPG、PNG、WebP 照片');
}
async function route(request, env) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (!env.PHOTOS) fail('云端存储尚未接通', 503);
  if (method === 'GET' && path === '/api/gallery') return json(await readGallery(env));
  if (method === 'GET' && path.startsWith('/media/')) {
    const key = path.slice(7); if (!imageKey.test(key)) fail('照片不存在', 404);
    const photo = await env.PHOTOS.get(key); if (!photo) fail('照片不存在', 404);
    return new Response(photo.body, { headers: { 'Content-Type': photo.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'ETag': photo.httpEtag, 'X-Content-Type-Options': 'nosniff' } });
  }
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.LOGIN_LIMIT) fail('管理后台尚未完成配置', 503);
  if (method === 'POST' && path === '/api/login') {
    const allowed = await env.LOGIN_LIMIT.limit({ key: 'photography-owner-login' });
    if (!allowed.success) return json({ error: '尝试次数较多，请一分钟后再试' }, 429, { 'Retry-After': '60' });
    const input = await bodyJson(request, 4096);
    if (typeof input.password !== 'string' || !equal(await digest(input.password), await digest(env.ADMIN_PASSWORD))) fail('密码不正确', 401);
    return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=${await session(env)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800` });
  }
  if (!await authenticated(request, env)) fail('请先登录', 401);
  if (method === 'GET' && path === '/api/session') return json({ ok: true });
  if (method === 'POST' && path === '/api/logout') return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` });
  if (method === 'POST' && path === '/api/upload') {
    const data = await bytes(request, 10 * 1024 * 1024);
    const [extension, contentType] = photoType(data);
    const key = `photos/${crypto.randomUUID()}.${extension}`;
    await env.PHOTOS.put(key, data, { httpMetadata: { contentType }, customMetadata: { uploadedAt: new Date().toISOString() } });
    return json({ id: key.split('/')[1].split('.')[0], src: key, title: '', alt: '' }, 201);
  }
  if (method === 'PUT' && path === '/api/gallery') {
    const input = await bodyJson(request); const gallery = validateGallery(input.gallery);
    const current = await readGallery(env);
    if (input.revision !== current.revision) fail('另一个页面已经更新了内容，请重新加载后再编辑', 409);
    // Verify uploaded files without spending an R2 operation on every unchanged image.
    const existing = new Set(current.gallery?.albums.flatMap(a => a.photos.map(p => p.src)) || []);
    const added = [...new Set(gallery.albums.flatMap(a => a.photos.map(p => p.src)).filter(key => imageKey.test(key) && !existing.has(key)))];
    for (const key of added) if (!await env.PHOTOS.head(key)) fail('有照片尚未上传完成');
    gallery.updatedAt = new Date().toISOString();
    const condition = current.revision ? new Headers({ 'If-Match': current.revision }) : new Headers({ 'If-None-Match': '*' });
    const result = await env.PHOTOS.put(MANIFEST, JSON.stringify(gallery), { onlyIf: condition, httpMetadata: { contentType: 'application/json' } });
    if (!result) fail('内容已发生变化，请重新加载后再编辑', 409);
    // Removing photos unpublishes them; source files remain for recovery.
    return json({ gallery, revision: result.httpEtag });
  }
  fail('找不到此功能', 404);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    let response;
    try {
      if (origin && !ORIGINS.has(origin)) fail('不允许此网站访问', 403);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !ORIGINS.has(origin)) fail('请从摄影网站操作', 403);
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env);
    } catch (error) { response = json({ error: error.status ? error.message : '服务暂时不可用，请稍后重试' }, error.status || 500); }
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Vary', 'Origin');
    if (ORIGINS.has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    return new Response(response.body, { status: response.status, headers });
  }
};
