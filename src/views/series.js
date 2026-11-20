// /series/:slug: one series, its sermons newest first, with this device's notes flagged.
import { getSeries } from '../lib/api.js';
import { savedSummary } from '../lib/store.js';
import { refLabel } from '../lib/ref.js';
import { shortDate } from '../lib/time.js';
import { esc, icon } from '../lib/html.js';
import { seriesImageHtml, wireImageFallbacks } from '../lib/img.js';

export async function mountSeries(root, slug) {
  wireImageFallbacks(root, (img) => { const h = img.closest('header'); if (h) h.remove(); });
  root.innerHTML = '<div class="page"><div class="center-msg"><p>Loading…</p></div></div>';

  let data;
  try {
    data = await getSeries(slug);
  } catch (err) {
    document.title = 'Sermons · Sermon Notes';
    root.innerHTML = err.status === 404
      ? `<div class="page"><div class="center-msg"><h1 style="font-family:var(--display);margin:0">We couldn’t find that series</h1><a class="btn" href="/sermons" data-link>All sermons</a></div></div>`
      : `<div class="page"><div class="center-msg"><p>We couldn’t load this series. Check your connection and try again.</p><button class="btn" type="button" onclick="location.reload()">Try again</button></div></div>`;
    return () => {};
  }

  document.title = `${data.name} · Sermon Notes`;
  const saved = savedSummary();
  const card = (s) => {
    const mine = saved[s.slug];
    const badge = mine
      ? `<span class="badge saved">Your notes · ${mine.filled}${s.blankCount ? ' of ' + s.blankCount : ''} blanks${mine.notes ? ', ' + mine.notes + ' note' + (mine.notes === 1 ? '' : 's') : ''}</span>`
      : '';
    const refs = s.refs && s.refs.length ? ' · ' + esc(s.refs.map(refLabel).join(', ')) : '';
    return `<li><a class="sermon-card" href="${s.slug === data.current ? '/' : '/sermons/' + esc(s.slug)}" data-link>
      ${s.slug === data.current ? '<span class="badge live">This week</span>' : ''}
      <span class="t">${esc(s.title)}</span>
      <span class="m">${esc(shortDate(s.date))}${refs}</span>${badge}</a></li>`;
  };

  root.innerHTML = `<div class="page">
    <header>${seriesImageHtml(slug, { alt: data.name + ' sermon series', className: 'series-img short' })}</header>
    <div class="plain">
      <a class="back-link" href="/sermons" data-link>${icon('chevron-left', 16)}<span>All sermons</span></a>
      <div style="display:flex;flex-direction:column;gap:8px">
        <p class="eyebrow">Series</p>
        <h1>${esc(data.name)}</h1>
        <p style="color:var(--muted)">${data.sermons.length} sermon${data.sermons.length === 1 ? '' : 's'}</p>
      </div>
      <ul class="series-list">${data.sermons.map(card).join('')}</ul>
    </div></div>`;
  return () => {};
}
