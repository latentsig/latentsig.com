import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const routes = [
  '/', '/products/', '/products/annotation-verification/',
  '/products/agentic-ai-platform/', '/solutions/web-mobile-apps/',
  '/demos/', '/bts-2026/', '/solutions/', '/services/', '/insights/', '/rd-advisory/',
  '/consulting/', '/implementation/', '/about/', '/contact/',
];

test('all required product and event routes render', async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1').first(), route).toBeVisible();
  }
});

test('products page lists two platforms and application development lives under Solutions', async ({ page }) => {
  await page.goto('/products/');
  await expect(page.locator('.catalog-card')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /application solutions/i })).toHaveAttribute('href', '/solutions/web-mobile-apps/');
  await page.goto('/solutions/web-mobile-apps/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Digital experiences');
});

test('desktop product dropdown opens by click and stays open while moving into the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  const products = page.locator('[data-disclosure="products"]');
  await products.click();
  await expect(products).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('#products-panel');
  await expect(panel).toBeVisible();
  await page.locator('#products-panel .featured-product').hover();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await products.click();
  await page.locator('body').dispatchEvent('pointerdown', { bubbles: true, pointerType: 'mouse' });
  await expect(panel).toBeHidden();
});

test('desktop dropdowns open when hovering over the navigation labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const id of ['products', 'solutions', 'services', 'about']) {
    await page.locator(`[data-nav-group="${id}"] > .nav-link`).hover();
    await expect(page.locator(`#${id}-panel`)).toBeVisible();
  }
  await expect(page.locator('.desktop-links a[href="/insights/"]')).toBeVisible();
  await expect(page.locator('[data-panel="insights"]')).toHaveCount(0);
});

test('products label navigates and menu destinations are present', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.desktop-links').getByRole('link')).toHaveText(['Products', 'Solutions', 'Services', 'Insights', 'About']);
  await expect(page.locator('.desktop-links a[href="/demos/"]')).toHaveCount(0);
  await expect(page.locator('.desktop-links a:has-text("Solutions")')).toHaveAttribute('href', '/solutions/');
  await expect(page.locator('.desktop-links a:has-text("Services")')).toHaveAttribute('href', '/services/');
  await expect(page.locator('.desktop-links a[href="/products/"]')).toHaveText('Products');
  await page.locator('[data-disclosure="products"]').click();
  for (const href of ['/products/annotation-verification/', '/products/agentic-ai-platform/', '/solutions/web-mobile-apps/', '/demos/']) {
    await expect(page.locator(`#products-panel a[href="${href}"]`).first()).toBeVisible();
  }
  await page.locator('.desktop-links a[href="/products/"]').click();
  await expect(page).toHaveURL(/\/products\/$/);
  await expect(page.locator('.catalog-card')).toHaveCount(3);
});

test('solutions, services, insights, and company menus route to the expected pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const menus = [
    ['solutions', ['/solutions/web-mobile-apps/', '/solutions/web-mobile-apps/#mobile', '/solutions/web-mobile-apps/#portfolio', '/products/annotation-verification/', '/products/agentic-ai-platform/']],
    ['services', ['/rd-advisory/', '/consulting/', '/implementation/', '/solutions/web-mobile-apps/']],
    ['about', ['/about/', '/contact/', '/bts-2026/']],
  ] as const;
  for (const [id, hrefs] of menus) {
    await page.locator(`[data-disclosure="${id}"]`).click();
    const panel = page.locator(`#${id}-panel`);
    await expect(panel).toBeVisible();
    for (const href of hrefs) await expect(panel.locator(`a[href="${href}"]`).first()).toBeAttached();
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.desktop-links a[href="/insights/"]')).toBeVisible();
});

test('keyboard disclosure, Escape, and focus states work', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('[data-disclosure="solutions"]');
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#solutions-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#solutions-panel')).toBeHidden();
});

test('mobile menu accordion works with keyboard and touch sized controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('[data-mobile-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('[data-mobile-panel]')).toBeVisible();
  const products = page.locator('[data-mobile-panel] summary').filter({ hasText: 'Products' });
  await products.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mobile-panel] details').first()).toHaveAttribute('open', '');
  await expect(page.locator('[data-mobile-panel] a[href="/products/"]')).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(42);
  expect(box!.height).toBeGreaterThanOrEqual(42);
});

test('booking links and product demo actions have working destinations', async ({ page }) => {
  await page.goto('/products/agentic-ai-platform/');
  await expect(page.getByRole('link', { name: 'View Demo' })).toHaveAttribute('href', '/demos/');
  await expect(page.getByRole('link', { name: /Book a Demo/ }).first()).toHaveAttribute('href', /calendly\.com\/latentsig\?utm_source=/);
  await page.getByRole('link', { name: 'View Demo' }).click();
  await expect(page).toHaveURL(/\/demos\/$/);
  await expect(page.locator('#main-content h1').first()).toContainText('See the ideas in context');
});

test('no horizontal overflow at the requested viewport widths', async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/products/', '/products/annotation-verification/', '/demos/', '/bts-2026/']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const sizes = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(sizes.page, `${route} at ${width}px`).toBeLessThanOrEqual(sizes.viewport);
    }
  }
});

test('reduced motion preference is respected and local page errors stay clear', async ({ page }) => {
  const pageErrors: string[] = [];
  const badLocalResponses: string[] = [];
  const localConsoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.location().url.startsWith('http://127.0.0.1:4321')) localConsoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4321') && response.status() >= 400) badLocalResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const motion = await page.locator('.nav-disclosure').first().evaluate(el => getComputedStyle(el).transitionDuration);
  expect(parseFloat(motion)).toBeLessThanOrEqual(0.001);
  for (const route of routes) await page.goto(route);
  await page.goto('/insights/');
  await page.locator('#main-content img').evaluateAll(images => images.forEach(image => { (image as HTMLImageElement).loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('#main-content img')].every(image => (image as HTMLImageElement).complete));
  const brokenImages = await page.locator('#main-content img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src));
  expect(pageErrors).toEqual([]);
  expect(badLocalResponses).toEqual([]);
  expect(localConsoleErrors).toEqual([]);
  expect(brokenImages).toEqual([]);
});

test('captures desktop, tablet, and mobile review screenshots', async ({ page }) => {
  mkdirSync('artifacts/review', { recursive: true });
  for (const [width, height, name] of [[1440, 960, 'desktop'], [768, 1024, 'tablet'], [390, 844, 'mobile']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.screenshot({ path: `artifacts/review/${name}.png`, animations: 'disabled' });
    if (name === 'desktop') {
      await page.locator('[data-disclosure="products"]').click();
      await page.screenshot({ path: 'artifacts/review/desktop-products-menu.png', animations: 'disabled' });
    }
    if (name === 'mobile') {
      await page.locator('[data-mobile-toggle]').click();
      await expect(page.locator('[data-mobile-panel]')).toBeVisible();
      await page.screenshot({ path: 'artifacts/review/mobile-menu-open.png', animations: 'disabled' });
    }
  }
});
