import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ProvedorDeAvisos } from "@/components/ui/avisos";
import "./globals.css";

// Fontes servidas pelo próprio portal (nenhuma chamada a servidores de terceiros).
// Atkinson Hyperlegible foi desenhada para pessoas com baixa visão.
const fonteTexto = localFont({
  src: [
    { path: "./fonts/atkinson-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/atkinson-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fonte-texto",
  display: "swap",
});

const fonteTitulo = localFont({
  src: [{ path: "./fonts/bricolage.woff2", weight: "600 800", style: "normal" }],
  variable: "--fonte-titulo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Portal Jardins do Lago", template: "%s · Jardins do Lago" },
  description: "Portal do Residencial Jardins do Lago: contas, visitantes, reservas e comunicados num só lugar.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#12382a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1c15" },
  ],
};

// Aplica o tema escolhido antes de pintar a tela (evita "piscar" claro/escuro).
const scriptTema = `try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${fonteTexto.variable} ${fonteTitulo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <ProvedorDeAvisos>{children}</ProvedorDeAvisos>
      </body>
    </html>
  );
}
