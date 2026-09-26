import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { provedorCamera } from "@/lib/cameras";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Câmeras" };

export default async function PaginaCameras() {
  await exigirPermissao("cameras.ver");
  const cameras = await provedorCamera().listar();
  return (
    <Pagina>
      <CabecalhoPagina titulo="Câmeras" subtitulo="Nenhuma câmera está conectada ainda. As três posições já estão reservadas." />
      <div className="grid gap-4 md:grid-cols-3">
        {cameras.map((c) => (
          <Painel key={c.posicao}>
            <div className="border-b border-linha px-5 py-3 text-[13.5px] font-medium">{c.nome}</div>
            <EstadoVazio compacto icone={<Camera />} titulo="Câmera não conectada" />
          </Painel>
        ))}
      </div>
    </Pagina>
  );
}
