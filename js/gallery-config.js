export const API = 'https://api.stevenlee.uk';
export function photoUrl(src) { return src.startsWith('photos/') ? `${API}/media/${src}` : src; }
export function element(tag, className, content) {
  const el = document.createElement(tag); if (className) el.className = className;
  if (content !== undefined) el.textContent = content; return el;
}
export function photoGrid(album) {
  const grid = element('div', `managed-grid layout-${album.layout}`);
  album.photos.forEach(photo => {
    const figure = element('figure'); const img = element('img', 'clickable');
    img.src = photoUrl(photo.src); img.alt = photo.alt || photo.title || album.title; img.loading = 'lazy';
    figure.append(img); if (photo.title) figure.append(element('figcaption', '', photo.title)); grid.append(figure);
  }); return grid;
}
