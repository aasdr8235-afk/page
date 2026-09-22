const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.BASE_URL || 'http://127.0.0.1:4173';
const evidence = path.resolve('test-results');
fs.mkdirSync(evidence, { recursive: true });
const results = { viewports: [], scenarios: [], unexpectedErrors: [] };
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function newContext(options = {}) {
  const context = await browser.newContext(options);
  // Suppress real analytics events during automated interaction tests only.
  await context.route(/googletagmanager\.com|google-analytics\.com/, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await context.addInitScript(() => {
    window.__audit = { frames: 0, pointerListeners: 0, shifts: [], interactions: [] };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__audit.shifts.push(entry.value); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__audit.interactions.push(entry.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { window.__audit.frames++; return raf(callback); };
    const listen = document.addEventListener.bind(document);
    document.addEventListener = (type, ...args) => { if (type === 'pointermove') window.__audit.pointerListeners++; return listen(type, ...args); };
  });
  return context;
}
function errors(page, name) {
  page.on('pageerror', error => results.unexpectedErrors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') results.unexpectedErrors.push(`${name}: ${message.text()}`); });
}
async function settled(page) {
  await page.waitForFunction(() => document.querySelector('.archive-loader').hidden);
  await page.evaluate(() => document.fonts.ready);
}
async function scrollAll(page) {
  for (const section of await page.locator('main > section').all()) {
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
  }
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(550);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}
async function checkOverflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return { viewport: width, page: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('main *,header *,footer *')].filter(el => {
      if (!el.getClientRects().length) return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > width + 1 || r.left < -1);
    }).map(el => `${el.tagName}.${el.className}`) };
  });
}
async function scenario(name, fn) {
  await fn(); results.scenarios.push({ name, passed: true }); console.log(`PASS ${name}`);
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const [width, height] of (process.env.SKIP_VIEWPORTS ? [] : [[320,667],[375,667],[390,844],[393,852],[412,915],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080]])) {
    const context = await newContext({ viewport: { width, height }, hasTouch: width <= 1024, isMobile: width < 600, deviceScaleFactor: 1 });
    const page = await context.newPage(); errors(page, `${width}x${height}`);
    await page.goto(root); await settled(page); await scrollAll(page);
    const overflow = await checkOverflow(page);
    assert.equal(overflow.page, overflow.viewport, JSON.stringify(overflow)); assert.deepEqual(overflow.offenders, []);
    const images = await page.locator('img').evaluateAll(images => images.filter(im => !im.complete || !im.naturalWidth).map(im => im.src));
    assert.deepEqual(images, [], 'All real images loaded');
    const tinyTargets = await page.locator('a,button').evaluateAll(elements => elements.filter(el => {
      if (getComputedStyle(el).visibility === 'hidden' || el.closest('[inert]')) return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43 || r.width < 43);
    }).map(el => ({ text: el.textContent.trim(), width: el.offsetWidth, height: el.offsetHeight })));
    assert.deepEqual(tinyTargets, [], '44px targets');
    if (width <= 800) {
      for (const id of ['about','exploring','projects','writing','labs','contact']) {
        await page.locator('.nav-toggle').click();
        assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'true');
        await page.locator(`.nav-link[href="#${id}"]`).click();
        await page.waitForFunction(id => location.hash === '#' + id, id);
        assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('.nav-list').evaluate(el => el.inert), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.locator('.nav-toggle').click(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'nav-toggle');
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(550);
    if (width <= 1024) {
      assert.equal(await page.evaluate(() => window.__audit.pointerListeners), 0);
      assert.equal(await page.locator('.cursor-ring').isVisible(), false);
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    await page.screenshot({ path: path.join(evidence, `viewport-${width}x${height}.jpg`), type: 'jpeg', quality: 85, fullPage: true });
    results.viewports.push({ width, height, overflow: false, axeViolations: axe.violations.length, tinyTargets, allImagesLoaded: true, mobileNavigation: width <= 800 ? 'passed' : 'desktop' });
    console.log(`PASS viewport ${width}x${height}`);
    await context.close();
  }
  await scenario('Full-screen loader counts smoothly to 100 on every visit', async () => {
    const c = await newContext();
    await c.route('**/assets/profile*.webp', async route => { await delay(650); await route.continue(); });
    const p = await c.newPage(); errors(p, 'loader'); await p.goto(root, { waitUntil: 'domcontentloaded' });
    assert.equal(await p.locator('.archive-loader').isVisible(), true);
    await p.evaluate(() => {
      window.__loaderCounts = [];
      new MutationObserver(() => window.__loaderCounts.push(parseInt(document.querySelector('.loader-count').textContent, 10)))
        .observe(document.querySelector('.loader-count'), { childList: true });
    });
    await p.waitForFunction(() => parseInt(document.querySelector('.loader-count').textContent, 10) > 1);
    const progress = await p.locator('.loader-progress').evaluate(el => el.style.transform);
    assert.ok(progress.includes('scaleX('));
    const percentage = parseInt(await p.locator('.loader-count').textContent(), 10);
    assert.ok(percentage >= 1 && percentage < 100, 'Percentage reflects pending files');
    await p.screenshot({ path: path.join(evidence, 'loader.png') });
    await settled(p);
    assert.equal(await p.locator('.loader-count').textContent(), '100%');
    const counts = await p.evaluate(() => window.__loaderCounts);
    assert.ok(counts.some(value => value > 1 && value % 25 !== 0), 'Counter animates between readiness milestones');
    assert.ok(counts.every((value, i) => !i || value >= counts[i - 1]), 'Counter never goes backwards');
    const duration = await p.evaluate(() => performance.getEntriesByName('archive-ready')[0].startTime - window.archiveStartup.started);
    assert.ok(duration < 1550); results.loaderDurationMs = Math.round(duration);
    await p.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await p.locator('.archive-loader').isVisible(), true);
    await settled(p);
    assert.equal(await p.locator('.loader-count').textContent(), '100%');
    await c.unroute('**/assets/profile*.webp');
    await p.reload();
    assert.equal(await p.locator('.archive-loader').isVisible(), true, 'Cached visits still show the entrance');
    await settled(p);
    assert.equal(await p.locator('.loader-count').textContent(), '100%');
    await c.close();
  });
  await scenario('Color modes follow the system, persist a choice, and remain accessible', async () => {
    const c = await newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
    const p = await c.newPage(); errors(p, 'themes'); await p.goto(root); await settled(p);
    const theme = () => p.locator('html').getAttribute('data-theme');
    assert.equal(await theme(), 'light');
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await p.getByRole('button', { name: 'Switch to light mode' }).focus();
    await p.keyboard.press('Enter');
    assert.equal(await theme(), 'light');
    await p.reload(); await settled(p);
    assert.equal(await theme(), 'light', 'Explicit choice survives reload over dark system preference');
    await p.emulateMedia({ colorScheme: 'light' });
    await p.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await theme(), 'light', 'System changes preserve explicit choice');
    const second = await c.newPage(); await second.goto(root); await settled(second);
    await p.getByRole('button', { name: 'Switch to dark mode' }).click();
    await second.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await second.close();
    for (const mode of ['dark', 'light']) {
      if (await theme() !== mode) await p.locator('.theme-toggle').click();
      assert.equal(await p.locator('meta[name="theme-color"]').getAttribute('content'), mode === 'dark' ? '#111210' : '#fafaf7');
      for (const width of [320, 390, 801, 820, 1440]) {
        await p.setViewportSize({ width, height: 900 });
        const o = await checkOverflow(p); assert.equal(o.page, o.viewport); assert.deepEqual(o.offenders, []);
        assert.ok(await p.locator('.site-header').evaluate(el => el.offsetHeight) <= 89, 'Header stays on one row');
      }
      await p.locator('.assistant-launcher').click();
      const axe = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      await p.locator('.assistant-close').click();
      await p.screenshot({ path: path.join(evidence, `theme-${mode}.png`) });
    }
    await c.close();
  });
  await scenario('Every internal anchor retains native same-tab navigation', async () => {
    const c = await newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await c.newPage();errors(p,'anchors');await p.goto(root);
    const anchors = await p.locator('a[href^="#"]').evaluateAll(links => links.map(link => ({ href: link.getAttribute('href'), target: link.target, valid: !!document.querySelector(link.getAttribute('href')) })));
    assert.ok(anchors.every(a => a.valid && !a.target));
    for (let i = 0; i < await p.locator('a[href^="#"]').count(); i++) {
      const link = p.locator('a[href^="#"]').nth(i);
      if (await link.getAttribute('class') === 'skip-link') { await p.keyboard.press('Tab'); await link.focus(); }
      await link.click(); const href = await link.getAttribute('href'); assert.equal(new URL(p.url()).hash, href);
      assert.equal(c.pages().length, 1);
      const top = await p.locator(href).evaluate(el => el.getBoundingClientRect().top);
      if (!['#hero','#main'].includes(href)) assert.ok(top >= 70, `${href} under sticky header: ${top}`);
    }
    await c.close();
  });
  await scenario('All external links open the exact declared URL in an isolated tab', async () => {
    const c = await newContext({ viewport: { width: 1440, height: 900 } });
    await c.route(/^https:\/\//, route => route.fulfill({ contentType: route.request().resourceType() === 'document' ? 'text/html' : 'application/javascript', body: route.request().resourceType() === 'document' ? '<!doctype html><title>Navigation destination</title>' : '' }));
    const p = await c.newPage(); await p.goto(root);await settled(p);
    const links = p.locator('a[href^="https://"]');
    const destinations = [];
    for (let i = 0; i < await links.count(); i++) {
      const link = links.nth(i); const href = await link.getAttribute('href'); destinations.push(href);
      assert.equal(await link.getAttribute('target'), '_blank'); const rel = await link.getAttribute('rel'); assert.ok(rel.includes('noopener') && rel.includes('noreferrer'));
      const pending = p.waitForEvent('popup'); await link.click(); const popup = await pending; await popup.waitForLoadState('domcontentloaded');
      assert.equal(popup.url(), href); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close();
    }
    results.linkDestinations = [...new Set(destinations)]; results.externalLinkCount = destinations.length; await c.close();
  });
  await scenario('Keyboard focus, menu tab order and desktop resize reset', async () => {
    const c = await newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });const p=await c.newPage();await p.goto(root);await settled(p);
    await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.className),'skip-link');
    assert.equal(await p.locator('.skip-link').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.activeElement.id),'main');
    await p.locator('.nav-toggle').focus();await p.keyboard.press('Enter');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.hash),'#about');
    await p.setViewportSize({width:1440,height:900});assert.equal(await p.locator('.nav-list').evaluate(e=>e.inert),false);assert.equal(await p.locator('.nav-toggle').getAttribute('aria-expanded'),'false');
    await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('.nav-list').evaluate(e=>e.inert),true);
    assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');await c.close();
  });
  await scenario('Desktop cursor is event-driven and stops when hidden or reduced', async () => {
    const c=await newContext({viewport:{width:1440,height:900}});const p=await c.newPage();await p.goto(root);await settled(p);await p.waitForTimeout(600);
    await p.mouse.move(600,400);await p.waitForTimeout(100);assert.equal(await p.locator('.cursor-ring').isVisible(),true);
    assert.notEqual(await p.evaluate(()=>getComputedStyle(document.body).cursor),'none');
    const before=await p.evaluate(()=>window.__audit.frames);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>window.__audit.frames),before);
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await p.mouse.move(620,420);await p.waitForTimeout(100);assert.equal(await p.locator('.cursor-ring').isVisible(),false);assert.equal(await p.evaluate(()=>window.__audit.frames),before);
    await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await p.emulateMedia({reducedMotion:'reduce'});await p.mouse.move(650,450);assert.equal(await p.locator('.cursor-ring').isVisible(),false);await c.close();
  });
  await scenario('Reduced motion and large touch screen disable desktop effects',async()=>{
    for(const options of [{reducedMotion:'reduce'},{hasTouch:true}]){
      const c=await newContext({viewport:{width:1440,height:900},...options});const p=await c.newPage();await p.goto(root);await settled(p);await p.mouse.move(500,400);
      assert.equal(await p.locator('.cursor-ring').isVisible(),false);assert.equal(await p.evaluate(()=>window.__audit.pointerListeners),0);
      if(options.reducedMotion)assert.equal(await p.evaluate(()=>typeof window.archiveStartup),'undefined');await c.close();
    }
  });
  await scenario('Images and fonts can fail without blocking content or layout',async()=>{
    const c=await newContext({viewport:{width:390,height:844},hasTouch:true});
    await c.route(/\.(webp|woff2)$/,route=>route.abort());const p=await c.newPage();p.on('pageerror',e=>results.unexpectedErrors.push(e.message));
    await p.goto(root);await settled(p);await scrollAll(p);const overflow=await checkOverflow(p);assert.equal(overflow.page,overflow.viewport);
    assert.equal(await p.locator('h1').isVisible(),true);await p.locator('.nav-toggle').click();await p.locator('a.nav-link[href="#projects"]').click();
    await p.screenshot({path:path.join(evidence,'asset-failure.png')});await c.close();
  });
  await scenario('No JavaScript leaves all content and navigation available',async()=>{
    const c=await newContext({javaScriptEnabled:false,viewport:{width:375,height:667},hasTouch:true});const p=await c.newPage();await p.goto(root);
    assert.equal(await p.locator('.archive-loader').isVisible(),false);assert.equal(await p.locator('h1').isVisible(),true);
    for(const a of await p.locator('.nav-link').all())assert.equal(await a.isVisible(),true);
    await p.locator('.nav-link[href="#projects"]').click();assert.equal(new URL(p.url()).hash,'#projects');
    const o=await checkOverflow(p);assert.equal(o.page,o.viewport);await c.close();
  });
  await scenario('Missing main script still dismisses startup at 1500ms',async()=>{
    const c=await newContext({viewport:{width:390,height:844}});await c.route('**/script.js',route=>route.fulfill({contentType:'application/javascript',body:''}));const p=await c.newPage();await p.goto(root);await p.waitForFunction(()=>document.querySelector('.archive-loader').hidden);
    const duration=await p.evaluate(()=>performance.getEntriesByName('archive-ready')[0].startTime-window.archiveStartup.started);assert.ok(duration<=1550);results.scriptFailureTimeoutMs=Math.round(duration);assert.equal(await p.locator('h1').isVisible(),true);for(const a of await p.locator('.nav-link').all())assert.equal(await a.isVisible(),true);await c.close();
  });
  await scenario('Unavailable session storage never prevents startup',async()=>{
    const c=await newContext();await c.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError')};});const p=await c.newPage();errors(p,'storage');await p.goto(root);await settled(p);assert.equal(await p.locator('h1').isVisible(),true);await c.close();
  });
  await scenario('Slow network releases loader before late assets settle',async()=>{
    const c=await newContext({viewport:{width:390,height:844},hasTouch:true});const p=await c.newPage();errors(p,'slow network');
    const session=await c.newCDPSession(p);await session.send('Network.enable');await session.send('Network.emulateNetworkConditions',{offline:false,latency:200,downloadThroughput:50000,uploadThroughput:25000});
    await c.route('**/assets/profile*.webp',async route=>{await delay(2200);await route.continue()});
    await p.goto(root,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('.archive-loader').hidden);
    const duration=await p.evaluate(()=>performance.getEntriesByName('archive-ready')[0].startTime-window.archiveStartup.started);assert.ok(duration<=1550);results.slowNetworkTimeoutMs=Math.round(duration);
    assert.equal(await p.locator('.hero-link').first().isVisible(),true);await p.waitForLoadState('load');await c.close();
  });
  await scenario('Deferred navigation keeps mobile layout stable',async()=>{
    const c=await newContext({viewport:{width:390,height:844},hasTouch:true});
    await c.route('**/script.js',async route=>{await delay(800);await route.continue()});
    const p=await c.newPage();await p.goto(root);await settled(p);await p.waitForTimeout(200);
    results.delayedScriptCLS=await p.evaluate(()=>window.__audit.shifts.reduce((a,b)=>a+b,0));
    assert.ok(results.delayedScriptCLS<.1,`Layout shift ${results.delayedScriptCLS}`);await c.close();
  });
  await scenario('Mobile menu interaction latency under 4x CPU throttling',async()=>{
    const c=await newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage();await p.goto(root);await settled(p);
    const session=await c.newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    for(let i=0;i<8;i++){await p.locator('.nav-toggle').tap();await p.waitForTimeout(100);}
    results.maxObservedInteractionMs=await p.evaluate(()=>Math.max(0,...window.__audit.interactions));
    assert.ok(results.maxObservedInteractionMs<200);await c.close();
  });
  assert.deepEqual(results.unexpectedErrors,[]);
  fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify(results,null,2));
  console.log('All browser audits passed.');
})().catch(error=>{results.failure=error.stack;fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify(results,null,2));console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close()});
