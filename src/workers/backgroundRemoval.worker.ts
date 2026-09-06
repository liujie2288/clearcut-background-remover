import { MODEL_ID } from '../config';
import type { Runtime } from '../types';

type RawResult = { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number };
type Segmenter = (input: Blob) => Promise<RawResult[] | RawResult>;

let segmenter: Segmenter | undefined;
let runtime: Runtime | undefined;

function post(type: string, requestId: number, data: object = {}, transfer: Transferable[] = []) {
  self.postMessage({ type, requestId, ...data }, { transfer });
}

async function load(requestId: number): Promise<void> {
  if (segmenter && runtime) {
    post('loaded', requestId, { runtime });
    return;
  }
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;

  const sizes = new Map<string, { loaded: number; total: number }>();
  const progressCallback = (rawEntry: unknown) => {
    const entry = rawEntry as { file?: string; loaded?: number; total?: number; progress?: number };
    if (entry.file && entry.total) sizes.set(entry.file, { loaded: entry.loaded ?? 0, total: entry.total });
    let loaded = 0;
    let total = 0;
    sizes.forEach((value) => { loaded += value.loaded; total += value.total; });
    const progress = total > 0 ? (loaded / total) * 100 : (entry.progress ?? 0);
    post('progress', requestId, { progress: Math.max(0, Math.min(100, Math.round(progress))) });
  };

  const create = async (device: Runtime) => pipeline('background-removal', MODEL_ID, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: progressCallback,
  }) as unknown as Segmenter;

  if ('gpu' in navigator) {
    try {
      segmenter = await create('webgpu');
      runtime = 'webgpu';
    } catch (error) {
      console.warn('WebGPU model initialization failed; using WASM.', error);
    }
  }
  if (!segmenter) {
    segmenter = await create('wasm');
    runtime = 'wasm';
  }
  post('progress', requestId, { progress: 100 });
  post('loaded', requestId, { runtime });
}

async function remove(requestId: number, input: ArrayBuffer, mimeType: string): Promise<void> {
  if (!segmenter || !runtime) throw new Error('The background-removal model is not ready.');
  const started = performance.now();
  const imageBlob = new Blob([input], { type: mimeType });
  let output;
  try {
    output = await segmenter!(imageBlob);
  } catch (error) {
    if (runtime !== 'webgpu') throw error;
    console.warn('WebGPU inference failed; retrying with WASM.', error);
    const { pipeline } = await import('@huggingface/transformers');
    segmenter = await pipeline('background-removal', MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
    }) as unknown as Segmenter;
    runtime = 'wasm';
    output = await segmenter(imageBlob);
  }
  const image = Array.isArray(output) ? output[0] : output;
  if (image.channels !== 4) throw new Error('Expected an RGBA result from the background-removal pipeline.');
  const rgba = new Uint8ClampedArray(image.data);
  const data = rgba.buffer;
  post('result', requestId, {
    result: { data, width: image.width, height: image.height, runtime, durationMs: performance.now() - started },
  }, [data]);
}

self.addEventListener('message', async (event) => {
  const { type, requestId, input, mimeType } = event.data;
  try {
    if (type === 'load') await load(requestId);
    if (type === 'remove') await remove(requestId, input, mimeType);
    if (type === 'dispose') { segmenter = undefined; runtime = undefined; }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local AI processing failed.';
    const code = /memory|allocation|out of bounds/i.test(message) ? 'OUT_OF_MEMORY' : 'FAILED';
    post('error', requestId, { code, message });
  }
});

export {};
