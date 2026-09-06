# Accessibility, mobile and frontend review

Scope: local Latentsig landing page, animated hero, shared navigation/footer and loading behavior. Nothing deployed. Review uses automated axe checks plus keyboard, reflow, motion, failure-path and browser layout checks; this is not a claim of complete WCAG conformance.

Reference criteria:
- [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [Minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Disclosure navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)
- [Tailwind production guidance](https://v3.tailwindcss.com/docs/installation/play-cdn)

Initial source findings: changing screen-reader content during the automatic tour; no skip link; undersized/poorly discoverable pause control; missing menu expanded state, Escape handling and constrained-height scrolling; cramped tablet header; fixed mobile hero geometry that cannot grow with text; squashed mobile logo; site-wide smooth scrolling without reduced-motion override; browser-side development CSS compiler; renderer quality settings fixed to the initial viewport.

Validation results and fixes are recorded below after implementation.

## Fixed

- Added a keyboard skip link and consistent visible focus outlines.
- Kept the full hero narrative in a stable accessibility tree; the automatic visual captions no longer replace the text a screen reader is reading. Decorative icons and animated layer labels are excluded from that tree.
- Made the pause control visibly labeled and at least 44 × 44 CSS pixels. Space/Enter work, and pausing persists across scrolling and visibility changes. The automatic loop still starts without a film button.
- Added navigation expanded/current-page states, Escape-to-close with focus restoration, outside/focus dismissal and scrollable menus in short viewports. Tablet widths use the compact navigation.
- Corrected mobile logo proportions and intrinsic image dimensions.
- Replaced the fixed mobile hero height with content-driven grid rows. Phones and portrait tablets stack the copy above the scene. Chapter markers, long headings and the decorative grid reflow at increased text sizes.
- Strengthened the text overlay background and industry-label contrast. Fixed footer heading order and enlarged its icon links.
- Honored reduced-motion and forced-colors preferences and disabled smooth scrolling/transition effects in reduced-motion mode.
- Added a correctly framed mobile WebP fallback (12,242 bytes); the desktop fallback is 50,612 bytes. Text, links, styling and mobile navigation remain usable with JavaScript disabled or the 3D model unavailable.
- Replaced the Tailwind development CDN compiler with build-time CSS, retaining the existing design tokens and adding fallback fonts and font-connection hints. Production HTML no longer requests the Tailwind CDN.
- Recalculate rendering limits when the viewport changes; narrow screens cap DPR at 1 and target 30 fps. Off-screen/hidden-tab suspension remains in place. Repeated unchanged caption styles no longer trigger needless writes.
- Added reproducible root-project audit and regression commands.

## Validation

| Check | Result |
| --- | --- |
| Production build | Passed; 13 pages |
| Strict hero TypeScript check | Passed |
| axe-core 4.13.0: WCAG A/AA through 2.2 plus best-practice tags | Zero detected violations at 1440 × 960, 320 × 740, 390 × 844, 768 × 1024, 1024 × 768 and 667 × 375 |
| Keyboard skip, navigation, Escape, focus indication and pause | Passed |
| Accessibility tree retains every chapter across visual changes | Passed |
| 200% root text size at 320 px, including increased text spacing | No horizontal overflow or overlap between copy and scene |
| Landscape menu | Scrolls within the viewport; final link reachable |
| JavaScript disabled | Styled content, poster and navigation available |
| Model request returns 503 | Static fallback and links remain usable |
| Reduced-motion changed while running | Stops rendering and resets to static copy; resuming preference works |
| Desktop resized to phone | Rendering budget switches to 30 fps / DPR ≤ 1 |
| Camera, captions, unfold/reassembly, loop, pause, viewport suspension and context loss | Regression suite passed |
| Navigation/footer destinations and lower-section headings | Preserved |

The generated homepage links approximately 75 KB of local CSS (about 17.3 KB gzip), including shared site styles and KaTeX. Gzip sizes are estimates; actual transfer depends on hosting compression. The deferred renderer remains a substantial module (about 155 KB gzip) and still triggers Vite's size advisory. It is intentionally excluded from reduced-motion/data-saving startup.

Reports: `accessibility-before.json`, `accessibility-after.json`, `accessibility-behavior.json`, and `../../scripts/hero/validation.json`. The original source hash fixture is retained for history; navigation/footer changes in this review are intentional, so the current regression check verifies destinations and section headings instead of requiring byte-identical markup.

## Reproduce

Run `npm run dev -- --host 127.0.0.1 --port 4321` in one terminal. Then use `npm run build`, `npm run check:hero`, `npm run test:a11y`, and `npm run test:hero`. Browser checks default to the installed macOS Chrome binary; set `CHROME_PATH` to use another Chrome installation. Run browser suites sequentially for consistent timing.

## Limits

Tests used desktop Chrome and emulated viewports on this Mac, with accessibility-tree inspection rather than a person navigating VoiceOver or TalkBack. No physical phone, iOS Safari, Android browser or screen-reader speech session was tested. Automated scans cannot establish full WCAG conformance; dynamic canvas contrast and cognition/motion comfort still warrant human review. Production Core Web Vitals were not measured. Fonts still come from Google Fonts. No deployment was performed.
