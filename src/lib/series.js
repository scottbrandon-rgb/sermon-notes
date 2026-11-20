// Series grouping and previous/next, shared by the functions and the tests.
// An "entry" is sermon metadata: { slug, date, series, seriesSlug, title, publishAt, ... }.

const byDateDesc = (a, b) => b.date.localeCompare(a.date) || String(b.publishAt).localeCompare(String(a.publishAt));
const isLive = (e, now) => Date.parse(e.publishAt) <= now;

/**
 * Every series, from the stored series records plus any series a sermon names.
 * @returns {{slug,name,createdAt,total,live,firstDate,latestDate,lastAny}[]} newest first
 */
export function summarizeSeries(entries, records = [], now = Date.now()) {
  const map = new Map();
  for (const r of records) map.set(r.slug, { slug: r.slug, name: r.name, createdAt: r.createdAt || '', sermons: [] });
  for (const e of entries) {
    if (!e.seriesSlug) continue;
    let s = map.get(e.seriesSlug);
    if (!s) { s = { slug: e.seriesSlug, name: e.series, createdAt: '', sermons: [] }; map.set(e.seriesSlug, s); }
    s.sermons.push(e);
  }
  const out = [...map.values()].map((s) => {
    const all = s.sermons.slice().sort(byDateDesc);
    const live = all.filter((e) => isLive(e, now));
    return {
      slug: s.slug,
      name: s.name,
      createdAt: s.createdAt,
      total: all.length,
      live: live.length,
      latestDate: live.length ? live[0].date : '',
      firstDate: live.length ? live[live.length - 1].date : '',
      lastAny: all.length ? all[0].date : ''
    };
  });
  // Series with no sermons yet (just created) first, then newest sermon first.
  out.sort((a, b) =>
    (a.total === 0) !== (b.total === 0)
      ? (a.total === 0 ? -1 : 1)
      : (b.lastAny || b.createdAt).localeCompare(a.lastAny || a.createdAt));
  return out;
}

/** The sermons right before and after `slug` in the same series (live ones only). */
export function neighbors(liveEntries, slug) {
  const me = liveEntries.find((e) => e.slug === slug);
  if (!me) return { prev: null, next: null };
  const list = liveEntries.filter((e) => e.seriesSlug === me.seriesSlug).sort(byDateDesc);
  const i = list.findIndex((e) => e.slug === slug);
  const pick = (e) => (e ? { slug: e.slug, title: e.title, date: e.date } : null);
  return { prev: pick(list[i + 1]), next: pick(list[i - 1]) };
}
