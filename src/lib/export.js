// Turn a sermon plus a person's progress into plain text, for sharing and PDF.
import { refLabel } from './ref.js';
import { longDate } from './time.js';

export const CHURCH_NAME = 'Harrison Faith Church';

function plain(tokens, state) {
  return tokens
    .map((t) => (t.type === 'blank' ? (state.status[t.id] ? t.text : '______') : t.text))
    .join('');
}

/** Structured copy of the notes, used by both the text and PDF exports. */
export function exportModel(doc, state) {
  return {
    title: doc.title,
    series: doc.fm.series || '',
    date: doc.fm.date ? longDate(doc.fm.date) : '',
    refs: doc.refs.map(refLabel),
    church: CHURCH_NAME,
    sections: doc.sections.map((sec, si) => ({
      isPoint: sec.isPoint,
      n: sec.n,
      kicker: sec.kicker,
      heading: plain(sec.tokens, state),
      scriptures: sec.items.filter((i) => i.type === 'scripture').map((i) => refLabel(i.ref)),
      lines: sec.items
        .filter((i) => i.type === 'line')
        .map((i) => ({
          text: plain(i.tokens, state),
          cite: i.cite ? i.citeTokens.map((t) => t.text).join('') : ''
        })),
      note: String((state.notes && state.notes[si]) || '').trim(),
      hasNote: sec.hasNote
    }))
  };
}

export function toText(model) {
  const L = [
    model.title,
    [model.series, model.date].filter(Boolean).join(' · '),
    model.refs.join(' · '),
    ''
  ];
  model.sections.forEach((s) => {
    L.push(s.isPoint ? `${s.n}. ${s.kicker ? s.kicker + ' ' : ''}${s.heading}` : s.heading.toUpperCase());
    s.scriptures.forEach((r) => L.push('   ' + r));
    s.lines.forEach((l) => L.push('   • ' + l.text + (l.cite ? ` (${l.cite})` : '')));
    if (s.note) L.push('   My notes: ' + s.note);
    L.push('');
  });
  L.push(model.church);
  return L.join('\n');
}

export function fileSafe(s) {
  return String(s || 'sermon-notes').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
