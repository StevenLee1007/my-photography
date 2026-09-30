import { API, element, photoUrl, photoGrid } from './gallery-config.js';
async function load() {
  try {
    const response = await fetch(`${API}/api/gallery`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!response.ok) return;
    const { gallery } = await response.json(); if (!gallery) return;
    const albums = gallery.albums;
    const page = location.pathname.split('/').pop();
    if (page === 'album.html') {
      const album = albums.find(a => a.id === new URLSearchParams(location.search).get('id'));
      const main = document.querySelector('main'); main.replaceChildren();
      if (!album) { main.append(element('h1', '', '此相册暂未发布')); return; }
      main.append(element('h1', '', album.title), element('p', 'album-description', album.description), photoGrid(album)); document.title = `${album.title} — Steven Lee`;
    } else if (page === 'summer.html' || page === 'shantou.html') {
      const album = albums.find(a => a.id === page.split('.')[0]);
      const main = document.querySelector('main');
      main.replaceChildren();
      if (!album) { main.append(element('h2', '', '此相册暂未发布')); return; }
      main.append(element('h2', '', album.title), element('p', 'album-description', album.description), photoGrid(album));
    } else {
      ['works', 'stories'].forEach(id => {
        const section = document.getElementById(id); if (!section) return;
        const primary = albums.find(a => a.id === id && a.section === id);
        section.replaceChildren();
        const head = element('div', 'section-head'); head.append(element('h2', '', primary?.title || (id === 'works' ? 'Selected Works' : 'More Stories')), element('p', '', primary?.description || '')); section.append(head);
        if (primary) section.append(photoGrid(primary));
        const others = albums.filter(a => a.id !== primary?.id && a.section === id);
        const cards = element('div', 'album-cards');
        others.forEach(album => {
          const link = element('a', 'album-card'); link.href = `album.html?id=${encodeURIComponent(album.id)}`;
          const cover = album.photos.find(p => p.id === album.cover) || album.photos[0];
          if (cover) { const img = element('img'); img.src = photoUrl(cover.src); img.alt = album.title; img.loading = 'lazy'; link.append(img); }
          link.append(element('h3', '', album.title), element('p', '', `${album.photos.length} 张照片 · ${album.description}`)); cards.append(link);
        }); section.append(cards);
      });
    }
  } catch { /* The original portfolio remains available while the API is offline. */ }
}
load();
