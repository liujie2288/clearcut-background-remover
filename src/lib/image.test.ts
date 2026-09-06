import { describe, expect, it } from 'vitest';
import { outputFilename, validateFile } from './image';

describe('image helpers', () => {
  it('accepts supported images', () => {
    expect(() => validateFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).not.toThrow();
  });
  it('rejects unsupported files', () => {
    expect(() => validateFile(new File(['x'], 'photo.gif', { type: 'image/gif' }))).toThrow(/JPG/);
  });
  it('creates a safe PNG download name', () => {
    expect(outputFilename('my photo!.jpeg')).toBe('my photo-no-bg.png');
  });
});
