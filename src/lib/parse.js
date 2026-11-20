// Sermon Notes markdown -> structured sermon.
// Format is defined by "Sermon Notes Template" in the Obsidian vault.

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function smart(s) {
  return s.replace(/'/g, '’').replace(/(^|[\s(\[—])"/g, '$1“').replace(/"/g, '”');
}

// "**bold**", "*italic*", "__blank__" -> tokens. Blanks get ids b0, b1, ...
function tokenize(raw, blanks) {
  const out = [];
  raw.split(/(\*\*[\s\S]+?\*\*)/).forEach((part) => {
    if (!part) return;
    const bold = part.length > 4 && part.startsWith('**') && part.endsWith('**');
    const inner = bold ? part.slice(2, -2) : part;
    inner.split(/(__[^_]+?__)/).forEach((p) => {
      if (!p) return;
      if (/^__[^_]+__$/.test(p)) {
        const tok = { type: 'blank', text: p.slice(2, -2), id: 'b' + blanks.length };
        blanks.push({ id: tok.id, ans: tok.text });
        out.push(tok);
        return;
      }
      if (bold) { out.push({ type: 'em', text: smart(p) }); return; }
      p.split(/(\*[^*\s][^*]*\*)/).forEach((q) => {
        if (!q) return;
        if (/^\*[^*]+\*$/.test(q)) out.push({ type: 'it', text: smart(q.slice(1, -1)) });
        else out.push({ type: 'text', text: smart(q) });
      });
    });
  });
  return out;
}

function cleanTitle(t) {
  return String(t || '').replace(/\s*\((?:app|sermon)\s+notes\)\s*$/i, '').trim();
}

/**
 * Parse a sermon notes markdown file.
 * @returns {{fm: Object, title: string, refs: string[], sections: Object[],
 *            blanks: {id:string, ans:string}[], reminder: ?{text:string, href:string, label:string}}}
 */
export function parseSermon(md) {
  const blanks = [];
  const doc = { fm: {}, title: '', refs: [], sections: [], blanks, reminder: null };

  let body = String(md || '')
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/^\s+/, '');

  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    fm[1].split('\n').forEach((l) => {
      const m = l.match(/^(\w+):\s*"?(.*?)"?\s*$/);
      if (m) doc.fm[m[1]] = m[2];
    });
    body = body.slice(fm[0].length);
  }

  let cur = null;
  const ensure = () => {
    if (!cur) {
      cur = { n: '', raw: '', isPoint: false, kicker: '', items: [], hasNote: false, tokens: [] };
      doc.sections.push(cur);
    }
    return cur;
  };

  // A scripture block can carry its passage: the quote lines right under "> [!scripture] Ref".
  let scr = null;
  const finishScr = () => {
    if (scr && scr.text) {
      scr.item.text = scr.text;
      scr.item.tokens = tokenize(scr.text, blanks); // so the passage can hold bold, italics, and blanks
    }
    scr = null;
  };

  body.split('\n').forEach((line) => {
    let t = line.trim();
    if (t.includes('{note}')) {
      if (cur) cur.hasNote = true;
      t = t.replace(/<img[^>]*>/g, '').replace('{note}', '').trim();
    }
    if (scr) {
      if (/^>/.test(t) && !/^>\s*\[!/.test(t)) {
        const piece = t.replace(/^>\s?/, '').replace(/<[^>]+>/g, '').trim();
        if (piece) scr.text += (scr.text ? ' ' : '') + piece;
        return;
      }
      finishScr(); // a blank line, a divider, or any other line ends the passage
    }
    if (!t || /^-{3,}$/.test(t)) return;
    let m;

    if (!doc.sections.length && !doc.title && (m = t.match(/^\*\*(.+)\*\*$/))) { doc.title = m[1]; return; }
    if (!doc.sections.length && !doc.refs.length && (m = t.match(/^\*([^*].*)\*$/))) {
      doc.refs = m[1].split(/\s*,\s*/).filter(Boolean);
      return;
    }

    if ((m = t.match(/^#{1,3}\s+(.*)$/))) {
      const h = m[1];
      const num = h.match(/^(\d+)\.\s+(.*)$/);
      cur = { n: num ? num[1] : '', raw: num ? num[2] : h, isPoint: !!num, kicker: '', items: [], hasNote: false };
      if (num) {
        // Optional label before the heading: "Language: ..." or "Why should we care? ..."
        const k = cur.raw.match(/^([^_*?:]{2,40}?)([?:])\s+(.+)$/);
        if (k) { cur.kicker = k[1] + (k[2] === '?' ? '?' : ''); cur.raw = k[3]; }
      }
      cur.tokens = tokenize(cur.raw, blanks);
      doc.sections.push(cur);
      return;
    }

    if ((m = t.match(/^>\s*\[!scripture\]\s*(.+)$/i))) {
      const item = { type: 'scripture', ref: m[1].trim(), text: '', tokens: [] };
      ensure().items.push(item);
      scr = { item, text: '' };
      return;
    }
    if (/^>/.test(t)) return;

    const text = t.replace(/^[-*]\s+/, '');
    const item = { type: 'line', raw: text, cite: '' };
    const c = text.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
    if (c) { item.raw = c[1]; item.cite = c[2].trim(); }
    item.tokens = tokenize(item.raw, blanks);
    item.citeTokens = item.cite ? tokenize(item.cite, []) : []; // citations never hold blanks
    ensure().items.push(item);
  });
  finishScr();

  doc.title = doc.title || cleanTitle(doc.fm.title);

  if (doc.fm.reminder) {
    const href = /^https?:\/\//i.test(doc.fm.reminder_link || '') ? doc.fm.reminder_link : '';
    doc.reminder = {
      text: smart(doc.fm.reminder),
      href,
      label: href ? (doc.fm.reminder_label || 'Learn more') : ''
    };
  }
  return doc;
}

/** Problems an admin should fix (errors) or know about (warnings) before publishing. */
export function validateSermon(doc) {
  const errors = [];
  const warnings = [];
  if (!doc.fm.date || !/^\d{4}-\d{2}-\d{2}$/.test(doc.fm.date) || isNaN(new Date(doc.fm.date + 'T12:00:00'))) {
    errors.push('The front matter needs a date written as YYYY-MM-DD (for example 2026-11-22).');
  }
  if (!doc.fm.series) errors.push('The front matter needs a series name.');
  else if (!slugify(doc.fm.series)) errors.push('The series name needs at least one letter or number.');
  if (!doc.title) errors.push('Add the sermon title as a bold line right after the front matter: **Sermon Title**');
  if (!doc.sections.length) errors.push('No points found. Start each main point with "# 1. ", "# 2. ", and so on.');
  if (!doc.refs.length) warnings.push('No scripture line found. Add an italic line under the title: *Book 1:1-10, Book 2:1-5*');
  if (!doc.blanks.length) warnings.push('No fill-in-the-blank words found. Wrap a word in double underscores: __word__');
  if (doc.fm.reminder_link && !/^https?:\/\//i.test(doc.fm.reminder_link)) {
    warnings.push('reminder_link must start with http:// or https:// to become a button.');
  }
  if (doc.fm.reminder_link && !doc.fm.reminder) {
    warnings.push('reminder_link is set but reminder is empty, so no reminder box will show.');
  }
  return { errors, warnings };
}

/**
 * Return the markdown with its front matter `series:` set to `name`
 * (replacing the line, or adding one). Used to file a sermon under an existing series.
 */
export function withSeries(md, name) {
  const clean = String(name).replace(/["\r\n]/g, '').trim();
  const value = /[:#]/.test(clean) ? `"${clean}"` : clean;
  const m = String(md).match(/^(﻿?\s*---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) return md;
  const body = /^series:.*$/m.test(m[2])
    ? m[2].replace(/^series:.*$/m, `series: ${value}`)
    : `${m[2]}\nseries: ${value}`;
  return m[1] + body + m[3] + String(md).slice(m[0].length);
}

/** Small summary used for lists and the series pages. */
export function sermonMeta(doc) {
  return {
    slug: doc.fm.date,
    date: doc.fm.date,
    series: doc.fm.series,
    seriesSlug: slugify(doc.fm.series),
    title: doc.title,
    refs: doc.refs,
    blankCount: doc.blanks.length
  };
}
