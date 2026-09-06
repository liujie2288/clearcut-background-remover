export type ToolState =
  | 'idle'
  | 'loading-image'
  | 'preparing-model'
  | 'processing'
  | 'success'
  | 'error';

export type Runtime = 'webgpu' | 'wasm';

export type RemovalErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'IMAGE_TOO_LARGE'
  | 'DECODE_FAILED'
  | 'MODEL_LOAD_FAILED'
  | 'OUT_OF_MEMORY'
  | 'INFERENCE_FAILED'
  | 'WORKER_FAILED'
  | 'TIMEOUT';

export class RemovalError extends Error {
  constructor(public readonly code: RemovalErrorCode, message: string) {
    super(message);
    this.name = 'RemovalError';
  }
}

export interface RemovalResult {
  data: ArrayBuffer;
  width: number;
  height: number;
  runtime: Runtime;
  durationMs: number;
}

export interface EngineStatus {
  state: 'idle' | 'loading' | 'ready' | 'processing' | 'error';
  progress?: number;
  runtime?: Runtime;
}

export interface EngineCapabilities {
  webgpu: boolean;
  wasm: boolean;
  runtime?: Runtime;
  maxRecommendedPixels: number;
}

export interface BackgroundRemovalEngine {
  load(onProgress?: (progress: number) => void): Promise<void>;
  remove(input: ArrayBuffer, mimeType: string): Promise<RemovalResult>;
  getStatus(): EngineStatus;
  getCapabilities(): EngineCapabilities;
  dispose(): Promise<void>;
}
