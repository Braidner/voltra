import "./globals.css";
export const metadata = {
  title: "Voltra",
  description: "Локальная карта диска",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
