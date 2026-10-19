import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { obterUsuario } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { registrarLog } from "@/lib/logs";
import type { TipoMensagem } from "@/lib/mensageria/tipos";

/* ============================================================
   REENVIO DAS QUE FALHARAM COM 131047 (troca de número, 18–19/10/2026)
   Tudo saía pelo número novo e quem escreveu no antigo ficou sem resposta.
   Reenvia, pelo número em que o cliente escreveu, só o que respondia à
   ÚLTIMA mensagem dele, quando ninguém respondeu depois e a janela de
   24 h ainda está aberta. Sem ?aplicar=1 só lista (nada sai). Só admin.
   ============================================================ */
const TROCA_DO_NUMERO = new Date("2026-10-18T22:00:00Z");
const JANELA_MS = 23.5 * 3600_000;

export async function POST(req: NextRequest) {
  const u = await obterUsuario();
  if (!u) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });
  if (u.papel !== "admin") return NextResponse.json({ erro: "só administrador" }, { status: 403 });
  const aplicar = req.nextUrl.searchParams.get("aplicar") === "1";

  const falhas = await db
    .select({ id: schema.mensagens.id, conversaId: schema.mensagens.conversaId, tipo: schema.mensagens.tipo, conteudo: schema.mensagens.conteudo, midiaUrl: schema.mensagens.midiaUrl, midiaNome: schema.mensagens.midiaNome, midiaMime: schema.mensagens.midiaMime, midiaTamanho: schema.mensagens.midiaTamanho, metadados: schema.mensagens.metadados, telefone: schema.conversas.contatoTelefone })
    .from(schema.mensagens)
    .innerJoin(schema.conversas, eq(schema.conversas.id, schema.mensagens.conversaId))
    .where(and(eq(schema.mensagens.direcao, "outgoing"), eq(schema.mensagens.status, "failed"), eq(schema.conversas.demo, false), gt(schema.mensagens.criadoEm, TROCA_DO_NUMERO), sql`${schema.mensagens.metadados}->>'erro' like '%131047%'`))
    .orderBy(schema.mensagens.id);

  const porConversa = new Map<number, typeof falhas>();
  for (const f of falhas) porConversa.set(f.conversaId, [...(porConversa.get(f.conversaId) ?? []), f]);

  const prov = await obterProvedor();
  const relatorio: { conversa: number; situacao: string; mensagens: number; enviadas?: number }[] = [];
  for (const [conversaId, lista] of porConversa) {
    const [ultimaDoCliente] = await db
      .select({ id: schema.mensagens.id, criadoEm: schema.mensagens.criadoEm })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.direcao, "incoming")))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    if (!ultimaDoCliente || Date.now() - new Date(ultimaDoCliente.criadoEm).getTime() > JANELA_MS) {
      relatorio.push({ conversa: conversaId, situacao: "cliente calado há mais de 24 h (só modelo aprovado)", mensagens: 0 });
      continue;
    }
    const [respondida] = await db
      .select({ id: schema.mensagens.id })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.direcao, "outgoing"), gt(schema.mensagens.id, ultimaDoCliente.id), inArray(schema.mensagens.status, ["delivered", "read"])))
      .limit(1);
    if (respondida) {
      relatorio.push({ conversa: conversaId, situacao: "já respondida depois", mensagens: 0 });
      continue;
    }
    /* só o que respondia à última mensagem; modelo aprovado e texto repetido ficam de fora */
    const vistos = new Set<string>();
    const candidatas = lista.filter((m) => {
      if (m.id < ultimaDoCliente.id || m.metadados?.modelo) return false;
      const chave = `${m.tipo}|${m.conteudo ?? ""}|${m.midiaUrl ?? ""}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
    if (!candidatas.length) {
      relatorio.push({ conversa: conversaId, situacao: "nada a reenviar", mensagens: 0 });
      continue;
    }
    if (!aplicar) {
      relatorio.push({ conversa: conversaId, situacao: "vai reenviar", mensagens: candidatas.length });
      continue;
    }
    let enviadas = 0;
    for (const m of candidatas) {
      const midia = m.midiaUrl ? { url: m.midiaUrl, nome: m.midiaNome, mime: m.midiaMime, tamanho: m.midiaTamanho } : null;
      const env = await prov.enviar({ telefone: m.telefone, tipo: m.tipo as TipoMensagem, conteudo: m.conteudo, midia });
      if (env.status !== "failed") enviadas++;
      /* a mesma linha do chat: some o "Não enviada" e passa a valer o status do novo envio */
      await db
        .update(schema.mensagens)
        .set({
          status: env.status,
          externoId: env.externoId ?? null,
          alteradaEm: new Date(),
          metadados: sql`(coalesce(${schema.mensagens.metadados}, '{}'::jsonb) - 'erro') || ${JSON.stringify({ reenviadaEm: new Date().toISOString(), ...(env.erro ? { erro: env.erro } : {}) })}::jsonb`,
        })
        .where(eq(schema.mensagens.id, m.id));
    }
    relatorio.push({ conversa: conversaId, situacao: "reenviada", mensagens: candidatas.length, enviadas });
  }
  if (aplicar) await registrarLog(u, { acao: "conversa.reenvio", entidade: "conversa", descricao: `Reenviou as mensagens que falharam com 131047 na troca de número (${relatorio.filter((r) => r.situacao === "reenviada").length} conversas)` });
  return NextResponse.json({ aplicar, relatorio }, { headers: { "Cache-Control": "no-store" } });
}
