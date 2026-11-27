import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:4325';
const out = path.join(process.cwd(), 'artifacts', 'nav-redesign');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const visible = async (selector) => page.$eval(selector, (el) => !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0).catch(() => false);
  const hover = async (selector) => {
    const element = await page.$(selector);
    assert(element, `Missing selector ${selector}`);
    await element.hover();
    return element;
  };
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());

  const categoryNames = ['Products', 'Solutions', 'Services', 'About'];
  for (const name of categoryNames) {
    const triggerSelector = `[data-nav-trigger][href="/${name.toLowerCase()}/"]`;
    assert(await page.$(triggerSelector), `${name} trigger missing`);
    await hover(triggerSelector);
    const panelSelector = `${triggerSelector} ~ [data-nav-panel]`;
    await page.waitForFunction((selector) => { const panel = document.querySelector(selector); return panel && !panel.hidden; }, {}, panelSelector);
    await page.waitForFunction((selector) => { const image = document.querySelector(`${selector} .feature-image.is-active`); return image?.complete && image.naturalWidth > 0; }, {}, panelSelector);
    if (name === 'Products') {
      assert(await page.$eval('.mega-menu-products .feature-visual', (el) => el.dataset.agentic === 'true'), 'Agentic preview is not active by default');
      assert(await page.$eval('.mega-menu-products .feature-image.is-active', (el) => el.getAttribute('src')?.includes('products-agentic.webp')), 'Fixed 3D product preview is not active');
      assert(await page.$eval('.agent-flow', (el) => getComputedStyle(el).opacity === '0.92'), 'Product flow animation is not visible');
    }
    await page.screenshot({ path: path.join(out, `${name.toLowerCase()}.png`) });
  }

  // Exercise every preview and confirm each image is loaded before capturing.
  for (const name of categoryNames) {
    const triggerSelector = `[data-nav-trigger][href="/${name.toLowerCase()}/"]`;
    await hover(triggerSelector);
    const panel = await page.$(`${triggerSelector} ~ [data-nav-panel]`);
    const links = await panel.$$('.mega-link');
    for (let index = 0; index < links.length; index++) {
      const link = links[index];
      const expected = await link.evaluate((el) => el.getAttribute('data-preview-src'));
      await link.hover();
      await page.waitForFunction((src) => {
        const menu = document.querySelector('.mega-menu:not([hidden])');
        const image = menu?.querySelector('.feature-image.is-active');
        return image?.getAttribute('src') === src && image.complete && image.naturalWidth > 0;
      }, {}, expected);
      assert(await link.evaluate((el) => el.classList.contains('is-previewed')), `${name} link preview not active: ${expected}`);
      const sample = (name === 'Products' && index === 1)
        || (name === 'Solutions' && index === 1)
        || (name === 'Services' && index === 2)
        || (name === 'About' && index === 1);
      if (sample) await page.screenshot({ path: path.join(out, `${name.toLowerCase()}-hover-${index + 1}.png`) });
    }
  }

  // Continuous hover zone for fast, slow and diagonal pointer movement.
  const productsSelector = '[data-nav-trigger][href="/products/"]';
  const products = await hover(productsSelector);
  const productPanel = await page.$('.mega-menu-products');
  const from = await products.boundingBox();
  const to = await productPanel.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.move(to.x + 45, to.y + 42, { steps: 2 });
  await sleep(50);
  assert(await visible('.mega-menu-products'), 'Dropdown collapsed during fast diagonal move');
  await hover(productsSelector);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  for (let step = 1; step <= 32; step++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((to.x + 45) - (from.x + from.width / 2)) * step / 32,
      from.y + from.height / 2 + ((to.y + 42) - (from.y + from.height / 2)) * step / 32,
    );
    await sleep(20);
  }
  await sleep(160);
  assert(await visible('.mega-menu-products'), 'Dropdown collapsed during slow diagonal move');
  await page.mouse.move(to.x + 130, to.y + 82, { steps: 2 });
  await sleep(400);
  assert(await visible('.mega-menu-products'), 'Dropdown collapsed while pointer remained inside the panel');

  await hover('[data-nav-trigger][href="/solutions/"]');
  assert(await visible('.mega-menu-solutions'), 'Category handoff failed');

  const servicesSelector = '[data-nav-trigger][href="/services/"]';
  await hover(servicesSelector);
  await page.mouse.move(6, 400, { steps: 1 });
  await sleep(140);
  assert(await visible('.mega-menu-services'), 'Menu closed before delayed close window');
  await sleep(240);
  assert(!(await visible('.mega-menu-services')), 'Menu stayed open after close delay');

  await (await page.$(productsSelector)).focus();
  await page.keyboard.press('ArrowDown');
  assert(await visible('.mega-menu-products'), 'ArrowDown did not open Products');
  assert(await page.$eval('.mega-menu-products .mega-link', (el) => el === document.activeElement), 'ArrowDown did not focus first menu item');
  await page.keyboard.press('Escape');
  assert(!(await visible('.mega-menu-products')), 'Escape did not close menu');
  assert(await page.$eval(productsSelector, (el) => el === document.activeElement), 'Escape did not restore focus');
  await hover('[data-nav-trigger][href="/solutions/"]');
  await page.mouse.click(8, 500);
  assert(!(await visible('.mega-menu-solutions')), 'Outside click did not close menu');

  // Check every desktop dropdown destination, HTTP response, and hash target.
  const hrefs = await page.$$eval('.desktop-navigation [data-nav-panel] .mega-link', (links) => [...new Set(links.map((link) => link.getAttribute('href')))]);
  const navResults = [];
  for (const href of hrefs) {
    const url = new URL(href, base);
    const response = await page.goto(`${url.origin}${url.pathname}`, { waitUntil: 'domcontentloaded' });
    assert(response?.status() < 400, `${href} returned ${response?.status()}`);
    if (url.hash) {
      assert(await page.$(decodeURIComponent(url.hash)), `${href} target missing`);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((hash) => location.hash === hash, {}, url.hash);
    }
    navResults.push(`${href}: ${response.status()}`);
  }

  for (const width of [1024, 820]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert(!overflow, `${width}px viewport has horizontal overflow`);
    if (width === 1024) assert(await visible('.desktop-navigation'), 'Desktop menu missing at 1024px');
    else assert(!(await visible('.desktop-navigation')), 'Desktop menu visible at 820px');
  }
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
  assert(await visible('#mobile-menu-toggle'), 'Mobile toggle missing');
  await page.click('#mobile-menu-toggle');
  assert(await visible('#mobile-menu'), 'Mobile navigation did not open');
  assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), 'Mobile viewport has horizontal overflow');
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  await page.click('[data-mobile-close]');
  assert(!(await visible('#mobile-menu')), 'Mobile navigation did not close');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await hover(productsSelector);
  assert(await page.$eval('.agent-flow-pulse', (el) => getComputedStyle(el).display === 'none'), 'Product flow animation ignored reduced-motion preference');

  assert(errors.length === 0, `Browser console/runtime errors: ${errors.join(' | ')}`);
  console.log(`PASS: visual previews; fast/slow/diagonal hover; delayed close; category transition; keyboard/Escape/outside click; mobile/tablet; no console errors.\nLinks:\n${navResults.join('\n')}\nScreenshots: ${out}`);
} finally {
  await browser.close();
}
