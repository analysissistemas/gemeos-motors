import "server-only";
import { autonomiaMinima, comGasolinaDaRegiao, lerParametrosEconomia, textoEconomia } from "./economia";
import { gasolinaPara, type GasolinaDoCliente } from "./gasolina";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TIPOS_ELETRICOS } from "@/lib/dominio";
import { compilarPrompt, SECOES_PROMPT } from "./secoes";
import { normalizarHorario, textoHorario, type HorarioLoja } from "./horario";

export type VersaoPrompt = { id: number; versao: number; conteudo: string; status: string; nota: string | null; criadoEm: Date; publicadoEm: Date | null };

/** Tudo que a tela precisa: por setor, a versão em uso, o rascunho e o histórico. */
export async function carregarPrompts() {
  const linhas = await db
    .select({
      id: schema.iaPromptVersoes.id,
      secao: schema.iaPromptVersoes.secao,
      versao: schema.iaPromptVersoes.versao,
      conteudo: schema.iaPromptVersoes.conteudo,
      status: schema.iaPromptVersoes.status,
      nota: schema.iaPromptVersoes.nota,
      criadoEm: schema.iaPromptVersoes.criadoEm,
      publicadoEm: schema.iaPromptVersoes.publicadoEm,
    })
    .from(schema.iaPromptVersoes)
    .orderBy(desc(schema.iaPromptVersoes.versao));
  return SECOES_PROMPT.map((s) => {
    const dele = linhas.filter((l) => l.secao === s.chave);
    return {
      chave: s.chave,
      titulo: s.titulo,
      ajuda: s.ajuda,
      padrao: s.padrao,
      publicada: dele.find((l) => l.status === "publicada") ?? null,
      rascunho: dele.find((l) => l.status === "rascunho") ?? null,
      historico: dele.filter((l) => l.status !== "rascunho").slice(0, 15),
    };
  });
}

export async function proximaVersao(secao: string, tx: Pick<typeof db, "select"> = db) {
  const [r] = await tx.select({ m: max(schema.iaPromptVersoes.versao) }).from(schema.iaPromptVersoes).where(eq(schema.iaPromptVersoes.secao, secao));
  return (r?.m ?? 0) + 1;
}

/** Versão publicada de cada setor (null = texto padrão), para gravar no registro de cada execução. */
export async function versoesEmUso(): Promise<Record<string, number | null>> {
  const pub = await db.select({ secao: schema.iaPromptVersoes.secao, versao: schema.iaPromptVersoes.versao }).from(schema.iaPromptVersoes).where(eq(schema.iaPromptVersoes.status, "publicada"));
  return Object.fromEntries(SECOES_PROMPT.map((s) => [s.chave, pub.find((p) => p.secao === s.chave)?.versao ?? null]));
}

/** Texto final que vai para a IA: setores publicados (ou o padrão) + conhecimento ativo. */
export async function montarPromptSistema() {
  const publicadas = await db
    .select({ secao: schema.iaPromptVersoes.secao, conteudo: schema.iaPromptVersoes.conteudo })
    .from(schema.iaPromptVersoes)
    .where(eq(schema.iaPromptVersoes.status, "publicada"));
  return compilarPrompt(publicadas, await conhecimentoAtivo());
}

/* ---------------- horário de funcionamento (ajustável na tela) ---------------- */
const CHAVE_HORARIO = "loja.horario";

export async function lerHorario(): Promise<HorarioLoja> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_HORARIO)).limit(1);
  return normalizarHorario(l?.valor);
}

export async function salvarHorario(h: HorarioLoja, usuarioId: number) {
  const valor = normalizarHorario(h);
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE_HORARIO, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
}

/** Base de conhecimento ativa + o horário de funcionamento, que entra como um item da categoria Loja. */
export async function conhecimentoAtivo() {
  const [itens, horario] = await Promise.all([
    db.select().from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)).orderBy(asc(schema.iaConhecimento.categoria), asc(schema.iaConhecimento.titulo)),
    lerHorario(),
  ]);
  return [{ categoria: "Loja", titulo: "Horário de funcionamento", conteudo: textoHorario(horario) }, ...itens];
}

/** Textos que autorizam fatos (horário, endereço, valores, parcelas) na trava de fatos e no validador. */
export async function fontesAutorizadas() {
  /* o catálogo oficial também é fonte: nome, preço de tabela, ficha e cores podem ser ditos ao cliente */
  const catalogo = await catalogoParaIa();
  return [...(await conhecimentoAtivo()).map((k) => `${k.titulo}\n${k.conteudo}`), ...(catalogo.texto ? [catalogo.texto] : [])];
}

const ROTULO_FICHA: Record<string, string> = { motor: "motor", autonomia: "autonomia", velocidade: "velocidade máxima", bateria: "bateria", pneu: "pneu", /* o campo "peso" guarda quanto a moto AGUENTA (carga máxima), não o peso dela */ peso: "aguenta até (carga máxima)", recarga: "recarga", freio: "freio" };

/** "R$ 8.999,90"; preço redondo sai sem centavos ("R$ 7.190"). */
export const reais = (x: number) => `R$ ${x.toLocaleString("pt-BR", Number.isInteger(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Nome inteiro e os pedaços com número ("TANK AG11" → "AG11"; "T3 RETRÔ" → "T3"): é assim que o cliente e a IA chamam a moto. */
export function apelidosDoModelo(nome: string) {
  const pedacos = nome.split(/\s+/).filter((p) => p.length >= 2 && /\d/.test(p));
  return Array.from(new Set([nome.trim(), ...pedacos]));
}

/* Catálogo oficial (Estoque → Catálogo, o mesmo do site) + o que há no estoque agora. Regras do dono:
   só moto ELÉTRICA (nunca combustão nem carro) e acessório (27/09/2026); e a IA só OFERECE moto com
   unidade disponível no estoque (02/10/2026: "nunca ofereça uma que não tem no estoque"). Moto sem
   unidade vai só pelo nome, para a IA saber que existe e anotar o interesse se o cliente perguntar.
   Cores: as das unidades disponíveis; o catálogo só vale quando a unidade não tem cor anotada.
   `incluirTeste`: conversa simulada enxerga os veículos de teste. */
export async function catalogoParaIa(opcoes: { incluirTeste?: boolean; kmSemana?: number | null; /** preço da ANP para a região do cliente; sem, a média do estado da loja */ gasolina?: GasolinaDoCliente | null } = {}) {
  const m = schema.modelos;
  const v = schema.veiculos;
  const [linhas, cores, unidades, base, chegando] = await Promise.all([
    db
      .select({ id: m.id, nome: m.nome, marca: m.marca, tipo: m.tipo, preco: m.precoTabela, ficha: m.ficha, disponibilidade: m.disponibilidade, descricao: m.descricao, quantidade: m.quantidade })
      .from(m)
      .where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true), inArray(m.tipo, [...TIPOS_ELETRICOS, "acessorio"])))
      .orderBy(asc(m.ordem), asc(m.nome)),
    db.select({ modeloId: schema.modeloCores.modeloId, nome: schema.modeloCores.nome }).from(schema.modeloCores).where(eq(schema.modeloCores.ativo, true)).orderBy(asc(schema.modeloCores.ordem)),
    db
      .select({ modeloId: v.modeloId, modelo: v.modelo, cor: v.cor })
      .from(v)
      .where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_ELETRICOS]), opcoes.incluirTeste ? undefined : eq(v.teste, false))),
    db.select({ conteudo: schema.iaConhecimento.conteudo }).from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)),
    /* encomenda a caminho (05/10/2026: "a M6 chega dia 9/10, a linha esgotou e o dono fez o pedido"): unidade
       Reservado com data de entrada no futuro. A IA diz quando chega e anota o interesse, sem vender como disponível */
    db
      .select({ modeloId: v.modeloId, modelo: v.modelo, entradaEm: v.entradaEm })
      .from(v)
      .where(and(eq(v.status, "reservado"), inArray(v.tipo, [...TIPOS_ELETRICOS]), sql`${v.entradaEm} > current_date`, opcoes.incluirTeste ? undefined : eq(v.teste, false))),
  ]);
  /* conta de economia × gasolina com os números da base (preço da gasolina, km/l, custo da carga) */
  const baseEconomia = lerParametrosEconomia(base.map((b) => b.conteudo));
  const economia = baseEconomia && comGasolinaDaRegiao(baseEconomia, opcoes.gasolina !== undefined ? opcoes.gasolina : await gasolinaPara().catch(() => null));
  if (!linhas.length) return { texto: "", nomes: [] as string[], comEstoque: [] as string[], semEstoque: [] as string[][] };
  const brl = (x: number | null) => (x ? reais(Number(x)) : "preço sob consulta");
  const comEstoque: string[] = [];
  const semEstoque: { nome: string; apelidos: string[]; chega?: string | null }[] = [];
  const itens: string[] = [];
  for (const l of linhas) {
    const nome = [l.marca, l.nome].filter(Boolean).join(" ");
    if (l.tipo === "acessorio") {
      /* acessório com quantidade contada: 0 = acabou, não oferece (05/10/2026) */
      if (l.quantidade === 0) {
        semEstoque.push({ nome, apelidos: apelidosDoModelo(l.nome) });
        continue;
      }
      itens.push(`• ${nome} (acessório): ${brl(l.preco as number | null)}${l.quantidade ? ` | EM ESTOQUE: ${l.quantidade} unidade(s)` : ""}`);
      continue;
    }
    /* unidade ligada ao modelo, ou com o mesmo nome digitado na entrada */
    const minhas = unidades.filter((u) => u.modeloId === l.id || (!u.modeloId && u.modelo.trim().toLowerCase() === l.nome.trim().toLowerCase()));
    if (!minhas.length) {
      const vindo = chegando.filter((u) => u.modeloId === l.id || (!u.modeloId && u.modelo.trim().toLowerCase() === l.nome.trim().toLowerCase()));
      const quando = vindo.map((u) => u.entradaEm).sort()[0];
      semEstoque.push({ nome, apelidos: apelidosDoModelo(l.nome), chega: quando ? quando.split("-").reverse().slice(0, 2).join("/") : null });
      continue;
    }
    comEstoque.push(l.nome, ...(l.marca ? [l.marca] : []));
    const f = (l.ficha ?? {}) as Record<string, string>;
    const ficha = Object.entries(ROTULO_FICHA).filter(([k]) => f[k]).map(([k, r]) => `${r} ${f[k]}`).join("; ");
    const coresEstoque = Array.from(new Set(minhas.map((u) => u.cor?.trim()).filter((c): c is string => !!c)));
    const coresDoModelo = coresEstoque.length ? coresEstoque : cores.filter((c) => c.modeloId === l.id).map((c) => c.nome);
    const rotuloCores = coresEstoque.length ? "cores das unidades (SÓ estas; outra cor, a equipe confirma)" : "cores";
    const autonomia = autonomiaMinima(f.autonomia);
    const conta = economia && autonomia ? ` | ${textoEconomia(autonomia, economia, opcoes.kmSemana)}` : "";
    const detalhes = l.descricao?.trim() ? ` | detalhes: ${l.descricao.trim()}` : "";
    itens.push(`• ${nome}${l.tipo === "patinete" ? " (patinete elétrico)" : ""}: ${brl(l.preco as number | null)}${ficha ? ` | ${ficha}` : ""}${detalhes}${coresDoModelo.length ? ` | ${rotuloCores}: ${coresDoModelo.join(", ")}` : ""} | EM ESTOQUE: ${minhas.length} unidade(s) — pode dizer que tem a pronta entrega${conta}`);
  }
  const vindo = semEstoque.filter((x) => x.chega);
  const avisoSem = semEstoque.length
    ? `\nSEM UNIDADE NO ESTOQUE AGORA (NÃO ofereça, não liste, não dê preço, ficha nem cor): ${semEstoque.map((x) => x.nome).join(", ")}. Se o cliente perguntar por uma delas pelo nome, diga que no momento não tem unidade disponível, ofereça anotar o interesse para avisar quando chegar e apresente as que estão EM ESTOQUE.${vindo.length ? `\nENCOMENDA A CAMINHO (a loja já fez o pedido): ${vindo.map((x) => `${x.nome} chega em ${x.chega}`).join("; ")}. Se o cliente perguntar por esse modelo, diga que no momento não tem disponível, que a próxima remessa chega em ${vindo.length === 1 ? vindo[0].chega : "a data acima"} e ofereça anotar o interesse para a equipe avisar assim que chegar. Não prometa reserva nem preço.` : ""}`
    : "";
  const nenhuma = comEstoque.length ? "" : "\nNENHUMA moto elétrica com unidade disponível agora: não ofereça modelo; diga que a equipe confirma o que chegou e já te retorna.";
  const texto = `# CATÁLOGO DA LOJA E ESTOQUE AGORA
Só motos e patinetes ELÉTRICOS e acessórios. NUNCA ofereça moto a combustão nem carro, nem se o cliente perguntar (diga que a loja trabalha com mobilidade elétrica). Item marcado "(patinete elétrico)" é patinete: chame de patinete, nunca de moto. Não diga "mais popular", "mais vendida" nem "campeã de vendas" (não há esse dado). Triciclo (três rodas): só é triciclo o modelo cuja descrição diz "triciclo" ou "três rodas"; nenhum outro é triciclo (o nome "T3" NÃO quer dizer três rodas). Sem modelo assim no catálogo, diga que no momento não tem triciclo.
Só ofereça as motos e patinetes listados abaixo (todas têm unidade no estoque): nome, preço de tabela, ficha e as cores dela. Nunca invente cor, versão nem modelo.${nenhuma}${avisoSem}
${economia ? `ECONOMIA × GASOLINA: a conta de cada modelo já está pronta ("economia"), com gasolina a ${`R$ ${economia.gasolina.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} o litro${economia.origemGasolina ? ` (${economia.origemGasolina}, pesquisa semanal da ANP; diga isso ao cliente)` : ""} e moto a gasolina fazendo ${economia.kmPorLitro} km por litro. Use SÓ esses valores, sem refazer conta: ${opcoes.kmSemana ? `o cliente roda uns ${opcoes.kmSemana} km por semana, use a CONTA DO CLIENTE (semana e mês)` : "o cliente ainda não disse quanto roda: pergunte, ou use o cenário de km por semana mais perto do que ele contou"}.
` : ""}${itens.join("\n")}`;
  return {
    texto,
    nomes: Array.from(new Set(linhas.flatMap((l) => [l.nome, l.marca]).filter((x): x is string => !!x))),
    comEstoque: Array.from(new Set(comEstoque)),
    /* por moto sem unidade: os nomes que não podem aparecer na resposta (quem monta as Deps tira as que o cliente citou) */
    semEstoque: semEstoque.map((x) => x.apelidos),
  };
}

