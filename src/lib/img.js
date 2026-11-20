// Series header images: the uploaded one first, then the bundled /series/<slug>.jpg,
// then nothing (callers decide what "nothing" looks like).
import { esc } from './html.js';

export function seriesImageHtml(slug, { alt = '', className = '', bust = '' } = {}) {
  const s = esc(slug);
  return `<img class="${className}" src="/api/series-image/${s}${bust ? '?t=' + bust : ''}" data-fallback="/series/${s}.jpg" alt="${esc(alt)}">`;
}

/** Attach once per container. Handles images added now or later. */
export function wireImageFallbacks(root, onMissing = (img) => img.classList.add('img-missing')) {
  root.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.fallback;
    if (fallback) { img.dataset.fallback = ''; img.src = fallback; return; }
    onMissing(img);
  }, true);
}
