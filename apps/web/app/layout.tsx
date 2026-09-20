export const metadata = {
  title: 'AI Knowledge Base',
  description: 'Enterprise AI Knowledge Base / RAG platform skeleton',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
