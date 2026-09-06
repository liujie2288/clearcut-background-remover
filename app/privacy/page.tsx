import type { Metadata } from 'next';
import App from '@/src/App';

export const metadata: Metadata = { title: 'Privacy', description: 'How Clearcut keeps image processing private and local.', alternates: { canonical: '/privacy/' } };
export default function PrivacyPage() { return <App page="privacy" />; }
