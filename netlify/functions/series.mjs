// Public, read-only. Series that have at least one live sermon.
//   GET /api/series        -> { series: [{ slug, name, count, firstDate, latestDate }], current: {...} | null }
//   GET /api/series/:slug  -> { slug, name, sermons: [...newest first], current: "2026-11-15" }
import { overview } from './lib/data.mjs';
import { json, REVALIDATE } from './lib/http.mjs';

const pub = ({ source, ...entry }) => entry; // eslint-disable-line no-unused-vars

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const slug = decodeURIComponent(new URL(req.url).pathname.replace(/^\/api\/series\/?/, '').split('/')[0] || '');
  const { live, series } = await overview();
  const shown = series.filter((s) => s.live > 0);
  const current = live[0] || null;

  if (!slug) {
    return json({
      series: shown.map((s) => ({ slug: s.slug, name: s.name, count: s.live, firstDate: s.firstDate, latestDate: s.latestDate })),
      current: current ? pub(current) : null
    }, 200, REVALIDATE);
  }

  const s = shown.find((x) => x.slug === slug);
  if (!s) return json({ error: 'not_found' }, 404);
  return json({
    slug: s.slug,
    name: s.name,
    sermons: live.filter((e) => e.seriesSlug === slug).map(pub),
    current: current ? current.slug : null
  }, 200, REVALIDATE);
};

export const config = { path: ['/api/series', '/api/series/*'] };
