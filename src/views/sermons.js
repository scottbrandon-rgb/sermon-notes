// /sermons: this week on top, every series below.
import { getSeriesList } from '../lib/api.js';
import { savedSummary } from '../lib/store.js';
import { shortDate } from '../lib/time.js';
import { esc, icon } from '../lib/html.js';
import { seriesImageHtml, wireImageFallbacks } from '../lib/img.js';

export async function mountSermons(root) {
  document.title = 'Sermons · Sermon Notes';
  wireImageFallbacks(root);
  root.innerHTML = '<div class="page"><div class="center-msg"><p>Loading…</p></div></div>';

  let data;
  try {
    data = await getSeriesList();
  } catch {
    root.innerHTML = `<div class="page"><div class="center-msg"><p>We couldn’t load the sermons. Check your connection and try again.</p>
      <button class="btn" type="button" onclick="location.reload()">Try again</button></div></div>`;
    return () => {};
  }

  const saved = savedSummary();
  const cur = data.current;
  const mine = cur && saved[cur.slug];
  const thisWeek = cur
    ? `<a class="sermon-card featured" href="/" data-link>
        <span class="badge live">This week</span>
        <span class="t">${esc(cur.title)}</span>
        <span class="m">${esc(cur.series)} · ${esc(shortDate(cur.date))}</span>
        ${mine ? `<span class="badge saved">Your notes · ${mine.filled}${cur.blankCount ? ' of ' + cur.blankCount : ''} blanks</span>` : ''}
      </a>`
    : '';

  const monthDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const range = (s) => {
    if (s.firstDate === s.latestDate) return shortDate(s.latestDate);
    if (s.firstDate.slice(0, 4) === s.latestDate.slice(0, 4)) return `${monthDay(s.firstDate)} – ${monthDay(s.latestDate)}, ${s.latestDate.slice(0, 4)}`;
    return `${shortDate(s.firstDate)} – ${shortDate(s.latestDate)}`;
  };
  const card = (s) => `<li><a class="series-card" href="/series/${esc(s.slug)}" data-link>
      <span class="thumb">${seriesImageHtml(s.slug, { alt: '' })}</span>
      <span class="body"><span class="t">${esc(s.name)}</span><span class="m">${s.count} sermon${s.count === 1 ? '' : 's'}</span><span class="m">${esc(range(s))}</span></span>
      ${icon('chevron-right', 18)}</a></li>`;

  root.innerHTML = `<div class="page"><div class="plain">
    <div style="display:flex;flex-direction:column;gap:8px">
      <img class="brand-logo header" src="/brand/hf-logo.png" width="130" height="40" alt="Harrison Faith Church">
      <h1>Sermons</h1>
      <p style="color:var(--muted)">Your notes are saved on this device. Open any sermon to see them.</p>
    </div>
    ${thisWeek}
    ${data.series.length ? `<section class="series-group" aria-label="Series">
      <p class="eyebrow">Series</p><ul class="series-list">${data.series.map(card).join('')}</ul></section>`
      : '<p>No sermons are posted yet. Check back Sunday morning.</p>'}
  </div></div>`;
  return () => {};
}
