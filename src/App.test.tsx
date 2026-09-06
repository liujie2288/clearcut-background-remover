import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./engine/workerEngine', () => ({ WorkerBackgroundRemovalEngine: vi.fn() }));

describe('home', () => {
  it('presents the primary job and privacy promise', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /free image background remover/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload image/i })).toBeInTheDocument();
    expect(screen.getAllByText(/images stay on device/i).length).toBeGreaterThan(0);
  });
});
