// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'Attendance Portal',
  description: 'Biometric mobile attendance system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}