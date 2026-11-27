import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.NAV_BASE_URL ?? 'http://127.0.0.1:4327';
const output = path.resolve('artifacts/product-experience');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const routes = [
  ['products', '/products/'], ['agentic', '/products/agentic-ai-platform/'], ['annotation', '/products/annotation-verification/'],
  ['demos-annotation', '/demos/#annotation-verification'], ['demos-agentic', '/demos/#agentic-ai-platform'], ['solutions-healthcare', '/solutions/healthcare/'],
  ['solutions-industry', '/solutions/industry/'], ['solutions-retail', '/solutions/retail/'], ['solutions-education', '/solutions/education/'],
];
const checkViewport = async (name, route, viewport, save = true) => {
  await page.setViewport(viewport);
  const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle2' });
  if (response && response.status() >= 400) throw new Error(`${route} returned ${response.status()}`);
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => ({ title: document.title, width: document.documentElement.scrollWidth, viewport: innerWidth, images: [...document.images].filter((image) => image.getClientRects().length).map((image) => ({ src: image.src, complete: image.complete, width: image.naturalWidth })) }));
  if (!result.title || result.width > result.viewport + 1) throw new Error(`${name} horizontal overflow: ${result.width}/${result.viewport}`);
  const broken = result.images.filter((image) => !image.complete || !image.width);
  if (broken.length) throw new Error(`${name} has broken image(s): ${broken.map((image) => image.src).join(', ')}`);
  if (save) await page.screenshot({ path: path.join(output, `${name}-${viewport.width}.png`), fullPage: true });
};
try {
  for (const [name, route] of routes) {
    await checkViewport(name, route, { width: 1440, height: 1000 });
    await checkViewport(name, route, { width: 768, height: 1024 });
    await checkViewport(name, route, { width: 390, height: 844 });
  }

  // Stable desktop menu hover: traverse from trigger into its panel, then across product groups.
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(new URL('/products/', base).href, { waitUntil: 'networkidle2' });
  const trigger = await page.$('[data-nav-trigger][href="/products/"]');
  const bounds = await trigger.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForSelector('.mega-menu-products:not([hidden])');
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: path.join(output, 'products-mega-menu-1440.png'), fullPage: false });
  const panel = await page.$('.mega-menu-products');
  const panelBounds = await panel.boundingBox();
  await page.mouse.move(panelBounds.x + 40, panelBounds.y + 60, { steps: 8 });
  await page.waitForFunction(() => !document.querySelector('.mega-menu-products')?.hidden);
  await page.mouse.move(panelBounds.x + panelBounds.width * .48, panelBounds.y + panelBounds.height * .7, { steps: 10 });
  const annotationCard = await page.$('.products-mega-list a.product-demo-card[href="/demos/#annotation-verification"]');
  await annotationCard.hover();
  await page.waitForFunction(() => [...document.querySelectorAll('.mega-menu-products [data-preview-image]')].some((image) => image.classList.contains('is-active') && image.getAttribute('src')?.includes('products-agentic.webp')));
  const menuLinks = await page.$$eval('.products-mega-list a.product-demo-card', (items) => items.map((item) => ({ href: item.href, text: item.textContent?.trim() ?? '' })));
  if (menuLinks.length !== 2 || !menuLinks.some((item) => item.href.endsWith('/demos/#agentic-ai-platform')) || !menuLinks.some((item) => item.href.endsWith('/demos/#annotation-verification')) || menuLinks.some((item) => item.text.includes('Interactive demo'))) throw new Error('Product cards should be plain clickable links to their matching demos without an Interactive demo label');
  const capabilityControls = await page.$$eval('.products-mega-trust a, .products-mega-trust button, .products-mega-trust [role="button"]', (items) => items.length);
  if (capabilityControls !== 0) throw new Error('Informational trust and capability items must not be interactive');
  const capabilityCursor = await page.$eval('.products-mega-trust > div', (item) => getComputedStyle(item).cursor);
  if (capabilityCursor !== 'default') throw new Error('Informational trust and capability items should not look clickable');
  const cardTag = await page.$eval('.product-menu-agentic.product-demo-card', (item) => item.tagName);
  if (cardTag !== 'A') throw new Error('Agentic product card must be a clickable link');
  const menuImage = await page.$eval('.mega-menu-products [data-preview-image].is-active', (img) => img.getAttribute('src'));
  if (!menuImage?.includes('products-agentic.webp')) throw new Error('Product preview should stay on the selected 3D image when hovering menu items');
  await annotationCard.click();
  await page.waitForFunction(() => location.pathname === '/demos/' && location.hash === '#annotation-verification');
  await page.goto(new URL('/products/', base).href, { waitUntil: 'networkidle2' });
  const demoMenuTrigger = await page.$('[data-nav-trigger][href="/products/"]');
  const demoMenuTriggerBounds = await demoMenuTrigger.boundingBox();
  await page.mouse.move(demoMenuTriggerBounds.x + demoMenuTriggerBounds.width / 2, demoMenuTriggerBounds.y + demoMenuTriggerBounds.height / 2);
  await page.waitForSelector('.mega-menu-products:not([hidden])');
  await page.$eval('.product-menu-annotation.product-demo-card', (link) => link.click());
  await page.waitForFunction(() => location.pathname === '/demos/' && location.hash === '#annotation-verification');

  // Agentic walkthrough: inspect the full graph, all sample outputs, parallel execution, pause/resume and approval gate.
  await page.goto(new URL('/demos/#agentic-ai-platform', base).href, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => scrollY > 100);
  const workspace = await page.$('#agentic-ai-platform [data-agent-workspace]');
  const graph = await workspace.evaluate((root) => ({
    state: root.dataset.executionState,
    connections: [...root.querySelectorAll('[data-connection]')].map((path) => ({ name: path.getAttribute('data-connection'), length: path.getTotalLength(), arrow: path.getAttribute('marker-end') })),
    tokens: [...root.querySelectorAll('[data-flow-token]')].map((token) => ({ name: token.getAttribute('data-flow-token'), motion: token.querySelector('animateMotion')?.getAttribute('path'), duration: token.querySelector('animateMotion')?.getAttribute('dur') })),
  }));
  const expectedConnections = ['input-orchestrator','dispatch-reader','dispatch-compare','dispatch-evidence','merge-reader','merge-compare','merge-evidence','evaluation-human','human-output'];
  if (graph.state !== 'idle' || graph.connections.length !== expectedConnections.length || graph.connections.some((edge) => !expectedConnections.includes(edge.name) || edge.length < 20 || !edge.arrow?.includes('agent-flow-arrow'))) throw new Error('Workflow graph is missing a visible, directional connection');
  if (graph.tokens.length !== expectedConnections.length || graph.tokens.some((token) => !token.motion || !token.duration || token.duration === '0s')) throw new Error('A workflow connection is missing its animated data-flow token');
  const expectedDetails = [
    ['input','Request & source documents','SAMPLE INPUT'], ['orchestrator','Orchestrator','ROUTING PLAN'], ['reader','Document reader','INTERMEDIATE RESULT · READER'],
    ['compare','Change analyst','INTERMEDIATE RESULT · COMPARISON'], ['evidence','Evidence linker','INTERMEDIATE RESULT · SOURCES'],
    ['evaluation','LLM evaluation checkpoint','EVALUATION CHECKS'], ['human','Human approval checkpoint','REVIEW QUEUE'], ['output','Final output with evidence','REVIEWED SAMPLE OUTPUT'],
  ];
  for (const [key, title, heading] of expectedDetails) {
    await workspace.$eval(`[data-work-node="${key}"]`, (node) => node.click());
    const detail = await workspace.evaluate((root) => ({ title: root.querySelector('[data-detail-title]')?.textContent, heading: root.querySelector('[data-preview-heading]')?.textContent, items: [...root.querySelectorAll('[data-preview-items] li')].map((item) => item.textContent) }));
    if (detail.title !== title || detail.heading !== heading || detail.items.length < 2) throw new Error(`${key} node did not reveal its expected sample input/intermediate/output`);
  }
  await workspace.$eval('[data-run]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'parallel', { timeout: 5000 });
  const parallelState = await workspace.evaluate((root) => ({ statuses: ['reader','compare','evidence'].map((key) => root.querySelector(`[data-work-node="${key}"] [data-node-status]`)?.textContent), activeFlows: [...root.querySelectorAll('[data-flow-token].is-moving')].map((token) => token.getAttribute('data-flow-token')), connections: [...root.querySelectorAll('[data-connection].is-active')].map((path) => path.getAttribute('data-connection')) }));
  if (parallelState.statuses.some((status) => status !== 'Running') || parallelState.activeFlows.length !== 3 || parallelState.connections.length !== 3) throw new Error('Specialist agents did not execute and animate in parallel');
  await workspace.$eval('[data-pause]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'paused');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const pausedState = await workspace.evaluate((root) => ({ statuses: ['reader','compare','evidence'].map((key) => root.querySelector(`[data-work-node="${key}"] [data-node-status]`)?.textContent), activeTokens: root.querySelectorAll('[data-flow-token].is-moving').length }));
  if (pausedState.statuses.some((status) => status !== 'Running') || pausedState.activeTokens !== 0) throw new Error('Pause did not hold the parallel agents and stop animated data flow');
  await workspace.$eval('[data-pause]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'parallel');
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'aggregation', { timeout: 5000 });
  const mergeState = await workspace.evaluate((root) => ({ activeFlows: [...root.querySelectorAll('[data-flow-token].is-moving')].map((token) => token.getAttribute('data-flow-token')), connections: [...root.querySelectorAll('[data-connection].is-active')].map((path) => path.getAttribute('data-connection')) }));
  if (mergeState.activeFlows.length !== 3 || mergeState.activeFlows.some((flow) => !flow.startsWith('merge-')) || mergeState.connections.length !== 3) throw new Error('Parallel agent results were not visibly aggregated');
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'evaluation', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-human-approve]')?.hidden === false, { timeout: 5000 });
  const approvalGate = await workspace.evaluate((root) => ({ stage: root.dataset.executionState, output: root.querySelector('[data-work-node="output"] [data-node-status]')?.textContent, human: root.querySelector('[data-work-node="human"] [data-node-status]')?.textContent }));
  if (approvalGate.stage !== 'approval' || approvalGate.output !== 'Pending' || approvalGate.human !== 'Review required') throw new Error('Execution did not pause at a real human approval gate');
  await new Promise((resolve) => setTimeout(resolve, 450));
  if ((await workspace.evaluate((root) => root.dataset.executionState)) !== 'approval') throw new Error('Workflow continued before human approval');
  await workspace.$eval('[data-human-approve]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'publishing', { timeout: 3000 });
  const publishFlow = await workspace.evaluate((root) => ({ active: [...root.querySelectorAll('[data-flow-token].is-moving')].map((token) => token.getAttribute('data-flow-token')), output: root.querySelector('[data-work-node="output"] [data-node-status]')?.textContent }));
  if (!publishFlow.active.includes('human-output') || publishFlow.output !== 'Pending') throw new Error('Approval did not route the final result to the output node');
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-run-state]')?.textContent?.includes('Complete'), { timeout: 5000 });
  const finalOutput = await workspace.evaluate((root) => ({ human: root.querySelector('[data-work-node="human"] [data-node-status]')?.textContent, output: root.querySelector('[data-work-node="output"] [data-node-status]')?.textContent, details: [...root.querySelectorAll('[data-preview-items] li')].map((item) => item.textContent) }));
  if (finalOutput.human !== 'Approved locally' || finalOutput.output !== 'Complete' || !finalOutput.details.some((item) => item.includes('§4.2')) || !finalOutput.details.some((item) => item.includes('§7.1'))) throw new Error('Final output did not preserve both evidence-backed findings after approval');
  await workspace.$eval('[data-replay]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('#agentic-ai-platform [data-agent-workspace]')?.dataset.executionState === 'planning');
  await workspace.$eval('[data-pause]', (button) => button.click());
  const paused = await workspace.$eval('[data-run-state]', (node) => node.textContent);
  if (!paused.includes('Paused')) throw new Error('Pause control did not pause the replay');
  await workspace.$eval('[data-pause]', (button) => button.click());
  await workspace.$eval('[data-reset]', (button) => button.click());
  if ((await workspace.evaluate((root) => root.dataset.executionState)) !== 'idle') throw new Error('Reset did not return the workflow to its idle state');
  await page.goto(new URL('/products/agentic-ai-platform/', base).href, { waitUntil: 'networkidle2' });
  await page.$eval('.product-page [data-open-dialog]', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('[data-product-dialog]')?.open);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-product-dialog]')?.open);

  // Annotation review and export interaction.
  await page.goto(new URL('/demos/#annotation-verification', base).href, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => scrollY > 100);
  const annotationRegion = await page.$eval('[data-annotation-workspace] .annotated-image svg', (svg) => ({ boxes: [...svg.querySelectorAll('rect')].map((rect) => rect.getAttribute('x')), mask: svg.querySelector('path')?.getAttribute('d'), labels: [...svg.parentElement.querySelectorAll('.region-label')].map((label) => label.textContent?.trim()) }));
  if (annotationRegion.boxes.length !== 3 || !['194', '434', '560'].every((x) => annotationRegion.boxes.includes(x)) || !annotationRegion.mask?.startsWith('M583') || annotationRegion.labels.join('|') !== 'Car 1|Car 2|Car 3') throw new Error('Annotation overlays must mark all three cars and align the mask with the blue sedan');
  await page.$eval('[data-annotation-workspace] [data-review-tab="b"]', (button) => button.click());
  const secondLabel = await page.$eval('[data-annotation-workspace] [data-object-label]', (node) => node.textContent);
  const secondTitle = await page.$eval('[data-annotation-workspace] [data-annotation-title]', (node) => node.textContent);
  if (secondLabel !== 'Blue sedan' || secondTitle !== 'Segmentation mask') throw new Error('Annotator comparison tab did not describe the blue sedan with a segmentation mask');
  await page.$eval('[data-annotation-workspace] [data-correct]', (button) => button.click());
  await page.$eval('[data-annotation-workspace] [data-approve]', (button) => button.click());
  const reviewStatus = await page.$eval('[data-annotation-workspace] [data-review-state]', (node) => node.textContent);
  if (!reviewStatus.includes('Approved')) throw new Error('Annotation approval did not update review state');
  await page.$eval('[data-annotation-workspace] [data-export-reviewed]', (button) => button.click());
  const exportStatus = await page.$eval('[data-annotation-workspace] [data-export-state]', (node) => node.textContent);
  if (!exportStatus.includes('exported locally')) throw new Error('Local reviewed export action did not complete');

  // Legacy industry hash continues to resolve, and browser Back restores the previous route.
  await page.goto(new URL('/solutions/#healthcare', base).href, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.getElementById('healthcare') && scrollY > 100);
  await page.goto(new URL('/solutions/industry/', base).href, { waitUntil: 'networkidle2' });
  await page.goBack({ waitUntil: 'networkidle2' });
  if (!page.url().includes('/solutions/#healthcare')) throw new Error('Browser Back did not restore the legacy industry anchor');

  // Existing mobile drawer remains available and touch expandable.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(new URL('/products/agentic-ai-platform/', base).href, { waitUntil: 'networkidle2' });
  const agentHeaderLayout = await page.$eval('.agent-workspace .workspace-head', (header) => {
    const title = header.querySelector(':scope > div').getBoundingClientRect();
    const state = header.querySelector('[data-run-state]').getBoundingClientRect();
    const expand = header.querySelector('[data-open-dialog]').getBoundingClientRect();
    return { title: { left: title.left, right: title.right }, state: { left: state.left, right: state.right }, expand: { left: expand.left, right: expand.right } };
  });
  if (agentHeaderLayout.title.right > agentHeaderLayout.state.left || agentHeaderLayout.state.right > agentHeaderLayout.expand.left) throw new Error('Mobile workflow header text overlaps the run status or expand control');
  await page.goto(new URL('/products/', base).href, { waitUntil: 'networkidle2' });
  await page.$eval('#mobile-menu-toggle', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('#mobile-menu')?.hidden);
  await page.$eval('.mobile-menu-section summary', (summary) => summary.click());
  const mobileLinks = await page.$$eval('#mobile-menu .mobile-nav-link', (links) => links.length);
  if (mobileLinks < 8) throw new Error(`Mobile navigation links are missing (${mobileLinks})`);

  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(`PASS ${routes.length} routes at desktop/tablet/mobile (${routes.length * 3} screenshots), product menu hover/navigation, both demos, approval/export controls, Escape dialog close, legacy anchor + Back, mobile drawer; no clipping, broken images or browser errors. Screenshots: ${output}`);
} finally { await browser.close(); }
