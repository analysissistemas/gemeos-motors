import type { MetadataRoute } from "next";

/* Sistema na Tela de Início (iPhone/Android): abre como aplicativo e recebe os avisos (dono, 15/10/2026). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gêmeos Motors — Sistema",
    short_name: "Gêmeos",
    description: "Atendimento, funil, vendas e avisos da Gêmeos Motors.",
    start_url: "/sistema",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/social/icone-180.png", sizes: "180x180", type: "image/png" }],
  };
}
