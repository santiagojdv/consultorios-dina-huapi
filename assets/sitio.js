// Comportamiento compartido del sitio: menú, encabezado, apariciones y links de WhatsApp.
// Datos de contacto en un solo lugar: cambiá WHATSAPP y se actualizan todos los botones.
export const WHATSAPP = ''; // Ej.: '5492944123456' (código país + 9 + área + número, sin espacios)

document.documentElement.classList.add('js');

/** Link de WhatsApp con mensaje armado. Sin número cargado, abre WhatsApp para elegir contacto. */
export function wa(texto = '') {
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return WHATSAPP ? `https://wa.me/${WHATSAPP}${q}` : `https://wa.me/${q}`;
}

// Cualquier elemento con data-wa="mensaje" pasa a ser un link de WhatsApp con ese mensaje.
for (const a of document.querySelectorAll('[data-wa]')) {
  a.href = wa(a.dataset.wa);
  a.target = '_blank';
  a.rel = 'noopener';
}

// Encabezado: línea inferior al bajar.
const top = document.querySelector('.top');
const mbar = document.querySelector('.mbar');
const onScroll = () => {
  const y = window.scrollY;
  top?.classList.toggle('scrolled', y > 8);
  mbar?.classList.toggle('show', y > 520);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Menú en el teléfono.
const drawer = document.querySelector('.drawer');
const abrir = document.querySelector('.menu-btn');
const cerrar = drawer?.querySelector('[data-close]');
function setMenu(open) {
  if (!drawer) return;
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  abrir?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) cerrar?.focus(); else abrir?.focus();
}
abrir?.addEventListener('click', () => setMenu(true));
cerrar?.addEventListener('click', () => setMenu(false));
drawer?.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer?.classList.contains('open')) setMenu(false); });

// Apariciones suaves al entrar en pantalla.
const els = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
} else {
  els.forEach((el) => el.classList.add('in'));
}

for (const el of document.querySelectorAll('[data-year]')) el.textContent = new Date().getFullYear();
