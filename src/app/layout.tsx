import './globals.css';

export const metadata = {
  title: 'ClipChron',
  description: 'Personal bookmark archive',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
