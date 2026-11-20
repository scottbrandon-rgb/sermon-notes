// Password-protected publishing API. Every request needs "Authorization: Bearer <ADMIN_PASSWORD>".
//   GET    /api/admin/session               check the password
//   GET    /api/admin/sermons               all sermons, live and scheduled
//   GET    /api/admin/sermons/:slug         one sermon with markdown (for previewing scheduled ones)
//   POST   /api/admin/sermons               { markdown, goLive } publish or update
//   DELETE /api/admin/sermons/:slug         unpublish
//   POST   /api/admin/series-image          { series, dataUrl } set a series header image
import { allEntries, isLive, getMarkdown, saveSermon, deleteSermon, saveSeriesImage } from './lib/data.mjs';
import { json, requireAdmin } from './lib/http.mjs';
import { slugify } from '../../src/lib/parse.js';

const MAX_MARKDOWN = 300 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;

const withStatus = ({ source, ...e }) => ({ ...e, source, status: isLive(e) ? 'live' : 'scheduled' });

export default async (req) => {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
  const [resource, id] = path;

  try {
    if (resource === 'session' && req.method === 'GET') return json({ ok: true });

    if (resource === 'sermons') {
      if (req.method === 'GET' && !id) {
        return json({ sermons: (await allEntries()).map(withStatus) });
      }
      if (req.method === 'GET' && id) {
        const entry = (await allEntries()).find((e) => e.slug === decodeURIComponent(id));
        if (!entry) return json({ error: 'not_found' }, 404);
        return json({ ...withStatus(entry), markdown: await getMarkdown(entry) });
      }
      if (req.method === 'POST' && !id) {
        const body = await req.json().catch(() => ({}));
        const markdown = typeof body.markdown === 'string' ? body.markdown : '';
        if (!markdown.trim()) return json({ error: 'invalid', errors: ['The file is empty.'] }, 400);
        if (markdown.length > MAX_MARKDOWN) return json({ error: 'invalid', errors: ['That file is too large to be sermon notes.'] }, 400);
        const result = await saveSermon(markdown, body.goLive);
        if (result.errors) return json({ error: 'invalid', errors: result.errors, warnings: result.warnings }, 400);
        return json({ sermon: withStatus(result.entry), warnings: result.warnings });
      }
      if (req.method === 'DELETE' && id) {
        await deleteSermon(decodeURIComponent(id));
        return json({ ok: true });
      }
    }

    if (resource === 'series-image' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const slug = slugify(body.series);
      const m = String(body.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!slug || !m) return json({ error: 'invalid', errors: ['Send a series name and a JPEG, PNG or WebP image.'] }, 400);
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > MAX_IMAGE) return json({ error: 'invalid', errors: ['That image is too large (3 MB limit).'] }, 400);
      await saveSeriesImage(slug, bytes, m[1]);
      return json({ ok: true, seriesSlug: slug });
    }

    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('admin error', err);
    return json({ error: 'server', message: 'Something went wrong saving that. Try again.' }, 500);
  }
};

export const config = { path: '/api/admin/*' };
