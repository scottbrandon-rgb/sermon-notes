# Sermon Notes

Fill-in-the-blank sermon notes for Harrison Faith Church. People follow along on their phones, fill in the blanks, take notes, and send everything to themselves afterward.

- **One link** (`/`) always shows the current sermon.
- **Notes stay on the person's phone.** They autosave in the browser (`localStorage`), so closing the tab doesn't lose anything. There are no accounts and no database of attendee notes.
- **Export:** Share (Messages, Mail, Apple Notes, Keep, and more), Email, Text, Copy, and PDF.
- **Scripture** links go to [ref.ly](https://ref.ly) (Logos/Biblia).
- **You publish** by uploading a Markdown file at `/admin`.

**Live site:** https://hfc-sermon-notes.netlify.app (Netlify team Harrison Faith Church; deploys automatically from `main`).

## Publishing a sermon each week

1. Write the sermon in Obsidian with **Sermon Notes Template** (`_templates`). The file is the "(App Notes)" version.
2. Fill in the front matter: `series`, `title`, `date`, and optionally `reminder`, `reminder_link`, `reminder_label`.
3. Go to `/admin`, enter the password, and drop the file in.
4. Check the preview, choose when it goes live, and press **Publish**.

By default a sermon goes live at **5:00 AM Central on its date**, so you can upload Thursday and it switches on Sunday morning. Pick **Publish now** to switch immediately. Uploading a file with the same date replaces that sermon.

The first time you use a new series, the admin page lets you upload that series' header image (16:9 works best). It's shared by every sermon in the series.

### The file format

See the guide block at the top of the template. In short: `# 1. Label: Point with a __blank__.`, subpoints as `- `, `__word__` for blanks, `(Reference)` at the end of a line for a small citation, `> [!scripture] Romans 1:24-32` for a scripture card, `{note}` at the end of a section for a note box, and a heading with no number (`# Altar`) for a "Respond" section.

## Routes

| Path | What it is |
| --- | --- |
| `/` | The current sermon (the one link to share) |
| `/sermons/2026-11-15` | A specific sermon, permanent link |
| `/archive` | Past sermons grouped by series, with the notes this device has |
| `/admin` | Password-protected publishing |

The archive page is built but its link is hidden. Set `SHOW_ARCHIVE_LINK = true` in `src/config.js` when you're ready to share it.

## How it's built

- Static front end: Vite, plain JavaScript, no framework. PDF code (`jspdf`) loads only when someone taps PDF.
- Netlify Functions in `netlify/functions`: `sermons` (public reads), `admin` (password-protected publishing), `series-image`.
- Sermons published in `/admin` are stored in **Netlify Blobs**. Sermons in `content/sermons/*.md` ship with the site and are bundled at build time (`scripts/build-seed.mjs`). A published sermon overrides a bundled one with the same date.
- Notes parsing lives in `src/lib/parse.js` and is shared by the page, the admin preview, and the functions.

## Setup

```bash
npm install
cp .env.example .env     # then set ADMIN_PASSWORD
npm run dev              # http://localhost:8888 (Netlify dev: site + functions)
npm test                 # parser, ref.ly links, go-live time, export text
```

### Deploying on Netlify

1. Import this repo as a new site (build command and publish directory come from `netlify.toml`).
2. Add an environment variable **`ADMIN_PASSWORD`** (Site configuration > Environment variables). This is the one shared password for `/admin`.
3. Deploy. There is no separate staging site.

The repo is public, so never commit secrets. The password lives only in Netlify's environment settings.

## Later

Cross-device notes would need accounts and a database. The notes are keyed by sermon date (`sn:v1:<date>`) so a sync layer can be added without changing the page.
