import puppeteer from 'puppeteer-core';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:4327';
const dist = path.resolve('dist');
const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name === 'index.html' ? [full] : [];
  }))).flat();
};
const files = await walk(dist);
const routes = files.map((file) => {
  const relative = path.relative(dist, path.dirname(file)).replaceAll(path.sep, '/');
  return relative ? `/${relative}/` : '/';
});
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const pageErrors = [];
const consoleErrors = [];
const page = await browser.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
const routeIds = new Map();
const navigations = [];
const sameSiteLinks = new Set();
const assets = new Set();
try {
  await page.setViewport({ width: 1365, height: 850 });
  for (const route of routes) {
    const response = await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`${route} returned ${response?.status()}`);
    const snapshot = await page.evaluate(() => ({
      title: document.title,
      dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0,
      text: (document.querySelector('main')?.innerText ?? document.body.innerText).trim().length,
      ids: [...document.querySelectorAll('[id]')].map((node) => node.id),
      links: [...document.querySelectorAll('a[href]')].map((link) => link.href),
      images: [...document.querySelectorAll('img[src]')].map((image) => image.src),
    }));
    if (!snapshot.title || snapshot.text < 80) throw new Error(`${route} rendered an empty/white page`);
    routeIds.set(route, new Set(snapshot.ids));
    for (const href of snapshot.links) if (new URL(href).origin === new URL(base).origin) sameSiteLinks.add(href);
    for (const src of snapshot.images) if (new URL(src).origin === new URL(base).origin) assets.add(src);
    navigations.push({ route, ms: Math.round(snapshot.dcl), title: snapshot.title });
  }

  for (const href of sameSiteLinks) {
    const url = new URL(href);
    const response = await fetch(`${url.origin}${url.pathname}`);
    if (!response.ok) throw new Error(`Internal link ${href} returned ${response.status}`);
    if (url.hash) {
      const route = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      if (!routeIds.get(route)?.has(decodeURIComponent(url.hash.slice(1)))) throw new Error(`Missing hash target ${href}`);
    }
  }
  for (const src of assets) {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Broken image ${src} (${response.status})`);
  }
  const max = Math.max(...navigations.map((entry) => entry.ms));
  if (max >= 1000) {
    const slowest = navigations.find((entry) => entry.ms === max);
    throw new Error(`Slow route: ${slowest.route} ${max}ms, expected below 1000ms`);
  }
  if (pageErrors.length || consoleErrors.length) throw new Error(`Browser errors: ${[...pageErrors, ...consoleErrors].join(' | ')}`);
  console.log(`PASS ${routes.length} pages, ${sameSiteLinks.size} internal destinations, ${assets.size} image URLs; all pages non-empty; no browser errors. Max local DOMContentLoaded navigation: ${max}ms.`);
  console.log(navigations.map(({ route, ms }) => `${route} ${ms}ms`).join('\n'));
} finally {
  await browser.close();
}
