# SSKZM OBA Careers & Mentors (website)

The public website for **careers.sskzmoba.org**: the careers bulletin, the
"Share a notice" page and the Mentors circle for OBA life members.

Plain HTML, CSS and JavaScript. No build step, no frameworks, so office staff
and future ECs can edit it in the GitHub web editor.

The data and logic live in the private backend repo
`sskzmoba/sskzm-oba-careers-bulletin` (Google Apps Script). This site only
displays what the backend returns.

## Files

| File | What it is |
|---|---|
| `index.html` | The bulletin: open posts, closing date first, filters and search. |
| `share.html` | Share a notice: photo, PDF or typed text. |
| `mentors.html` | Mentors: login with an emailed code, find a mentor, inbox, profile. |
| `archive.html` | Past posts by month. |
| `privacy.html` | Plain-language privacy notice (DPDP Act 2023). |
| `assets/js/config.js` | **The settings file**: backend URL, help email, life-membership link. |
| `assets/js/common.js` | Shared helpers (API calls, safe rendering, text size). |
| `assets/js/bulletin.js`, `share.js`, `mentors.js` | Page logic. |
| `assets/css/site.css` | All styles. Colours at the top come from the OBA crest. |
| `assets/fonts/` | Archivo and Atkinson Hyperlegible, self-hosted (SIL Open Font Licence). |
| `assets/img/` | OBA crest and the school building photo. |

## Common edits

- **Change the help email or the life-membership link:** edit `assets/js/config.js`.
- **Change wording:** edit the text in the `.html` files directly.
- **Backend moved to a new deployment:** paste the new `/exec` URL into `API_URL` in `assets/js/config.js`.

## Publishing

GitHub Pages serves the `main` branch from the repo root. Changes go live a
minute or two after they are merged into `main`.

Custom domain: add a CNAME record `careers` to `sskzmoba.github.io` in the OBA's
ResellerClub DNS, then set `careers.sskzmoba.org` under Settings > Pages and
enable "Enforce HTTPS".

## Safety rules for anyone editing

- Never put content from the backend into the page with `innerHTML`. Use the
  `el()` helper in `common.js`, which uses plain text only.
- Only plain `http`/`https` links may be made clickable (`OBA.safeUrl`).
- Never publish phone numbers, UPI IDs or member emails on any page.
- Check the page at phone width (375 px) before merging.
