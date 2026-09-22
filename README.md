# Mouhib Mahadbi — Technical Archive

Personal portfolio covering security projects, technical writing, and lab notes. Built with HTML, CSS, and JavaScript. Includes light/dark themes, a loading screen, and local archive search.

## Build and preview

Node.js 22 or newer is required. The production build needs no installed dependencies.

```sh
npm run build
python3 -m http.server 4173 --directory dist --bind 127.0.0.1
```

Open http://127.0.0.1:4173. Only the contents of `dist/` are published: pages, scripts, styles, images, fonts, font licenses, and hosting configuration.

## Cloudflare Pages

Push this repository to GitHub, then import it in **Cloudflare → Workers & Pages → Create application → Pages**.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Environment variable | `SKIP_DEPENDENCY_INSTALL=1` |

The environment variable skips development-only test dependencies during deployment. The Node.js version is set in `.node-version`.

After deployment, add `mouhibmahadbi.online` under the Pages project's **Custom domains**. For this apex domain, add the domain to Cloudflare and use its assigned nameservers. Configure the domain through Pages before changing DNS records. The site's canonical URL, social metadata, sitemap, and robots file already use this domain.

Cloudflare handles HTTPS and asset caching. `_headers` adds response headers; `404.html` handles missing pages. No server, API key, or backend is required.

References: [static HTML deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [build settings](https://developers.cloudflare.com/pages/configuration/build-image/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Checks

Development checks require Chromium and the dependencies in the lockfile:

```sh
npm ci
npm run build
# Keep the preview server running in another terminal.
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
