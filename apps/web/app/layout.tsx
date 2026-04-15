export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <title>SOAPI Generator Demo</title>
      <body style={{ fontFamily: 'ui-sans-serif, system-ui' }}>{children}</body>
    </html>
  );
}