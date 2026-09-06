# Clearcut Background Remover — Product Requirements

Version: 1.0  
Status: implemented MVP

## 1. Goal

Validate an SEO-led, privacy-first image tool with one job: upload one image, remove its background locally, inspect the result, and download a transparent PNG.

North-star metric: visitor-to-download conversion. Supporting metrics: upload rate, removal success rate, and second-image rate.

## 2. Audience and promise

The first release serves general English-speaking users, with emphasis on people, products, pets, and everyday objects.

Promise order: privacy, simplicity, free use, AI. The page may say “free to use,” “no signup,” and “no watermark,” but must not promise “free forever,” “unlimited forever,” or perfect results.

## 3. Core journey

1. Visit `/` and immediately see the tool.
2. Select, drop, paste, or try the bundled sample image.
3. See understandable model preparation progress on first use.
4. See background-removal progress without technical jargon.
5. Compare Original and Removed in place.
6. Manually download a transparent PNG.
7. Optionally give non-image feedback or remove another image.

## 4. Functional requirements

- Accept one JPG/JPEG, PNG, or WebP image through file picker, drag-and-drop, or clipboard.
- Reject unsupported types, files over 20 MB, dimensions over 10,000 px on either side, or more than 40 MP.
- Run inference in the browser and preserve original output dimensions where practical.
- Prefer WebGPU, automatically fall back to WASM, and keep model work in a Web Worker.
- Show idle, image loading, model preparation, processing, success, and error states.
- Show a checkerboard result preview with Original/Removed controls.
- Download as `{original-name}-no-bg.png`; do not auto-download.
- Reset image memory and object URLs on “Remove another image” while retaining the loaded model.
- Provide lightweight result feedback without asking for or sending the image.
- Provide `/privacy` and `/terms` content plus an email contact.

## 5. Page content

Home order: minimal header; Hero + Tool; trust signals; How It Works; four Use Cases; Why Choose Us; 6–8 FAQs; footer.

Primary copy:

- H1: “Free Image Background Remover”
- Supporting line: “Remove backgrounds instantly in your browser. Private, fast, and powered by AI.”
- CTA: “Upload image”
- Trust: private processing, images never leave the device, no signup, no watermark.

## 6. Privacy and analytics

User image bytes, thumbnails, filenames, EXIF, hashes, inferred content, and output images must never be sent to analytics or a cloud inference endpoint. The only permitted network requests during processing are static application, runtime, and model assets.

Events are limited to `page_view`, `upload_started`, `upload_success`, `upload_rejected`, `model_load_started`, `model_ready`, `removal_started`, `removal_success`, `removal_failed`, `download_clicked`, `remove_another_clicked`, `sample_image_used`, and non-image feedback category. Metadata must be coarse buckets plus runtime and durations.

## 7. Accessibility and responsive requirements

- All workflows must work by keyboard, have visible focus, and expose live progress/errors.
- Controls meet a 44 px touch target; text and controls retain readable contrast.
- The core flow must work from 320 px mobile width through desktop.
- Motion honors `prefers-reduced-motion`.

## 8. Out of scope

Accounts, payments, subscriptions, credits, batch processing, history, manual masking, editing, crop/resize, background replacement/generation, HEIC, URL import, alternate export formats, cloud inference, public API, admin UI, and programmatic SEO pages.

## 9. Acceptance

- Supported input can traverse the complete journey and produce a transparent PNG.
- Unsupported/oversized input produces a recoverable, human-readable error.
- WebGPU is attempted first and WASM is used if unavailable or initialization fails.
- No user image leaves the browser.
- First-load progress, cached reuse, reset, feedback, privacy, and terms flows are usable.
- Type checks, lint, unit/component tests, and production build pass.
