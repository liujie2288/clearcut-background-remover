import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';

afterEach(() => {
  delete window.gtag;
});

describe('analytics', () => {
  it('forwards allowlisted events to gtag', () => {
    window.gtag = vi.fn();
    track('download_clicked', { runtime: 'wasm' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'download_clicked', { runtime: 'wasm' });
  });

  it('drops unknown events', () => {
    window.gtag = vi.fn();
    track('image_filename', { value: 'private-photo.png' });
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
