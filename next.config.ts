import type { NextConfig } from "next";

/* A loja do cliente continua sendo o vitrine.html estático, servido de public/.
   O sistema da equipe é o app Next.js em /sistema. Estes redirecionamentos
   mantêm vivos os endereços antigos — o botão "Sistema" da vitrine aponta para
   login.html e, com sessão, para index.html; os dois agora caem no app novo. */
const nextConfig: NextConfig = {
  /* servidor enxuto para o Docker do VPS (EasyPanel) */
  output: "standalone",
  serverExternalPackages: ["@react-pdf/renderer"],
  /* anexos do chat (até 2 MB) viajam codificados, ~35% maiores que o arquivo */
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
      /* Cache no navegador da loja: sem isso (max-age=0) cada visita perguntava de novo por
         cada foto e script, e cada pergunta custa ~0,17 s até o VPS. Fotos e vídeo: 1 dia
         (e até 1 semana mostrando o guardado enquanto confere). Scripts com ?v=N são imutáveis:
         mudou o arquivo, sobe o N no vitrine.html. O vitrine.html continua sem cache. */
      { source: "/:pasta(fotos|social|video|tutoriais)/:arquivo*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      {
        source: "/:script(estoque|cores-motos|cores-sistema|catalogo-sistema|foto-produto|fotos-disponiveis).js",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
