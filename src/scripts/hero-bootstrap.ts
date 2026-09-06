import type { HeroRenderer } from './hero-renderer';

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
class LatentsigHeroScene extends HTMLElement {
  private cleanup?: () => void;
  connectedCallback() {
    if (this.cleanup) return;
    const controller = new AbortController();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = matchMedia('(forced-colors: active)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const motionButton = this.closest('.observatory-hero')!.querySelector<HTMLButtonElement>('.hero-motion')!;
    let renderer: HeroRenderer | undefined;
    let intersecting = false, loading = false, paused = false, failed = false;
    let idle = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const conservative = () => media.matches || forcedColors.matches || Boolean(connection?.saveData) || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
    const resetStory = () => {
      this.closest('.observatory-hero')?.querySelectorAll<HTMLElement>('[data-story]').forEach((story, i) => { story.style.opacity = i === 0 ? '1' : '0'; story.style.visibility = i === 0 ? 'visible' : 'hidden'; });
      this.closest('.observatory-hero')?.querySelectorAll<HTMLElement>('[data-chapter]').forEach((marker, i) => marker.dataset.active = String(i === 0));
    };
    const sync = () => {
      const allowed = !conservative();
      renderer?.setActive(intersecting && !document.hidden && allowed);
      motionButton.hidden = !renderer || !allowed || failed;
      if (!allowed) { this.dataset.state = 'poster'; resetStory(); }
      else if (renderer) this.dataset.state = paused ? 'paused' : 'ready';
      if (allowed && intersecting && !document.hidden && !renderer && !loading && !failed) schedule();
    };
    const start = async () => {
      idle = 0; timer = undefined;
      if (controller.signal.aborted || !intersecting || document.hidden || conservative() || renderer || loading || failed) return;
      loading = true;
      try {
        const { createHeroRenderer } = await import('./hero-renderer');
        if (controller.signal.aborted || conservative()) return;
        renderer = await createHeroRenderer(this.querySelector<HTMLElement>('.hero-canvas')!, this.dataset.model!, controller.signal);
        if (controller.signal.aborted) { renderer.dispose(); return; }
        renderer.setPaused(paused);
        // Development measurements are never exposed in the production bundle.
        if (import.meta.env.DEV) (this as HTMLElement & { heroDebug?: unknown }).heroDebug = renderer.debug;
        this.dataset.state = paused ? 'paused' : 'ready';
        sync();
      } catch (error) {
        if (!controller.signal.aborted) { failed = true; this.dataset.state = 'fallback'; motionButton.hidden = true; resetStory(); if (import.meta.env.DEV) console.warn('Hero uses its static fallback:', error); }
      } finally { loading = false; }
    };
    const schedule = () => {
      if (idle || timer) return;
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => void start(), { timeout: 1000 });
      else timer = setTimeout(() => void start(), 120);
    };
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting && entry.intersectionRatio > .04; sync(); }, { threshold: [0, .04] });
    observer.observe(this);
    const toggle = () => {
      paused = !paused; renderer?.setPaused(paused);
      motionButton.dataset.paused = String(paused);
      motionButton.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
      motionButton.querySelector('.motion-label')!.textContent = paused ? 'Resume animation' : 'Pause animation'; sync();
    };
    const failedRenderer = () => { failed = true; renderer = undefined; this.dataset.state = 'fallback'; motionButton.hidden = true; resetStory(); };
    this.addEventListener('hero-renderer-failed', failedRenderer);
    motionButton.addEventListener('click', toggle);
    document.addEventListener('visibilitychange', sync);
    media.addEventListener('change', sync);
    forcedColors.addEventListener('change', sync);
    connection?.addEventListener('change', sync);
    this.cleanup = () => {
      controller.abort(); observer.disconnect(); if (idle) window.cancelIdleCallback(idle); clearTimeout(timer);
      this.removeEventListener('hero-renderer-failed', failedRenderer);
      motionButton.removeEventListener('click', toggle); document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync); forcedColors.removeEventListener('change', sync); connection?.removeEventListener('change', sync);
      renderer?.dispose(); renderer = undefined; this.cleanup = undefined;
    };
  }
  disconnectedCallback() { this.cleanup?.(); }
}
if (!customElements.get('latentsig-hero-scene')) customElements.define('latentsig-hero-scene', LatentsigHeroScene);
