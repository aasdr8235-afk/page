const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: lighthouse } = await import(pathToFileURL(require.resolve('lighthouse')).href);
  const { launch } = await import(pathToFileURL(require.resolve('chrome-launcher')).href);
  const chrome = await launch({ chromePath: process.env.CHROME_PATH || '/usr/bin/chromium', chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const result = await lighthouse(process.env.BASE_URL || 'http://127.0.0.1:4173', {
      port: chrome.port, output: ['json', 'html'], logLevel: 'error', onlyCategories: ['performance','accessibility','best-practices','seo']
    });
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/lighthouse-mobile.json', result.report[0]);
    fs.writeFileSync('test-results/lighthouse-mobile.html', result.report[1]);
    console.log(JSON.stringify({ scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key, Math.round(value.score*100)])), metrics: Object.fromEntries(['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time','speed-index'].map(key=>[key,result.lhr.audits[key].displayValue])), failed: Object.entries(result.lhr.audits).filter(([,v])=>v.score!==null && v.score<.9).map(([key,v])=>({key,title:v.title,score:v.score,details:v.details})) },null,2));
  } finally { await chrome.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1});
