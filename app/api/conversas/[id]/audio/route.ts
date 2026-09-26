import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { obterUsuario } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { ErroRegra } from "@/lib/acao";
import { enviarMensagem } from "@/lib/mensageria/servico";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { armazenamentoDisponivel, guardarMidia } from "@/lib/mensageria/midia";
import { DURACAO_MAXIMA_S, DURACAO_MINIMA_S, LIMITE_AUDIO_BYTES, decidirDuracao, ehAudioAceito, extensaoDoMime, medirDuracao, mimeBase, vaiParaWhatsApp } from "@/lib/mensageria/audio-formatos";

/* Recebe a gravação feita no navegador (multipart), confere formato, tamanho e
   duração REAL do arquivo, guarda e envia. O número de segundos que o navegador
   manda só é usado se o arquivo não trouxer a duração. */
const erro = (msg: string, status: number) => NextResponse.json({ ok: false, erro: msg }, { status });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await obterUsuario();
  if (!u) return erro("Sua sessão expirou. Entre de novo.", 401);
  if (!pode(u.papel, "conversas.ver")) return erro("Seu perfil não tem acesso a esta ação.", 403);
  const conversaId = Number((await ctx.params).id);
  if (!Number.isInteger(conversaId) || conversaId <= 0) return erro("Conversa inválida.", 400);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erro("Não foi possível ler o áudio enviado.", 400);
  }
  const arq = form.get("audio");
  if (!(arq instanceof File) || arq.size === 0) return erro("Nenhum áudio foi enviado.", 400);
  if (arq.size > LIMITE_AUDIO_BYTES) return erro("Áudio grande demais (máximo 4 MB). Grave um áudio mais curto.", 413);
  const mime = arq.type;
  if (!ehAudioAceito(mime)) return erro("Formato de áudio não aceito.", 415);

  const prov = await obterProvedor();
  if (!prov.simulado && !vaiParaWhatsApp(mime)) return erro("Este navegador grava em um formato que o WhatsApp não aceita. Use o Chrome, Edge ou Safari atualizados.", 415);

  const bytes = new Uint8Array(await arq.arrayBuffer());
  const doNavegador = Number(form.get("duracao"));
  const dec = decidirDuracao(await medirDuracao(bytes, mime), Number.isFinite(doNavegador) ? doNavegador : null);
  if (!dec || dec.duracao < DURACAO_MINIMA_S) return erro("Áudio vazio ou curto demais. Grave pelo menos 1 segundo.", 422);
  if (dec.duracao > DURACAO_MAXIMA_S) return erro("Áudio longo demais (máximo 5 minutos).", 422);

  try {
    const base = mimeBase(mime);
    const nome = `audio.${extensaoDoMime(base)}`;
    const midia = armazenamentoDisponivel()
      ? await guardarMidia(bytes, nome, base)
      : { url: `data:${base};base64,${Buffer.from(bytes).toString("base64")}`, nome, mime: base, tamanho: bytes.byteLength };
    const id = await enviarMensagem(u, conversaId, {
      tipo: "audio",
      midia,
      metadados: { duracao: dec.duracao, duracaoOrigem: dec.origem, ...(dec.divergencia != null && dec.divergencia > 1 ? { divergenciaNavegador: dec.divergencia } : {}) },
    });
    revalidatePath("/sistema/conversas");
    return NextResponse.json({ ok: true, id, duracao: dec.duracao, url: midia.url });
  } catch (e) {
    if (e instanceof ErroRegra) return erro(e.message, 422);
    console.error("[audio] falha ao enviar", e);
    return erro("Não foi possível enviar o áudio. Tente de novo.", 500);
  }
}
