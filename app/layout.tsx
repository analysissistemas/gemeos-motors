import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gêmeos Motors — Sistema", template: "%s · Gêmeos Motors" },
  description: "Sistema de gestão da Gêmeos Motors: atendimento, funil, vendas, estoque e assistência.",
  icons: { icon: [{ url: "/favicon.ico?v=2", sizes: "16x16 32x32 48x48" }, { url: "/social/icone-32.png?v=2", type: "image/png", sizes: "32x32" }], apple: "/social/icone-180.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0a0a0a",
};

/* Aplica o tema salvo ANTES da primeira pintura: sem isso a tela abre escura
   e pisca para clara em quem escolheu o claro. */
const scriptTema = `try{var t=localStorage.getItem("gm-tema");if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          /* à direita, abaixo da barra do topo: no centro do topo os avisos cobriam os botões do Atendimento (simulador) e
             embaixo cobririam o microfone/enviar da conversa (07/10/2026) */
          position="top-right"
          offset={{ top: 140, right: 24 }}
          toastOptions={{
            style: {
              background: "var(--elevado)",
              color: "var(--ink)",
              border: "1px solid var(--linha-forte)",
            },
          }}
        />
      </body>
    </html>
  );
}
