// Scripture references and ref.ly links.
// ref.ly redirects to the passage in Logos/Biblia, e.g. https://ref.ly/Jn3.16

const SCRIPTURE_RE =
  /^(?:[1-3]\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+(?::\d+(?:[-–]\d+)?(?:,\s?\d+(?:[-–]\d+)?)*)?$/;

/** True when text looks like a Bible reference, e.g. "1 Corinthians 6:9-11". */
export function isScripture(text) {
  return SCRIPTURE_RE.test(String(text).trim());
}

/** Normalize dashes and whitespace: "Romans 1:24–32" -> "Romans 1:24-32". */
export function refKey(ref) {
  return String(ref).replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Display form with a true en dash between verse numbers. */
export function refLabel(ref) {
  return refKey(ref).replace(/(\d)-(\d)/g, '$1–$2');
}

/**
 * ref.ly link for a reference.
 *   "John 3:16"          -> https://ref.ly/John3.16
 *   "1 Corinthians 6:9-11" -> https://ref.ly/1%20Corinthians6.9-11
 *   "Psalm 23"           -> https://ref.ly/Psalm23
 */
export function refHref(ref) {
  const key = refKey(ref);
  const m = key.match(/^(.*?)\s+(\d+(?::[\d,\-: ]+)?)$/);
  if (!m) return 'https://ref.ly/' + encodeURIComponent(key);
  const book = m[1];
  const tail = m[2].replace(/\s+/g, '').replace(/:/g, '.');
  return 'https://ref.ly/' + encodeURIComponent(book) + tail;
}
