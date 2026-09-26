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

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const LIMITE = 2 * 1024 * 1024;
const LADO = 256;

/** Corta no meio em quadrado e reduz para 256 px em webp (uns 15–30 KB). Se o
 *  navegador não souber, manda o arquivo original — o servidor confere de novo. */
async function reduzir(arquivo: File): Promise<File> {
  try {
    const img = await createImageBitmap(arquivo);
    const lado = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(LADO, lado);
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
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
      const pronto = await reduzir(arquivo);
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
