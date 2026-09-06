import { IMAGE_LIMITS } from '../config';
import { RemovalError } from '../types';

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateFile(file: File): void {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new RemovalError('UNSUPPORTED_FORMAT', 'Please choose a JPG, PNG, or WebP image.');
  }
  if (file.size > IMAGE_LIMITS.maxFileSize) {
    throw new RemovalError('FILE_TOO_LARGE', 'That image is over 20 MB. Please choose a smaller file.');
  }
}

export async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (
      dimensions.width > IMAGE_LIMITS.maxWidth ||
      dimensions.height > IMAGE_LIMITS.maxHeight ||
      dimensions.width * dimensions.height > IMAGE_LIMITS.maxPixels
    ) {
      throw new RemovalError('IMAGE_TOO_LARGE', 'This image is too large for reliable browser processing.');
    }
    return dimensions;
  } catch (error) {
    if (error instanceof RemovalError) throw error;
    throw new RemovalError('DECODE_FAILED', 'We could not read that image. Try exporting it again.');
  }
}

export function outputFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'image';
  return `${base}-no-bg.png`;
}

export function bucketFileSize(bytes: number): string {
  if (bytes < 1_000_000) return '<1MB';
  if (bytes < 5_000_000) return '1-5MB';
  if (bytes < 10_000_000) return '5-10MB';
  return '10-20MB';
}

export function bucketPixels(width: number, height: number): string {
  const pixels = width * height;
  if (pixels < 1_000_000) return '<1MP';
  if (pixels < 4_000_000) return '1-4MP';
  if (pixels < 12_000_000) return '4-12MP';
  return '12MP+';
}
