import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { cidadeNoTexto, linkResumoMaisRecente, lerResumoSemanal, precoParaCidade, type PrecoDaRegiao, type PrecosGasolina } from "./gasolina-anp";

/* ============================================================
   PREÇO DA GASOLINA ATUALIZADO PELA ANP, pela região do cliente
   - O vigia (a cada minuto) chama atualizarGasolinaSePreciso(): se a última conferência tem mais
     de 12 h, olha a página da ANP e, havendo resumo semanal novo, baixa e guarda em
     `configuracoes` ("gasolina_anp"). Falhou? Tenta de novo em 1 h; enquanto isso vale o último guardado.
   - Sem nada guardado (ANP fora do ar desde sempre), vale o preço escrito na Base de conhecimento.
   ============================================================ */
const CHAVE = "gasolina_anp";
const PAGINA_ANP = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas";
const CONFERIR_A_CADA = 12 * 3600_000;
const TENTAR_DE_NOVO_EM = 3600_000;
const TAMANHO_MAXIMO = 15 * 1024 * 1024;

type Guardado = PrecosGasolina & { conferidoEm: string };
let ultimaTentativa = 0;

export async function lerPrecosGasolina(): Promise<Guardado | null> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  const v = l?.valor as Guardado | undefined;
  return v?.estados ? v : null;
}

async function guardar(v: Guardado) {
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor: v })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: v, atualizadoEm: new Date() } });
}

export async function atualizarGasolinaSePreciso(agora = new Date()) {
  if (agora.getTime() - ultimaTentativa < TENTAR_DE_NOVO_EM) return { feito: "aguardando" as const };
  const atual = await lerPrecosGasolina();
  if (atual && agora.getTime() - new Date(atual.conferidoEm).getTime() < CONFERIR_A_CADA) return { feito: "em_dia" as const };
  ultimaTentativa = agora.getTime();
  const cabecalhos = { "User-Agent": "Mozilla/5.0 (GemeosMotors; preco da gasolina)" };
  const html = await fetch(PAGINA_ANP, { headers: cabecalhos, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`ANP respondeu ${r.status}`))));
  const link = linkResumoMaisRecente(html);
  if (!link) throw new Error("página da ANP sem o resumo semanal");
  const arquivo = link.split("/").pop()!;
  if (atual?.arquivo === arquivo) {
    await guardar({ ...atual, conferidoEm: agora.toISOString() });
    return { feito: "sem_novidade" as const, arquivo };
  }
  const resp = await fetch(link, { headers: cabecalhos, signal: AbortSignal.timeout(90_000) });
  if (!resp.ok) throw new Error(`ANP respondeu ${resp.status} no arquivo`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > TAMANHO_MAXIMO) throw new Error("arquivo da ANP grande demais");
  const dados = lerResumoSemanal(buf, arquivo);
  await guardar({ ...dados, conferidoEm: agora.toISOString() });
  return { feito: "atualizado" as const, arquivo, semanaFim: dados.semanaFim };
}

/** Estado da loja (Configurações → Empresa); sem cadastro, Pernambuco (Goiana). */
async function estadoDaLoja() {
  const [e] = await db.select({ estado: schema.empresa.estado }).from(schema.empresa).limit(1);
  const uf = e?.estado?.trim() ?? "";
  const SIGLAS: Record<string, string> = { PE: "Pernambuco", PB: "Paraíba", AL: "Alagoas", RN: "Rio Grande do Norte", BA: "Bahia", CE: "Ceará", SP: "São Paulo" };
  return SIGLAS[uf.toUpperCase()] ?? (uf.length > 2 ? uf : "Pernambuco");
}

export type GasolinaDoCliente = PrecoDaRegiao & { semanaFim: string };

/** Preço da gasolina para o cliente: cidade que ele citou/que a IA anotou (se a ANP pesquisa), senão a média do estado da loja. */
export async function gasolinaPara(p: { cidade?: string | null; textoDoCliente?: string } = {}): Promise<GasolinaDoCliente | null> {
  const dados = await lerPrecosGasolina();
  if (!dados) return null;
  const uf = await estadoDaLoja();
  const cidade = (p.textoDoCliente && cidadeNoTexto(dados, p.textoDoCliente, uf)) || p.cidade || null;
  const r = precoParaCidade(dados, cidade, uf);
  return r ? { ...r, semanaFim: dados.semanaFim } : null;
}
