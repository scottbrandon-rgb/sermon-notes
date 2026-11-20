// Past sermons, grouped under their series. Shows which ones this device has notes for.
import { getSermons } from '../lib/api.js';
import { savedSummary } from '../lib/store.js';
import { refLabel } from '../lib/ref.js';
import { shortDate } from '../lib/time.js';
import { esc } from '../lib/html.js';

export async function mountArchive(root) {
  document.title = 'Past sermons · Sermon Notes';
  root.innerHTML = '<div class="page"><div class="center-msg"><p>Loading…</p></div></div>';

  let data;
  try {
    data = await getSermons();
  } catch {
    root.innerHTML = `<div class="page"><div class="center-msg"><p>We couldn’t load the sermon list. Check your connection and try again.</p>
      <button class="btn" type="button" onclick="location.reload()">Try again</button></div></div>`;
    return () => {};
  }

  const saved = savedSummary();
  const groups = [];
  for (const s of data.sermons) {
    let g = groups.find((x) => x.slug === s.seriesSlug);
    if (!g) { g = { slug: s.seriesSlug, name: s.series, items: [] }; groups.push(g); }
    g.items.push(s);
  }

  const card = (s) => {
    const mine = saved[s.slug];
    const notesBadge = mine
      ? `<span class="badge saved">Your notes · ${mine.filled}${s.blankCount ? ' of ' + s.blankCount : ''} blanks${mine.notes ? ', ' + mine.notes + ' note' + (mine.notes === 1 ? '' : 's') : ''}</span>`
      : '';
    const href = s.slug === data.current ? '/' : '/sermons/' + esc(s.slug);
    return `<li><a class="sermon-card" href="${href}" data-link>
      ${s.slug === data.current ? '<span class="badge live">This week</span>' : ''}
      <span class="t">${esc(s.title)}</span>
      <span class="m">${esc(shortDate(s.date))}${s.refs && s.refs.length ? ' · ' + esc(s.refs.map(refLabel).join(', ')) : ''}</span>
      ${notesBadge}</a></li>`;
  };

  root.innerHTML = `<div class="page"><div class="plain">
    <div style="display:flex;flex-direction:column;gap:8px">
      <p class="eyebrow">Sermon notes</p>
      <h1>Past sermons</h1>
      <p style="color:var(--muted)">Your notes are saved on this device. Tap a sermon to see them.</p>
    </div>
    ${groups.length ? groups.map((g) => `<section class="series-group" aria-label="${esc(g.name)}">
      <h2>${esc(g.name)}</h2><ul class="series-list">${g.items.map(card).join('')}</ul></section>`).join('')
      : '<p>No sermons are posted yet.</p>'}
    <p><a href="/" data-link>Back to this week’s notes</a></p>
  </div></div>`;
  return () => {};
}
