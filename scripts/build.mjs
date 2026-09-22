import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const files = [
  'index.html', '404.html', 'styles.css', 'script.js', 'archive-search.js',
  'logo.png', 'robots.txt', 'sitemap.xml', '_headers'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), {
  recursive: true,
  filter: source => !source.endsWith('.md')
});
console.log('Site built in dist/');
