import type { Metadata, Viewport } from 'next';
import '../src/styles.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clearcut.tools';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Free Image Background Remover — Clearcut', template: '%s — Clearcut' },
  description: 'Remove image backgrounds free in your browser. Private, fast, no signup and no watermark.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Free Image Background Remover',
    description: 'Remove backgrounds locally in your browser. No uploads, signup, or watermark.',
    url: '/',
    siteName: 'Clearcut',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Free Image Background Remover', description: 'Private browser background removal.' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f5f0' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
