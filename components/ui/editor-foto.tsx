"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { iniciais } from "@/lib/formato";
import { Avatar } from "./avatar";
import { Botao } from "./botao";
import { Dialogo } from "./dialogo";

type Resposta = { ok: true; mensagem?: string } | { ok: false; erro: string };

export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const TIPOS = TIPOS_FOTO;
export const LIMITE_FOTO = 2 * 1024 * 1024;
const LIMITE = LIMITE_FOTO;
const LADO = 256;

/** Reduz a foto no navegador e converte para webp antes de enviar.
 *  - `quadrado`: corta no meio em quadrado desse lado (avatar: 256 px, uns 15–30 KB).
 *  - `ladoMaior`: mantém a proporção e limita o lado maior (catálogo: 1200 px).
 *  Nunca amplia. Se o navegador não souber, manda o arquivo original — o
 *  servidor confere de novo (tipo pelos bytes e 2 MB). */
export async function reduzirFoto(arquivo: File, opcoes: { quadrado: number } | { ladoMaior: number }): Promise<File> {
  try {
    const img = await createImageBitmap(arquivo);
    const canvas = document.createElement("canvas");
    let origem: [number, number, number, number];
    if ("quadrado" in opcoes) {
      const lado = Math.min(img.width, img.height);
      canvas.width = canvas.height = Math.min(opcoes.quadrado, lado);
      origem = [(img.width - lado) / 2, (img.height - lado) / 2, lado, lado];
    } else {
      const escala = Math.min(1, opcoes.ladoMaior / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      origem = [0, 0, img.width, img.height];
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, ...origem, 0, 0, canvas.width, canvas.height);
    img.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.85));
    if (!blob || !TIPOS.includes(blob.type)) return arquivo;
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
    return new File([blob], `foto.${ext}`, { type: blob.type });
  } catch {
    return arquivo;
  }
}

/** Avatar com botão de câmera: abre uma janela para escolher ou remover a foto. */
export function EditorFoto({
  nome,
  foto,
  titulo,
  tamanho = "lg",
  aoEnviar,
  aoRemover,
  aoMudar,
  className,
}: {
  nome: string;
  foto?: string | null;
  titulo?: string;
  tamanho?: "md" | "lg";
  aoEnviar: (dados: FormData) => Promise<Resposta>;
  aoRemover: () => Promise<Resposta>;
  aoMudar?: () => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [falhou, setFalhou] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const rotulo = titulo ?? `Foto de ${nome}`;

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!TIPOS.includes(arquivo.type)) return void toast.error("Use uma foto JPG, PNG ou WebP.");
    iniciar(async () => {
      const pronto = await reduzirFoto(arquivo, { quadrado: LADO });
      if (pronto.size > LIMITE) return void toast.error("A foto passa de 2 MB. Escolha uma menor.");
      const dados = new FormData();
      dados.set("foto", pronto);
      const r = await aoEnviar(dados);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Foto atualizada");
      setAberto(false);
      aoMudar?.();
    });
  }

  return (
    <>
      <span className={cn("relative inline-flex w-fit shrink-0", className)}>
        <Avatar nome={nome} foto={foto} tamanho={tamanho} />
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={cn(
            "absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-elevado bg-ink text-contra-ink shadow hover:opacity-90",
            tamanho === "lg" ? "size-7" : "size-6",
          )}
          aria-label={foto ? `Trocar ${rotulo.toLowerCase()}` : `Colocar ${rotulo.toLowerCase()}`}
          title={foto ? "Trocar foto" : "Colocar foto"}
        >
          <Camera className="size-3.5" />
        </button>
      </span>

      <Dialogo
        aberto={aberto}
        aoMudar={(v) => !pendente && setAberto(v)}
        titulo={rotulo}
        descricao="JPG, PNG ou WebP, até 2 MB. A foto é cortada em quadrado e reduzida."
        largura="sm"
        rodape={
          <>
            {foto && (
              <Botao
                variante="fantasma"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await aoRemover();
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.mensagem ?? "Foto removida");
                    setAberto(false);
                    aoMudar?.();
                  })
                }
              >
                <Trash2 className="size-4" /> Remover foto
              </Botao>
            )}
            <Botao variante="primario" carregando={pendente} onClick={() => entrada.current?.click()}>
              <ImageUp className="size-4" /> {foto ? "Escolher outra foto" : "Escolher foto"}
            </Botao>
          </>
        }
      >
        <div className="flex justify-center">
          <span className="grid size-40 place-items-center overflow-hidden rounded-full bg-vidro-forte text-[44px] font-semibold ring-1 ring-linha">
            {foto && falhou !== foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- rota com sessão (/api/fotos)
              <img src={foto} alt={nome} className="size-full object-cover" onError={() => setFalhou(foto)} />
            ) : (
              <span aria-hidden>{iniciais(nome)}</span>
            )}
          </span>
        </div>
        <input ref={entrada} type="file" accept={TIPOS.join(",")} className="sr-only" tabIndex={-1} aria-label="Arquivo da foto" onChange={escolher} />
      </Dialogo>
    </>
  );
}
