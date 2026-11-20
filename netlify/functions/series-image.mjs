// Public. GET /api/series-image/:seriesSlug -> the series header image uploaded in /admin.
// 404 when none was uploaded; the page then falls back to /series/<slug>.jpg or text only.
import { getSeriesImage } from './lib/data.mjs';

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const slug = decodeURIComponent(new URL(req.url).pathname.replace(/^\/api\/series-image\//, '')).replace(/[^a-z0-9-]/gi, '');
  if (!slug) return new Response('Not found', { status: 404 });
  const img = await getSeriesImage(slug);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(img.data, {
    headers: { 'Content-Type': img.contentType, 'Cache-Control': 'public, max-age=300' }
  });
};

export const config = { path: '/api/series-image/*' };
