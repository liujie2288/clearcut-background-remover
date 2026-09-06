# Clearcut Background Remover — Technical Specification

## 1. Stack and boundaries

- Next.js 16 App Router, React 19, TypeScript, plain CSS.
- Static export (`output: export`) produces crawlable HTML for `/`, `/privacy/`, and `/terms/`.
- Cloudflare Pages serves the generated `out/` directory; there is no image-processing backend.
- `@huggingface/transformers` loaded only inside a module Web Worker.
- `Xenova/modnet`, the Apache-2.0 model used by the official Transformers.js browser WebGPU background-removal example.
- No application backend. Production should mirror versioned model assets to an owned CDN after benchmark approval.

The UI depends on `BackgroundRemovalEngine`, not Transformers.js model details. `WorkerBackgroundRemovalEngine` owns the worker lifecycle, request correlation, timeout, state, runtime selection, and disposal.

## 2. State model

`ToolState = idle | loading-image | preparing-model | processing | success | error`.

Only one active request exists. A new image revokes prior preview/result URLs. Model state remains warm across image resets and is released on application teardown.

Worker protocol rule: one request ID has exactly one terminal response (`loaded`, `result`, or `error`). Progress messages are non-terminal. A removal request must never emit a second model-loaded response.

## 3. Inference sequence

1. Validate MIME and file size.
2. Decode to verify dimensions and pixels.
3. Transfer the original file to the Worker as an `ArrayBuffer`.
4. Worker dynamically imports Transformers.js and loads the model with `device: webgpu` when `navigator.gpu` exists.
5. If model creation or WebGPU inference fails, rebuild with `device: wasm` and retry once.
6. Run the `background-removal` pipeline and transfer its RGBA pixels to the main thread.
7. Encode with a regular browser Canvas, verify the PNG signature and browser decoding, then create the preview/download URL.

Transformers.js/ONNX Runtime browser caching handles repeat model assets. Progress callbacks are aggregated by downloaded file size and sent to the UI.

## 4. Engine contract

```ts
interface BackgroundRemovalEngine {
  load(onProgress?: (progress: number) => void): Promise<void>;
  remove(input: ArrayBuffer, mimeType: string): Promise<RemovalResult>;
  getStatus(): EngineStatus;
  getCapabilities(): EngineCapabilities;
  dispose(): Promise<void>;
}
```

`RemovalResult` includes PNG bytes, dimensions, runtime, and processing duration. It never includes analytics payloads.

## 5. Error taxonomy

Input errors: `UNSUPPORTED_FORMAT`, `FILE_TOO_LARGE`, `IMAGE_TOO_LARGE`, `DECODE_FAILED`.

Engine errors: `MODEL_LOAD_FAILED`, `OUT_OF_MEMORY`, `INFERENCE_FAILED`, `WORKER_FAILED`, `TIMEOUT`.

Technical detail is retained only in local console diagnostics. User copy explains a recovery action.

## 6. Privacy and security

- No `fetch`, XHR, form submission, or analytics call receives the input/output buffer or object URL.
- Analytics adapter accepts only an allowlisted event name and scalar, coarse metadata.
- Content Security Policy should be added at hosting level after the final model/CDN origin is selected.
- External model origin is a development/MVP bootstrap dependency, not a cloud inference service.

## 7. Performance decisions

- Heavy AI dependency is absent from the main bundle and dynamically imported in the worker.
- Model loading begins on first user intent rather than page load, protecting Core Web Vitals.
- Inference is off-main-thread; main-thread work is limited to validation, decode, preview, and download.
- Worker and model are reused between jobs.
- Lower inference resolution is delegated to the selected model processor; output is composited/encoded to original dimensions by the background-removal pipeline where supported.

## 8. SEO and Cloudflare deployment

- Next.js prerenders the complete landing-page copy and legal pages into HTML.
- Metadata API supplies title, description, canonical, robots, Open Graph, and Twitter fields.
- `/robots.txt` and `/sitemap.xml` are statically generated.
- The homepage includes JSON-LD for the free web application and FAQ content.
- Set `NEXT_PUBLIC_SITE_URL` to the final production origin before building.
- Local Cloudflare verification: `npm run preview:cloudflare`.
- Production deployment: `npm run deploy:cloudflare`. This requires an authenticated Wrangler session and an existing or creatable `clearcut` Pages project.

## 9. Verification

- Unit: input validation, filename sanitization, analytics allowlist.
- Component: idle tool content and privacy copy.
- Static: TypeScript strict mode and ESLint.
- Build: production bundle completes; the heavy model runtime is isolated in a worker chunk.
- Browser: upload/drop/paste affordances, sample flow, progress/error state, responsive layout, legal routes.

## 10. Known release gate

MODNet is a working portrait-first MVP baseline, not the final general-purpose benchmark decision. Before paid/commercial launch, run the 40–60 image benchmark described in the source specification across Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome; confirm weight provenance/license, product/pet quality, mobile OOM rate, WebGPU/WASM quality parity, CDN hosting, and cache headers.
