# Clearcut Background Remover — Delivery Tasks

## Completed for MVP

- [x] Migrate to Next.js 16 App Router with lint, test, and build scripts.
- [x] Define product, technical, privacy, SEO, error, and acceptance requirements.
- [x] Implement explicit single-image tool state machine.
- [x] Implement click, drop, paste, bundled sample, and input validation.
- [x] Add worker-isolated background-removal engine with WebGPU-first/WASM fallback.
- [x] Add real model download progress, processing feedback, engine reuse, and cleanup.
- [x] Add original/removed preview, transparent checkerboard, PNG download, reset, and feedback.
- [x] Build tool-first English landing page, use cases, benefits, FAQ, header, and footer.
- [x] Add statically prerendered privacy and terms routes.
- [x] Add metadata, semantic structure, responsive behavior, focus states, and reduced motion.
- [x] Add privacy-safe analytics adapter and core funnel calls.
- [x] Add automated validation/component tests.
- [x] Validate result pixels and PNG encoding before exposing preview/download.
- [x] Add static metadata, canonical URLs, JSON-LD, robots.txt, and sitemap.xml.
- [x] Add Cloudflare Pages configuration plus local preview and deployment scripts.

## Release gates

- [ ] Run model benchmark on the agreed 40–60 image set and record scenario matrix.
- [ ] Replace the portrait-first MODNet baseline if a benchmarked general-purpose model passes browser constraints.
- [ ] Confirm model weight provenance/license with counsel or project owner before commercial use.
- [ ] Mirror the approved model to versioned owned CDN storage with immutable cache headers.
- [ ] Test real inference and cache behavior on the agreed desktop/mobile browser matrix.
- [ ] Configure an analytics property only after consent/legal requirements are decided.
- [ ] Replace placeholder `hello@clearcut.tools` if the final brand/contact changes.
- [ ] Set final production domain, canonical URL, Search Console, robots.txt, and sitemap.
