// Public, read-only. Only sermons whose go-live time has passed are returned.
//   GET /api/sermons          -> { sermons: [...], current: "2026-11-15" }
//   GET /api/sermons/current  -> the current sermon, with its markdown and prev/next
//   GET /api/sermons/:slug    -> one sermon, with its markdown and prev/next in its series
import { overview, getMarkdown } from './lib/data.mjs';
import { json, REVALIDATE } from './lib/http.mjs';
import { neighbors } from '../../src/lib/series.js';

const pub = ({ source, ...entry }) => entry; // eslint-disable-line no-unused-vars

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const rest = new URL(req.url).pathname.replace(/^\/api\/sermons\/?/, '');
  const slug = decodeURIComponent(rest.split('/')[0] || '');
  const { live, series } = await overview();

  if (!slug) {
    return json({ sermons: live.map(pub), current: live[0] ? live[0].slug : null }, 200, REVALIDATE);
  }

  const entry = slug === 'current' ? live[0] : live.find((e) => e.slug === slug);
  if (!entry) return json({ error: 'not_found' }, 404);
  const markdown = await getMarkdown(entry);
  if (markdown == null) return json({ error: 'not_found' }, 404);

  const s = series.find((x) => x.slug === entry.seriesSlug);
  return json({
    ...pub(entry),
    seriesName: s ? s.name : entry.series,
    markdown,
    isCurrent: live[0] && live[0].slug === entry.slug,
    nav: neighbors(live, entry.slug)
  }, 200, REVALIDATE);
};

export const config = { path: ['/api/sermons', '/api/sermons/*'] };
