import type { NextConfig } from "next";

/* A loja do cliente continua sendo o vitrine.html estático, servido de public/.
   O sistema da equipe é o app Next.js em /sistema. Estes redirecionamentos
   mantêm vivos os endereços antigos — o botão "Sistema" da vitrine aponta para
   login.html e, com sessão, para index.html; os dois agora caem no app novo. */
const nextConfig: NextConfig = {
  /* servidor enxuto para o Docker do VPS (EasyPanel); a Vercel ignora */
  output: "standalone",
  serverExternalPackages: ["@react-pdf/renderer"],
  /* anexos do chat (até 2 MB) viajam codificados, ~35% maiores; a Vercel corta em 4,5 MB */
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "4mb" } },
  async redirects() {
    return [
      /* a loja abre no endereço limpo (gemeosmotors.com.br); /vitrine antigo cai nele */
      { source: "/vitrine", destination: "/", permanent: false },
      { source: "/login.html", destination: "/login", permanent: false },
      { source: "/index.html", destination: "/sistema", permanent: false },
    ];
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/vitrine.html" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    const seguranca = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      /* microfone só para o próprio site (gravação de áudio no atendimento) */
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: seguranca },
      /* o sistema nunca é embutido em outro site (evita clique sequestrado) */
      { source: "/sistema/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/login", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
