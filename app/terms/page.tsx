import type { Metadata } from 'next';
import App from '@/src/App';

export const metadata: Metadata = { title: 'Terms of Use', description: 'Terms for using the Clearcut background remover.', alternates: { canonical: '/terms/' } };
export default function TermsPage() { return <App page="terms" />; }
