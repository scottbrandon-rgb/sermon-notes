// Public, read-only. Only sermons whose go-live time has passed are returned.
//   GET /api/sermons          -> { sermons: [...], current: "2026-11-15" }
//   GET /api/sermons/current  -> the current sermon, with its markdown
//   GET /api/sermons/:slug    -> one sermon, with its markdown
import { allEntries, isLive, getMarkdown } from './lib/data.mjs';
import { json, REVALIDATE } from './lib/http.mjs';

const pub = ({ source, ...entry }) => entry; // eslint-disable-line no-unused-vars

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const rest = new URL(req.url).pathname.replace(/^\/api\/sermons\/?/, '');
  const slug = decodeURIComponent(rest.split('/')[0] || '');
  const live = (await allEntries()).filter((e) => isLive(e));

  if (!slug) {
    return json({ sermons: live.map(pub), current: live[0] ? live[0].slug : null }, 200, REVALIDATE);
  }

  const entry = slug === 'current' ? live[0] : live.find((e) => e.slug === slug);
  if (!entry) return json({ error: 'not_found' }, 404);
  const markdown = await getMarkdown(entry);
  if (markdown == null) return json({ error: 'not_found' }, 404);
  return json({ ...pub(entry), markdown, isCurrent: live[0] && live[0].slug === entry.slug }, 200, REVALIDATE);
};

export const config = { path: ['/api/sermons', '/api/sermons/*'] };
