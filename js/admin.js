import { API, element, photoUrl, photoGrid } from './gallery-config.js';
const $ = id => document.getElementById(id);
let gallery, revision = null, selected, demo = false, dirty = false, busy = false;
const objectUrls = new Set();
function message(text) { $('status').textContent = text; }
function changed() { dirty = true; message(demo ? '操作演示：修改仅在当前页面临时展示，不会上传或发布。' : '有未保存的修改，完成整理后点击「保存并发布」。'); }
function lock(value) {
  busy = value;
  document.querySelectorAll('#workspace button, #workspace input, #workspace select, #workspace textarea').forEach(el => el.disabled = value);
  $('save').disabled = value || demo;
}
async function api(path, options = {}) {
  const response = await fetch(API + path, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(60000), ...options });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '连接失败，请稍后重试'), { status: response.status });
  return result;
}
function button(label, action, disabled = false) {
  const el = element('button', 'secondary', label); el.type = 'button'; el.disabled = disabled; el.addEventListener('click', action); return el;
}
function move(array, index, delta) {
  const next = index + delta; if (next < 0 || next >= array.length || busy) return;
  [array[index], array[next]] = [array[next], array[index]]; changed(); render();
}
function field(label, value, callback, tag = 'input', options) {
  const wrapper = element('label', '', label); const input = element(tag);
  if (options) options.forEach(([id, title]) => { const option = element('option', '', title); option.value = id; input.append(option); });
  input.value = value;
  input.addEventListener(tag === 'select' ? 'change' : 'input', () => { callback(input.value); changed(); preview(); });
  wrapper.append(input); return wrapper;
}
function albumNow() { return gallery.albums.find(a => a.id === selected); }
function preview() {
  const album = albumNow(); const container = $('preview-content'); if (!album || !container) return;
  container.replaceChildren(element('h2', '', album.title), element('p', '', album.description));
  const grid = photoGrid(album); grid.className = `preview-grid layout-${album.layout}`;
  grid.querySelectorAll('img').forEach(img => img.classList.remove('clickable'));
  container.append(grid);
}
function render() {
  const list = $('album-list'); list.replaceChildren();
  gallery.albums.forEach((album, i) => {
    const row = element('div', 'album-row'); const select = button(`${album.title} · ${album.photos.length}`, () => { selected = album.id; render(); });
    select.className = 'album-select' + (album.id === selected ? ' active' : '');
    const arrows = element('div', 'album-arrows'); arrows.append(button('↑', () => move(gallery.albums, i, -1), i === 0), button('↓', () => move(gallery.albums, i, 1), i === gallery.albums.length - 1));
    row.append(select, arrows); list.append(row);
  });
  const editor = $('editor'); editor.replaceChildren(); const album = albumNow();
  if (!album) { editor.append(element('p', '', '创建一个相册，开始整理照片。')); return; }
  const fields = element('div', 'fields');
  const title = field('相册名称', album.title, value => { album.title = value; }); title.querySelector('input').maxLength = 150;
  fields.append(title, field('展示位置', album.section, value => { album.section = value; }, 'select', [['works','首页作品区'],['stories','首页故事区']]));
  const description = field('相册说明', album.description, value => { album.description = value; }, 'textarea'); description.className = 'wide'; description.querySelector('textarea').maxLength = 2000;
  fields.append(description, field('照片排版', album.layout, value => { album.layout = value; }, 'select', [['grid','整齐网格'],['masonry','自然瀑布流'],['large','大图逐张展示'],['featured','重点作品排版']]));
  editor.append(fields);
  const actions = element('div', 'editor-actions'); const upload = element('label', 'upload', '＋ 上传照片');
  const input = element('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/jpeg,image/png,image/webp'; input.addEventListener('change', () => uploadFiles([...input.files])); upload.append(input);
  actions.append(upload, button('删除相册', () => {
    if (!confirm(`删除「${album.title}」？保存后将从网站移除，原图片文件保留。`)) return;
    gallery.albums = gallery.albums.filter(a => a.id !== album.id); selected = gallery.albums[0]?.id; changed(); render();
  })); editor.append(actions, element('p', 'hint', '支持 JPG / PNG / WebP，单张不超过 10 MB。上传后点击保存，才会加入公开相册。删除会移除网站展示，原文件保留以便恢复。'));
  const photos = element('div', 'photos');
  album.photos.forEach((photo, i) => {
    const card = element('article', 'photo'); const img = element('img'); img.src = photoUrl(photo.src); img.alt = photo.alt || photo.title || album.title; img.loading = 'lazy';
    card.append(img, field('照片标题', photo.title, value => { photo.title = value; }), field('图片描述', photo.alt, value => { photo.alt = value; }));
    const controls = element('div', 'photo-controls');
    controls.append(button('←', () => move(album.photos, i, -1), i === 0), button('→', () => move(album.photos, i, 1), i === album.photos.length - 1), button(album.cover === photo.id ? '✓ 封面' : '设为封面', () => { album.cover = photo.id; changed(); render(); }), button('删除', () => {
      if (!confirm('从相册移除这张照片？保存后生效。')) return;
      album.photos.splice(i, 1); if (album.cover === photo.id) album.cover = album.photos[0]?.id || ''; changed(); render();
    })); card.append(controls); photos.append(card);
  }); editor.append(photos);
  const previewSection = element('section', 'preview'); previewSection.append(element('div', 'eyebrow', '排版预览'));
  const content = element('div'); content.id = 'preview-content'; previewSection.append(content); editor.append(previewSection); preview();
  $('save').disabled = demo || busy;
}
async function uploadFiles(files) {
  if (!files.length || busy) return; const album = albumNow(); lock(true); let count = 0;
  try {
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error(`${file.name} 格式不支持`);
      if (file.size > 10 * 1024 * 1024) throw Error(`${file.name} 超过 10 MB`);
      message(`正在${demo ? '预览' : '上传'} ${count + 1}/${files.length}：${file.name}`);
      let photo;
      if (demo) { const src = URL.createObjectURL(file); objectUrls.add(src); photo = { id: crypto.randomUUID(), src, title: '', alt: file.name }; }
      else { photo = await api('/api/upload', { method: 'POST', body: file, headers: { 'Content-Type': file.type } }); photo.alt = file.name.slice(0, 300); }
      album.photos.push(photo); if (!album.cover) album.cover = photo.id; count++; dirty = true;
    }
    changed();
  } catch (error) { message(`${error.message}。已加入 ${count} 张，尚未发布。`); }
  finally { busy = false; render(); lock(false); }
}
async function enter(isDemo) {
  demo = isDemo;
  if (demo) { gallery = await (await fetch('js/gallery-seed.json')).json(); revision = null; }
  else { const result = await api('/api/gallery'); revision = result.revision; gallery = result.gallery || await (await fetch('js/gallery-seed.json')).json(); }
  selected = gallery.albums[0]?.id; dirty = false;
  $('welcome').hidden = true; $('workspace').hidden = false;
  $('exit').textContent = demo ? '退出演示' : '退出登录'; render();
  message(demo ? '操作演示：可试用相册整理和本地图片预览；不会上传或发布，关闭页面后修改消失。' : '已登录。整理完成后点击「保存并发布」，网站会读取最新内容。');
}
$('demo').addEventListener('click', () => enter(true).catch(error => { $('connection').textContent = error.message; }));
$('login').addEventListener('submit', async event => {
  event.preventDefault(); const submit = $('login').querySelector('button'); submit.disabled = true;
  try { await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }) }); $('password').value = ''; await enter(false); }
  catch (error) { $('connection').textContent = error.message; } finally { submit.disabled = false; }
});
$('add-album').addEventListener('click', () => {
  if (gallery.albums.length >= 100) { message('最多支持 100 个相册'); return; }
  const id = crypto.randomUUID(); gallery.albums.push({ id, title: '新的相册', description: '', section: 'works', layout: 'grid', cover: '', photos: [] }); selected = id; changed(); render();
});
$('save').addEventListener('click', async () => {
  if (demo || busy) return;
  if (gallery.albums.some(a => !a.title.trim())) { message('请填写相册名称'); return; }
  lock(true); message('正在保存并发布…');
  try { const result = await api('/api/gallery', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gallery, revision }) }); gallery = result.gallery; revision = result.revision; dirty = false; message('已保存并发布。打开网站或刷新页面即可浏览。'); }
  catch (error) { message(`${error.message}。修改仍在本页，尚未保存。`); }
  finally { lock(false); }
});
$('exit').addEventListener('click', async () => {
  if (busy || (dirty && !confirm('还有未保存的修改，确定退出吗？'))) return;
  try { if (!demo) await api('/api/logout', { method: 'POST' }); }
  catch (error) { message(error.message); return; }
  objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls.clear(); dirty = false;
  location.reload();
});
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
async function connect() {
  try { await api('/api/session', { signal: AbortSignal.timeout(6000) }); await enter(false); }
  catch (error) {
    if (error.status === 401) { $('connection').textContent = '后台已连接，请登录。'; $('login').hidden = false; }
    else { $('connection').textContent = '管理功能已准备，等待接通云端存储。'; $('setup').hidden = false; }
  }
}
connect();
