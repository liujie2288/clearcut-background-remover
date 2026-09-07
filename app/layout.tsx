import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../src/styles.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clearcutai.shop';
const googleAnalyticsId = 'G-VXJ4356NZB';

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
  return (
    <html lang="en">
      <body>{children}</body>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${googleAnalyticsId}', { send_page_view: false });
        `}
      </Script>
    </html>
  );
}
