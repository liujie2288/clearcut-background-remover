'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, ChevronDown, Download, ImageIcon, LockKeyhole, RotateCcw,
  ShieldCheck, Sparkles, Upload, WandSparkles, X,
} from 'lucide-react';
import { CONTACT_EMAIL } from './config';
import { WorkerBackgroundRemovalEngine } from './engine/workerEngine';
import { track } from './lib/analytics';
import { bucketFileSize, bucketPixels, outputFilename, readDimensions, validateFile } from './lib/image';
import type { BackgroundRemovalEngine, Runtime, ToolState } from './types';
import { RemovalError } from './types';

const HOW_IT_WORKS = [
  ['01', 'Choose an image', 'Upload, drop, or paste a JPG, PNG, or WebP.'],
  ['02', 'AI removes the background', 'Everything happens privately, right in your browser.'],
  ['03', 'Download your PNG', 'Check the result, then save it without a watermark.'],
];

const USE_CASES = [
  ['People', 'Clean portraits for profiles, presentations, and creative projects.', 'portrait'],
  ['Products', 'Create distraction-free product shots for shops and listings.', 'product'],
  ['Pets', 'Keep the whiskers, fur, and personality—lose the room behind them.', 'pet'],
  ['Everyday objects', 'Isolate almost anything for collages, documents, or designs.', 'object'],
];

const FAQS = [
  ['Is this background remover free?', 'Yes. You can remove a single image background for free, with no signup and no watermark.'],
  ['Are my images uploaded?', 'No. Your image is processed locally in your browser and never sent to our servers.'],
  ['Which formats are supported?', 'JPG, JPEG, PNG, and WebP images are supported.'],
  ['Does it work on mobile?', 'Yes, on modern mobile browsers. Processing speed depends on your device and available memory.'],
  ['Will the output keep its original resolution?', 'We preserve the original output size where possible while using an optimized size internally for AI processing.'],
  ['What images work best?', 'People, products, pets, and clearly visible objects work best. Transparent or extremely intricate subjects may be less accurate.'],
  ['Why is the first removal slower?', 'The private AI model must load the first time. Your browser can cache it, so later removals are usually faster.'],
  ['Can I remove multiple backgrounds at once?', 'The current version handles one image at a time. Batch processing is not part of this release.'],
];

type SelectedImage = { file: File; originalUrl: string; name: string; width: number; height: number };

function Tool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<BackgroundRemovalEngine | null>(null);
  const [state, setState] = useState<ToolState>('idle');
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'original' | 'removed'>('removed');
  const [dragging, setDragging] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const clearUrls = () => {
    if (image?.originalUrl) URL.revokeObjectURL(image.originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (file) void processFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  useEffect(() => () => {
    engineRef.current?.dispose();
  }, []);

  async function processFile(file: File) {
    clearUrls();
    setState('loading-image');
    setError('');
    setResultUrl(null);
    setShowFeedback(false);
    setFeedbackDone(false);
    track('upload_started');
    try {
      validateFile(file);
      const dimensions = await readDimensions(file);
      const originalUrl = URL.createObjectURL(file);
      setImage({ file, originalUrl, name: file.name, ...dimensions });
      track('upload_success', { file_size: bucketFileSize(file.size), pixels: bucketPixels(dimensions.width, dimensions.height), type: file.type });
      const engine = engineRef.current ?? new WorkerBackgroundRemovalEngine();
      engineRef.current = engine;
      if (engine.getStatus().state !== 'ready') {
        setState('preparing-model');
        track('model_load_started', { webgpu_available: engine.getCapabilities().webgpu });
        await engine.load(setProgress);
        track('model_ready', { runtime: engine.getStatus().runtime ?? 'wasm' });
      }
      setState('processing');
      track('removal_started');
      const removal = await engine.remove(await file.arrayBuffer(), file.type);
      setRuntime(removal.runtime);
      setResultUrl(await toDataUrl(new Blob([removal.data], { type: 'image/png' })));
      setState('success');
      setView('removed');
      track('removal_success', { runtime: removal.runtime, duration_ms: Math.round(removal.durationMs) });
    } catch (caught) {
      const message = caught instanceof RemovalError ? caught.message : 'Something went wrong. Please try again.';
      setError(message);
      setState('error');
      track(caught instanceof RemovalError && ['UNSUPPORTED_FORMAT', 'FILE_TOO_LARGE', 'IMAGE_TOO_LARGE', 'DECODE_FAILED'].includes(caught.code) ? 'upload_rejected' : 'removal_failed', {
        reason: caught instanceof RemovalError ? caught.code : 'UNKNOWN',
      });
    }
  }

  async function trySample() {
    track('sample_image_used');
    try {
      const response = await fetch('/sample-person.png', { cache: 'force-cache' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        throw new Error('Sample image is unavailable.');
      }
      await processFile(new File([await response.arrayBuffer()], 'sample-portrait.png', { type: 'image/png' }));
    } catch {
      setError('The sample image could not be loaded. Please try again.');
      setState('error');
    }
  }

  function reset() {
    clearUrls();
    setImage(null);
    setResultUrl(null);
    setError('');
    setState('idle');
    setProgress(0);
    setShowFeedback(false);
    track('remove_another_clicked');
  }

  function download() {
    if (!resultUrl || !image) return;
    const anchor = document.createElement('a');
    anchor.href = resultUrl;
    anchor.download = outputFilename(image.name);
    anchor.click();
    track('download_clicked', { runtime: runtime ?? 'unknown' });
  }

  if (state === 'success' && image && resultUrl) {
    return (
      <div className="tool-card result-card">
        <div className="result-head">
          <div><span className="eyebrow success"><Check size={14} /> Background removed</span><h2>Your image is ready</h2></div>
          <div className="toggle" aria-label="Preview mode">
            <button className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}>Original</button>
            <button className={view === 'removed' ? 'active' : ''} onClick={() => setView('removed')}>Removed</button>
          </div>
        </div>
        <div className={`preview ${view === 'removed' ? 'checkerboard' : ''}`}>
          <img src={view === 'removed' ? resultUrl : image.originalUrl} alt={`${view} preview`} />
        </div>
        <div className="result-actions">
          <button className="button primary" onClick={download}><Download size={18} /> Download PNG</button>
          <button className="button secondary" onClick={reset}><RotateCcw size={17} /> Remove another</button>
        </div>
        <div className="result-meta"><span>{image.width} × {image.height}px</span><span>•</span><span>{runtime?.toUpperCase()} processing</span></div>
        {!feedbackDone && (
          <div className="feedback">
            {!showFeedback ? <button className="text-button" onClick={() => setShowFeedback(true)}>Result not quite right?</button> : (
              <div><p>What went wrong?</p><div className="feedback-options">{['Subject missing', 'Background remains', 'Hair or fur', 'Edges', 'Other'].map((label) => <button key={label} onClick={() => { track('feedback_submitted', { category: label }); setFeedbackDone(true); }}>{label}</button>)}</div></div>
            )}
          </div>
        )}
        {feedbackDone && <p className="thanks">Thanks—your feedback was recorded without your image.</p>}
      </div>
    );
  }

  if (state === 'preparing-model' || state === 'processing' || state === 'loading-image') {
    const preparing = state === 'preparing-model';
    return (
      <div className="tool-card processing-card" aria-live="polite">
        <div className="processing-visual"><div className="pulse-ring"><WandSparkles /></div></div>
        <span className="eyebrow">PRIVATE ON-DEVICE AI</span>
        <h2>{preparing ? 'Preparing your private AI…' : state === 'processing' ? 'Removing the background…' : 'Reading your image…'}</h2>
        <p>{preparing ? 'The first time takes a little longer. The model stays in your browser cache.' : 'Your image is being processed on this device.'}</p>
        {preparing && <div className="progress-wrap"><div className="progress-label"><span>Loading model</span><span>{progress}%</span></div><div className="progress"><span style={{ width: `${progress}%` }} /></div></div>}
        <div className="privacy-note"><LockKeyhole size={15} /> Your image never leaves this device</div>
      </div>
    );
  }

  return (
    <div
      className={`tool-card upload-card ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void processFile(file); }}
    >
      {state === 'error' && <div className="error-banner" role="alert"><X size={17} /><span>{error}</span><button onClick={() => setState('idle')}>Dismiss</button></div>}
      <div className="upload-icon"><ImageIcon /></div>
      <h2>Drop your image here</h2>
      <p>or choose a file from your device</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void processFile(file); event.target.value = ''; }} />
      <button className="button primary upload-button" onClick={() => inputRef.current?.click()}><Upload size={18} /> Upload image</button>
      <div className="upload-hint">JPG, PNG or WebP · Max 20 MB · You can also paste</div>
      <div className="sample-row"><span>Don’t have an image?</span><button className="text-button" onClick={() => void trySample()}>Try our sample <ArrowRight size={14} /></button></div>
    </div>
  );
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image data.')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read image data.')));
    reader.readAsDataURL(blob);
  });
}

function Home() {
  return (
    <>
      <main>
        <section className="hero" id="tool">
          <div className="hero-copy"><div className="pill"><ShieldCheck size={15} /> 100% private browser processing</div><h1>Free Image<br /><em>Background Remover</em></h1><p>Remove backgrounds instantly in your browser. Private, fast, and powered by AI.</p></div>
          <Tool />
          <div className="trust-row">{[['shield', 'Private processing'], ['lock', 'Images stay on device'], ['check', 'No signup'], ['sparkles', 'No watermark']].map(([icon, label]) => <div key={label}>{icon === 'shield' ? <ShieldCheck /> : icon === 'lock' ? <LockKeyhole /> : icon === 'check' ? <Check /> : <Sparkles />}<span>{label}</span></div>)}</div>
        </section>

        <section className="section" id="how-it-works"><div className="section-heading"><span className="eyebrow">SIMPLE BY DESIGN</span><h2>Three steps. Zero uploads.</h2><p>No complicated editor, no account, no learning curve.</p></div><div className="steps">{HOW_IT_WORKS.map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>

        <section className="section use-section"><div className="section-heading left"><span className="eyebrow">MADE FOR REAL LIFE</span><h2>One tool, countless clean cuts.</h2></div><div className="use-grid">{USE_CASES.map(([title, body, className]) => <article className={`use-card ${className}`} key={title}><div className="use-art" aria-hidden="true"><span /></div><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></section>

        <section className="section why"><div className="why-copy"><span className="eyebrow">WHY CLEARCUT</span><h2>Your images are yours.<br />They should stay that way.</h2><p>Most background removers send your photos to a server. Clearcut runs the AI locally on your device, so private really means private.</p><a className="text-link" href="/privacy">Read our privacy promise <ArrowRight size={15} /></a></div><div className="benefits">{[['01', 'Private by default', 'Images never leave your browser.'], ['02', 'Effortlessly simple', 'No signup. No complicated editor.'], ['03', 'Clean, useful results', 'Transparent PNGs without watermarks.'], ['04', 'Built for repeat use', 'The AI is cached after your first removal.']].map(([n, t, b]) => <div key={n}><span>{n}</span><div><h3>{t}</h3><p>{b}</p></div></div>)}</div></section>

        <section className="section faq" id="faq"><div className="section-heading"><span className="eyebrow">GOOD TO KNOW</span><h2>Questions, answered.</h2></div><div className="faq-list">{FAQS.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<ChevronDown /></summary><p>{answer}</p></details>)}</div></section>

        <section className="final-cta"><Sparkles /><h2>Ready for a cleaner image?</h2><p>No uploads. No signup. Just a transparent background.</p><a className="button light" href="#tool">Remove a background <ArrowRight size={18} /></a></section>
      </main>
    </>
  );
}

function Legal({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy';
  return <main className="legal"><a href="/" className="back-link">← Back to Clearcut</a><span className="eyebrow">{privacy ? 'PRIVACY PROMISE' : 'TERMS OF USE'}</span><h1>{privacy ? 'Your images stay yours.' : 'Simple, fair terms.'}</h1><p className="legal-lead">Last updated: September 5, 2026</p>{privacy ? <><h2>Local image processing</h2><p>Images you choose are processed in your browser. We do not upload, store, or receive the original image, result, thumbnail, filename, EXIF data, or image hash.</p><h2>Model downloads</h2><p>Your browser downloads static AI model files so it can process images locally. Those requests do not contain your image.</p><h2>Minimal analytics</h2><p>We may measure coarse events such as a completed removal, processing duration, runtime type, and broad file-size or pixel buckets. We do not include image content or filenames.</p><h2>Contact</h2><p>Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></> : <><h2>Using the service</h2><p>You may use this tool for lawful images you have the right to process. You are responsible for your images and how you use downloaded results.</p><h2>Availability and results</h2><p>The service is provided as available. AI results can be imperfect, especially for transparent or intricate subjects, and should be checked before use.</p><h2>Ownership and privacy</h2><p>You retain rights to your images. Image processing occurs locally; we do not claim ownership of input or output images.</p><h2>Contact</h2><p>Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></>}</main>;
}

export default function App({ page = 'home' }: { page?: 'home' | 'privacy' | 'terms' }) {
  useEffect(() => { track('page_view'); }, []);
  const legal = page !== 'home';
  return (
    <div className="app-shell">
      {!legal && <header><a href="/" className="brand"><span><WandSparkles /></span>clearcut</a><nav><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a href="/privacy">Privacy</a></nav><a className="header-cta" href="#tool">Remove a background</a></header>}
      {page === 'privacy' ? <Legal type="privacy" /> : page === 'terms' ? <Legal type="terms" /> : <Home />}
      {!legal && <footer><a href="/" className="brand"><span><WandSparkles /></span>clearcut</a><p>Private AI image tools, right in your browser.</p><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></div><small>© 2026 Clearcut</small></footer>}
    </div>
  );
}
