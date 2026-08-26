const box = document.getElementById('lightbox');
const boxImg = document.getElementById('lightboxImg');
document.querySelectorAll('.clickable').forEach(img => {
  img.addEventListener('click', () => {
    boxImg.src = img.src;
    box.classList.add('open');
    box.setAttribute('aria-hidden','false');
  });
});
function closeBox() {
  box.classList.remove('open');
  box.setAttribute('aria-hidden','true');
  boxImg.src = '';
}
document.getElementById('closeBtn').addEventListener('click', closeBox);
box.addEventListener('click', e => { if (e.target === box) closeBox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBox(); });
