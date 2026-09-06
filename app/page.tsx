import App from '@/src/App';

const faq = [
  ['Is this background remover free?', 'Yes. You can remove a single image background for free, with no signup and no watermark.'],
  ['Are my images uploaded?', 'No. Your image is processed locally in your browser and never sent to our servers.'],
  ['Which formats are supported?', 'JPG, JPEG, PNG, and WebP images are supported.'],
  ['Does it work on mobile?', 'Yes, on modern mobile browsers. Processing speed depends on your device and available memory.'],
  ['Will the output keep its original resolution?', 'We preserve the original output size where possible while using an optimized size internally for AI processing.'],
  ['What images work best?', 'People, products, pets, and clearly visible objects work best.'],
];

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Clearcut Image Background Remover',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any modern web browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    mainEntity: faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })),
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /><App /></>;
}
