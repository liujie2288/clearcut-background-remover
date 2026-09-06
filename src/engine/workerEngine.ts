import type {
  BackgroundRemovalEngine, EngineCapabilities, EngineStatus, RemovalResult, Runtime,
} from '../types';
import { RemovalError } from '../types';

type WorkerReply =
  | { type: 'progress'; requestId: number; progress: number }
  | { type: 'loaded'; requestId: number; runtime: Runtime }
  | { type: 'result'; requestId: number; result: RemovalResult }
  | { type: 'error'; requestId: number; code: string; message: string };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  progress?: (value: number) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class WorkerBackgroundRemovalEngine implements BackgroundRemovalEngine {
  private worker: Worker;
  private status: EngineStatus = { state: 'idle' };
  private requestId = 0;
  private pending = new Map<number, Pending>();
  private loadPromise?: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('../workers/backgroundRemoval.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onWorkerError);
  }

  load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.status.state === 'ready') return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.status = { state: 'loading', progress: 0 };
    this.loadPromise = this.send<{ runtime: Runtime }>('load', {}, onProgress, 10 * 60_000)
      .then(({ runtime }) => { this.status = { state: 'ready', progress: 100, runtime }; })
      .catch((error) => {
        this.status = { state: 'error' };
        this.loadPromise = undefined;
        throw error;
      });
    return this.loadPromise;
  }

  async remove(input: ArrayBuffer, mimeType: string): Promise<RemovalResult> {
    await this.load();
    this.status = { ...this.status, state: 'processing' };
    try {
      const result = await this.send<RemovalResult>('remove', { input, mimeType }, undefined, 5 * 60_000, [input]);
      this.status = { state: 'ready', runtime: result.runtime };
      return result;
    } catch (error) {
      this.status = { state: 'error', runtime: this.status.runtime };
      throw error;
    }
  }

  getStatus(): EngineStatus { return { ...this.status }; }

  getCapabilities(): EngineCapabilities {
    return { webgpu: 'gpu' in navigator, wasm: true, runtime: this.status.runtime, maxRecommendedPixels: 40_000_000 };
  }

  async dispose(): Promise<void> {
    this.worker.postMessage({ type: 'dispose' });
    this.worker.terminate();
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new RemovalError('WORKER_FAILED', 'The background removal worker was stopped.'));
    });
    this.pending.clear();
  }

  private send<T>(type: string, data: object, progress?: (value: number) => void, timeout = 300_000, transfer: Transferable[] = []): Promise<T> {
    const requestId = ++this.requestId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RemovalError('TIMEOUT', 'Processing took too long. Please try a smaller image.'));
      }, timeout);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, progress, timer });
      this.worker.postMessage({ type, requestId, ...data }, transfer);
    });
  }

  private onMessage = (event: MessageEvent<WorkerReply>) => {
    const message = event.data;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    if (message.type === 'progress') {
      this.status = { ...this.status, progress: message.progress };
      pending.progress?.(message.progress);
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    if (message.type === 'error') {
      const code = message.code === 'OUT_OF_MEMORY' ? 'OUT_OF_MEMORY' : this.status.state === 'loading' ? 'MODEL_LOAD_FAILED' : 'INFERENCE_FAILED';
      pending.reject(new RemovalError(code, message.message));
    } else if (message.type === 'loaded') {
      pending.resolve({ runtime: message.runtime });
    } else {
      void encodePng(message.result.data, message.result.width, message.result.height)
        .then((data) => pending.resolve({ ...message.result, data }))
        .catch(() => pending.reject(new RemovalError('INFERENCE_FAILED', 'The result image could not be created. Please try again.')));
    }
  };

  private onWorkerError = () => {
    const error = new RemovalError('WORKER_FAILED', 'The browser could not start local AI processing.');
    this.pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(error); });
    this.pending.clear();
    this.status = { state: 'error' };
  };
}

async function encodePng(pixels: ArrayBuffer, width: number, height: number): Promise<ArrayBuffer> {
  const expectedBytes = width * height * 4;
  if (pixels.byteLength !== expectedBytes) throw new Error('Invalid RGBA buffer length.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed.')), 'image/png');
  });
  const png = await blob.arrayBuffer();
  const signature = new Uint8Array(png, 0, Math.min(8, png.byteLength));
  const valid = signature.length === 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
  if (!valid) throw new Error('Invalid PNG signature.');
  const bitmap = await createImageBitmap(blob);
  bitmap.close();
  return png;
}
