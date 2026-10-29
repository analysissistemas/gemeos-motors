"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { Botao } from "./botao";
import { Dialogo } from "./dialogo";

/* ============================================================
   ENQUADRAR A FOTO DO CARD DO SITE — quadrada, só a moto
   O card da vitrine é quadrado; as artes da loja vêm em pé (675 × 1200) e o
   card mostrava o título da arte no lugar da moto (usuário, 29/10/2026: "aqui
   tem que enquadrar só a moto"; "caso fique fora de enquadramento a pessoa vai
   lá e posiciona pelo próprio sistema").
   A foto original continua guardada (o WhatsApp manda ela, com a ficha da arte);
   o card usa esta versão enquadrada. Arrastar move a foto; + e − aproximam.
   Afastando, as sobras ganham a cor da lateral da própria foto (ou a foto
   desfocada, quando a lateral não é lisa).
   ============================================================ */
export const LADO_CARD = 800;
export type Enquadre = { zoom: number; x: number; y: number };
type Fonte = HTMLImageElement | ImageBitmap;

/* zoom 1 = a foto cobre o quadro inteiro; o mínimo é a foto inteira dentro do quadro */
const capa = (w: number, h: number) => Math.max(LADO_CARD / w, LADO_CARD / h);
const zoomMinimo = (w: number, h: number) => Math.min(LADO_CARD / w, LADO_CARD / h) / capa(w, h);

function amostra(img: Fonte) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  return (x: number, y: number) => {
    const o = (y * 64 + x) * 4;
    return d[o + 3] < 20 ? [255, 255, 255] : [d[o], d[o + 1], d[o + 2]];
  };
}

/** Cor média das laterais da metade de baixo (onde a moto fica) e se ela é lisa. */
function corDoFundo(img: Fonte): { cor: string; lisa: boolean } {
  const px = amostra(img);
  if (!px) return { cor: "#ffffff", lisa: true };
  const lista: number[][] = [];
  for (let y = 26; y < 64; y++) for (const x of [0, 1, 62, 63]) lista.push(px(x, y));
  const m = [0, 1, 2].map((k) => lista.reduce((s, p) => s + p[k], 0) / lista.length);
  const desvio = Math.sqrt(lista.reduce((s, p) => s + [0, 1, 2].reduce((t, k) => t + (p[k] - m[k]) ** 2, 0), 0) / lista.length / 3);
  return { cor: `rgb(${m.map(Math.round).join(",")})`, lisa: desvio < 16 };
}

/** É arte da loja (fundo escuro com título em cima, moto embaixo)? */
function ehArte(img: Fonte) {
  if (img.height < img.width * 1.3) return false;
  const px = amostra(img);
  if (!px) return false;
  let soma = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 64; x++) {
    const [r, g, b] = px(x, y);
    soma += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return soma / 640 < 70;
}

/** Posição automática: na arte em pé, a parte de baixo (a moto) um pouco afastada; na foto comum, ela inteira. */
export function enquadreAutomatico(img: Fonte): Enquadre {
  const { width: w, height: h } = img;
  if (!ehArte(img)) return { zoom: zoomMinimo(w, h), x: 0, y: 0 };
  const zoom = h > w * 1.6 ? 0.8 : 1;
  const altura = h * capa(w, h) * zoom;
  return { zoom, x: 0, y: (LADO_CARD - altura) / 2 };
}

/** Não deixa a foto sair do quadro quando ela é maior que ele (sem buraco na borda). */
function limitar(img: Fonte, a: Enquadre): Enquadre {
  const e = capa(img.width, img.height) * a.zoom;
  const folgaX = Math.abs(img.width * e - LADO_CARD) / 2;
  const folgaY = Math.abs(img.height * e - LADO_CARD) / 2;
  return { zoom: a.zoom, x: Math.max(-folgaX, Math.min(folgaX, a.x)), y: Math.max(-folgaY, Math.min(folgaY, a.y)) };
}

export function desenharNoQuadro(ctx: CanvasRenderingContext2D, img: Fonte, a: Enquadre) {
  const L = LADO_CARD;
  const { cor, lisa } = corDoFundo(img);
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, L, L);
  const e = capa(img.width, img.height) * a.zoom;
  const w = img.width * e, h = img.height * e;
  if (!lisa && (w < L || h < L)) {
    const f = capa(img.width, img.height) * 1.1;
    ctx.save();
    ctx.filter = "blur(28px) brightness(0.85)";
    ctx.drawImage(img, (L - img.width * f) / 2, (L - img.height * f) / 2, img.width * f, img.height * f);
    ctx.restore();
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (L - w) / 2 + a.x, (L - h) / 2 + a.y, w, h);
}

export async function arquivoDoQuadro(img: Fonte, a: Enquadre): Promise<File | null> {
  const c = document.createElement("canvas");
  c.width = c.height = LADO_CARD;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  desenharNoQuadro(ctx, img, a);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", 0.86));
  return blob ? new File([blob], "card.webp", { type: blob.type }) : null;
}

/** Abre a foto (arquivo escolhido ou endereço da foto já guardada). */
export async function abrirFoto(fonte: File | string): Promise<ImageBitmap | null> {
  try {
    const blob = typeof fonte === "string" ? await (await fetch(fonte, { cache: "no-store" })).blob() : fonte;
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export type Enquadrado = { arquivo: File; enquadre: Enquadre };

/**
 * Janela de enquadrar. `enquadrar(fonte, salvo?)` abre a janela e devolve a foto do card
 * (webp 800 × 800) com a posição, ou null se a pessoa cancelar.
 */
export function useEnquadrarFoto() {
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [ajuste, setAjuste] = useState<Enquadre>({ zoom: 1, x: 0, y: 0 });
  const resolver = useRef<((f: Enquadrado | null) => void) | null>(null);
  /* o quadro entra na tela depois da janela abrir: guardado em estado para desenhar assim que existir */
  const [tela, setTela] = useState<HTMLCanvasElement | null>(null);
  const arrasto = useRef<{ x: number; y: number; a: Enquadre; fator: number } | null>(null);

  const enquadrar = useCallback(async (fonte: File | string, salvo?: Enquadre | null) => {
    const b = await abrirFoto(fonte);
    if (!b) return null;
    setAjuste(salvo ? limitar(b, salvo) : enquadreAutomatico(b));
    setImg(b);
    return new Promise<Enquadrado | null>((ok) => (resolver.current = ok));
  }, []);

  const fechar = useCallback(
    (f: Enquadrado | null) => {
      resolver.current?.(f);
      resolver.current = null;
      img?.close();
      setImg(null);
    },
    [img],
  );

  useEffect(() => {
    const ctx = tela?.getContext("2d");
    if (img && ctx) desenharNoQuadro(ctx, img, ajuste);
  }, [img, ajuste, tela]);

  const zoomPor = (fator: number) =>
    img && setAjuste((a) => limitar(img, { ...a, zoom: Math.max(zoomMinimo(img.width, img.height), Math.min(4, a.zoom * fator)) }));

  const janela = (
    <Dialogo
      aberto={!!img}
      aoMudar={(v) => !v && fechar(null)}
      titulo="Enquadrar a moto no card do site"
      descricao="O quadro é o card da vitrine. Arraste a foto para centralizar a moto e use + e − para aproximar ou afastar. A foto original continua guardada para o WhatsApp."
      largura="sm"
      rodape={
        <>
          <Botao variante="fantasma" onClick={() => fechar(null)}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={async () => {
              if (!img) return;
              const arquivo = await arquivoDoQuadro(img, ajuste);
              fechar(arquivo ? { arquivo, enquadre: ajuste } : null);
            }}
          >
            Usar este enquadramento
          </Botao>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <canvas
          ref={setTela}
          width={LADO_CARD}
          height={LADO_CARD}
          className="aspect-square w-full max-w-[340px] cursor-grab touch-none rounded-xl ring-1 ring-linha active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            arrasto.current = { x: e.clientX, y: e.clientY, a: ajuste, fator: LADO_CARD / e.currentTarget.getBoundingClientRect().width };
          }}
          onPointerMove={(e) => {
            const r = arrasto.current;
            if (!r || !img) return;
            setAjuste(limitar(img, { ...r.a, x: r.a.x + (e.clientX - r.x) * r.fator, y: r.a.y + (e.clientY - r.y) * r.fator }));
          }}
          onPointerUp={() => (arrasto.current = null)}
          onWheel={(e) => zoomPor(e.deltaY < 0 ? 1.08 : 1 / 1.08)}
          aria-label="Prévia do card do site"
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Botao tamanho="icone" variante="secundario" aria-label="Afastar" onClick={() => zoomPor(1 / 1.12)}>
            <Minus className="size-4" />
          </Botao>
          <Botao tamanho="sm" variante="secundario" onClick={() => img && setAjuste(enquadreAutomatico(img))}>
            <Scan className="size-4" /> Automático
          </Botao>
          <Botao tamanho="sm" variante="secundario" onClick={() => img && setAjuste({ zoom: zoomMinimo(img.width, img.height), x: 0, y: 0 })}>
            Foto inteira
          </Botao>
          <Botao tamanho="icone" variante="secundario" aria-label="Aproximar" onClick={() => zoomPor(1.12)}>
            <Plus className="size-4" />
          </Botao>
        </div>
      </div>
    </Dialogo>
  );

  return { enquadrar, janela };
}
