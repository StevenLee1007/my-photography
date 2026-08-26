const navDropdowns = [...document.querySelectorAll('.nav-dropdown')];

function closeNavDropdowns(except = null) {
  navDropdowns.forEach(dropdown => {
    if (dropdown !== except) dropdown.open = false;
  });
}

navDropdowns.forEach(dropdown => {
  let closeTimer;

  dropdown.addEventListener('toggle', () => {
    if (dropdown.open) closeNavDropdowns(dropdown);
  });

  dropdown.addEventListener('mouseenter', () => {
    window.clearTimeout(closeTimer);
  });

  dropdown.addEventListener('mouseleave', () => {
    closeTimer = window.setTimeout(() => {
      dropdown.open = false;
    }, 160);
  });
});

document.addEventListener('click', event => {
  if (!event.target.closest('.nav-dropdown')) closeNavDropdowns();
});

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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeBox();
    closeNavDropdowns();
  }
});
