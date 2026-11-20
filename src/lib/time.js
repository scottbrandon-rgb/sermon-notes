// Church time is Central (Harrison, AR). Sermons go live at 5:00 AM Central on
// their date unless the admin picks something else.

export const CHURCH_TZ = 'America/Chicago';
export const DEFAULT_GO_LIVE_HOUR = 5;

// Offset (ms) of Central time from UTC at the instant `ts` (negative in the US).
function tzOffsetMs(ts) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ts));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Central wall-clock time -> UTC Date. */
export function centralToUtc(y, mo, d, hh = 0, mm = 0) {
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  let guess = wall - tzOffsetMs(wall);
  guess = wall - tzOffsetMs(guess); // second pass settles DST edges
  return new Date(guess);
}

/** "2026-11-15" -> Date for 5:00 AM Central that day. */
export function defaultGoLive(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return centralToUtc(y, mo, d, DEFAULT_GO_LIVE_HOUR, 0);
}

/** "2026-11-15T05:00" (datetime-local value, read as Central) -> Date, or null. */
export function parseCentralLocal(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return centralToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

/** Date -> "2026-11-15T05:00" in Central, for a datetime-local input. */
export function toCentralLocal(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/** "2026-11-15" -> "Sunday, November 15, 2026". */
export function longDate(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  if (isNaN(dt)) return dateStr || '';
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function shortDate(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  if (isNaN(dt)) return dateStr || '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
