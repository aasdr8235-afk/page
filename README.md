
<<<<<<< HEAD
=======
Personal portfolio covering security projects, technical writing, and lab notes. Built with HTML, CSS, and JavaScript. Includes light/dark themes, a loading screen, and local archive search.

## Build and preview

Node.js 22 or newer is required. The production build needs no installed dependencies.

```sh
npm clean-install
npm run build
npm run preview
```

Open the local URL printed by Wrangler. Only the contents of `dist/` are published: pages, scripts, styles, images, fonts, font licenses, and hosting configuration.

## Cloudflare Workers

Connect this repository to a Cloudflare Workers project with these build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Worker name | `mouhib-technical-archive` |
| Static assets directory | `./dist` (set in `wrangler.jsonc`) |
| Root directory | Repository root |

Allow dependency installation, including devDependencies: Wrangler is installed locally and locked in `package-lock.json`. Remove the previous `SKIP_DEPENDENCY_INSTALL=1` setting if present. The Node.js version is set in `.node-version`.

For a local deployment, authenticate Wrangler with your Cloudflare account, then run:

```sh
npm clean-install
npm run build
npm run deploy -- --dry-run
npm run deploy
```

The deployment sequence is source files → build → `dist/` → Wrangler → Cloudflare. Both deployment and preview require the build first. `dist/` remains ignored by Git because the Cloudflare build generates it before deployment. The repository root is the build working directory, never the upload directory. Do not override the assets directory with `--assets .`.

The Worker name in Cloudflare must match `name` in `wrangler.jsonc`; update that name if deploying to an existing Worker with a different name. Manage `mouhibmahadbi.online` through the Worker's custom domain settings. The site's canonical URL, social metadata, sitemap, and robots file already use this domain.

Cloudflare handles HTTPS and asset caching. `_headers` adds response headers; `404.html` handles missing pages. No server, API key, or backend is required.

Reference: [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

## Checks

Development checks require Chromium and the dependencies in the lockfile:

```sh
npm ci
npm run build
# Keep this server running in another terminal for the checks below:
# python3 -m http.server 4173 --directory dist --bind 127.0.0.1
npm test
npm run test:assistant
npm run test:lighthouse
npm run test:links
```

`CHROME_PATH` can override `/usr/bin/chromium`; `BASE_URL` can override `http://127.0.0.1:4173`. Reports and screenshots go to the ignored `test-results/` folder. The external link check requires internet access.

## Editing

- Update page content in `index.html`, design tokens in `styles.css`, and interactions in `script.js`.
- `archive-search.js` searches the page locally and loads when visitors open the search panel.
- `logo.png` is the transparent logo shared by the header and loading screen.
- Images, platform marks, and self-hosted fonts live in `assets/`. Keep the included font licenses.
- Google Analytics uses measurement ID `G-RPMN5MJ42C`. Update or remove the analytics block in `script.js` if needed.
- `node_modules/`, `dist/`, and test output are excluded from Git. Only `dist/` is deployed.
>>>>>>> bbe5322 (Fixing some bugs)
