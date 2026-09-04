import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Sales Agent — AI Opportunity Finder',
  description:
    'Tell the agent what you sell. It finds the businesses that appear to need it.',
  openGraph: {
    title: 'Sales Agent — AI Opportunity Finder',
    description: 'Tell the agent what you sell. It finds who needs it.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Sales Agent AI opportunity finder' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sales Agent — AI Opportunity Finder',
    description: 'Tell the agent what you sell. It finds who needs it.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
