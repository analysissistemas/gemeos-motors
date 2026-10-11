/* O que a loja responde quando o cliente fala em simular (relatório "Taxas da maquineta" do dono, 10/10/2026: "automação
   linear, sem margem para erro e sem colocar a IA para decidir"). Puro (sem banco): recebe o que o cliente escreveu, a
   última fala da loja, a moto, o preço e as taxas, e devolve UMA ação com o texto pronto. A IA não escreve nenhum valor.
   Quem executa é lib/ia/workflow/nos.ts; testes em tests/unit/simulacao-fluxo.test.ts.

   Ordem das decisões:
   1. Respondeu "sim/não" à pergunta do Amex acima de 12x → "sim" calcula; "não" manda a tabela até 12x.
   2. Sem saber a moto → pergunta qual (uma vez; perguntou e ainda não sabe → vendedor).
   3. Débito → com a bandeira, calcula; sem, pergunta a bandeira.
   4. Crédito → bandeira sem parcelas: tabela completa; parcelas sem bandeira: pergunta a bandeira; as duas: calcula
      (uma ou várias quantidades). Amex acima de 12x: pergunta se o cartão permite. Acima de 21x: diz o limite.
   5. Falou em entrada sem dizer o valor, bandeira sem tabela (Hipercard, Diners) → o vendedor faz. */
import {
  PERGUNTA_PARCELAS,
  PERGUNTA_QUAL_MOTO,
  PERGUNTA_SO_BANDEIRA,
  RX_PERGUNTOU_AMEX,
  RX_PERGUNTOU_MOTO,
  respostaSimNao,
  simulacaoPedida,
  textoSimulacao,
  textoSimulacaoConsultar,
  textoSimulacaoDebito,
  textoSimulacaoPronta,
  textoTabelaCompleta,
} from "./fechamento.ts";
import { AMEX_ATE, entradaDoTexto, MAX_PARCELAS, simularCartao, tabelaCompleta, TAXAS_PADRAO, type TaxasMaquineta } from "./simulacao-cartao.ts";

export type AcaoSimulacao =
  /** o sistema manda a conta; `registro` vai para a conversa da equipe */
  | { acao: "enviar"; texto: string; registro: string }
  /** falta um dado: o sistema pergunta (nunca chuta) */
  | { acao: "perguntar"; texto: string }
  /** o vendedor faz: o sistema cria a tarefa e avisa o cliente */
  | { acao: "vendedor"; texto: string; pedido: { parcelas: number | null; bandeira: string | null } };

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const reais = (x: number) => x.toFixed(2);
const linhaRegistro = (n: number, parcela: number, total: number) => `${n}x de ${reais(parcela)} (total ${reais(total)})`;

export function decidirSimulacao(p: {
  /** o que o cliente mandou agora (buffer) */
  textoCliente: string;
  /** as últimas falas do cliente antes desta (parcelas/bandeira ditas antes) */
  recentesCliente: string;
  ultimaDaLoja: string;
  modelo: string | null;
  preco: number | null;
  nome: string | null;
  taxas?: TaxasMaquineta;
  /** a loja já perguntou SÓ isso na última fala e o cliente seguiu sem responder: não pergunta de novo */
  jaPerguntou?: (o: "parcelas" | "bandeira") => boolean;
}): AcaoSimulacao {
  const taxas = p.taxas ?? TAXAS_PADRAO;
  const loja = semAcento(p.ultimaDaLoja);
  const agora = simulacaoPedida(p.textoCliente);
  const antes = simulacaoPedida(p.recentesCliente);
  const entrada = entradaDoTexto(p.textoCliente);
  const falouEntrada = /entrada/i.test(p.textoCliente);
  const vendedor = (parcelas: number | null, bandeira: string | null, motivo?: "bandeira_sem_tabela"): AcaoSimulacao => ({
    acao: "vendedor",
    texto: motivo ? textoSimulacaoConsultar({ motivo, modelo: p.modelo }) : textoSimulacao({ parcelas, bandeira, modelo: p.modelo }),
    pedido: { parcelas, bandeira },
  });

  /* 2. sem a moto (ou sem preço no catálogo) não há conta */
  if (!p.modelo || !p.preco) {
    if (!RX_PERGUNTOU_MOTO.test(loja) && !p.modelo) return { acao: "perguntar", texto: PERGUNTA_QUAL_MOTO };
    return vendedor(agora.parcelas ?? antes.parcelas, agora.bandeira ?? antes.bandeira);
  }
  const modelo = p.modelo;
  const preco = p.preco;
  /* falou em entrada sem dizer quanto: o vendedor combina */
  if (falouEntrada && !entrada) return vendedor(agora.parcelas ?? antes.parcelas, agora.bandeira ?? antes.bandeira);

  /* 1. resposta à pergunta do Amex ("o seu cartão permite parcelar em 18 vezes?"), sem pedir outra coisa */
  if (RX_PERGUNTOU_AMEX.test(loja) && !agora.parcelas && !agora.bandeira) {
    const resp = respostaSimNao(p.textoCliente);
    /* a pergunta diz "acima de 12 vezes ... em 18 vezes?": vale a última quantidade */
    const n = simulacaoPedida(p.ultimaDaLoja).todas.at(-1) ?? null;
    if (resp === "sim" && n) {
      const r = simularCartao({ preco, parcelas: n, bandeira: "American Express", entrada, amexConfirmado: true }, taxas);
      if (r.tipo === "ok")
        return {
          acao: "enviar",
          texto: textoSimulacaoPronta({ nome: p.nome, modelo, aVista: r.aVista, parcelas: r.parcelas, bandeira: r.bandeira, parcela: r.parcela, total: r.total, entrada: r.entrada }),
          registro: `${modelo}, ${n}x no American Express (cliente confirmou que o cartão permite; taxa ${r.taxa}%): ${linhaRegistro(n, r.parcela, r.total)}`,
        };
    }
    if (resp === "nao") {
      const linhas = tabelaCompleta({ preco, bandeira: "American Express", entrada }, taxas);
      return {
        acao: "enviar",
        texto: textoTabelaCompleta({ nome: p.nome, modelo, bandeira: "American Express", aVista: preco, entrada: entrada ?? undefined, linhas }),
        registro: `${modelo} no American Express até ${AMEX_ATE}x (o cartão do cliente não permite mais)`,
      };
    }
  }

  const bandeira = agora.bandeira ?? antes.bandeira;
  /* 3. débito: só falta a bandeira */
  const debito = agora.debito || (antes.debito && !agora.parcelas);
  if (debito) {
    if (!bandeira) return p.jaPerguntou?.("bandeira") ? vendedor(null, null) : { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA };
    const r = simularCartao({ preco, parcelas: 1, bandeira, entrada, modalidade: "debito" }, taxas);
    if (r.tipo !== "ok") return vendedor(null, bandeira, r.motivo === "bandeira_sem_tabela" ? "bandeira_sem_tabela" : undefined);
    return {
      acao: "enviar",
      texto: textoSimulacaoDebito({ nome: p.nome, modelo, aVista: preco, bandeira: r.bandeira, total: r.total }),
      registro: `${modelo}, débito ${r.bandeira} (taxa ${r.taxa}%): total ${reais(r.total)}`,
    };
  }

  /* 4. crédito */
  const todas = agora.todas.length ? agora.todas : antes.todas;
  if (!todas.length && !bandeira) return { acao: "perguntar", texto: PERGUNTA_PARCELAS };
  if (!todas.length) {
    /* bandeira sem parcelas: a tabela completa vai de uma vez */
    const linhas = tabelaCompleta({ preco, bandeira, entrada }, taxas);
    if (!linhas.length) return vendedor(null, bandeira, "bandeira_sem_tabela");
    return {
      acao: "enviar",
      texto: textoTabelaCompleta({ nome: p.nome, modelo, bandeira: bandeira!, aVista: preco, entrada: entrada ?? undefined, linhas }),
      registro: `${modelo} no ${bandeira}: tabela de 2x a ${linhas[linhas.length - 1].parcelas}x`,
    };
  }
  if (!bandeira) return p.jaPerguntou?.("bandeira") ? vendedor(todas[0], null) : { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA };
  if (todas.some((n) => n > MAX_PARCELAS)) return { acao: "perguntar", texto: textoSimulacaoConsultar({ motivo: "parcelas_acima_de_21", modelo }) };
  if (bandeira === "American Express" && todas.some((n) => n > AMEX_ATE)) return { acao: "perguntar", texto: textoSimulacaoConsultar({ motivo: "amex_acima_12", modelo, parcelas: Math.max(...todas) }) };

  const resultados = todas.map((n) => simularCartao({ preco, parcelas: n, bandeira, entrada }, taxas));
  const ok = resultados.filter((r) => r.tipo === "ok");
  if (ok.length !== resultados.length || !ok.length) {
    const semTabela = resultados.some((r) => r.tipo === "consultar" && r.motivo === "bandeira_sem_tabela");
    return vendedor(todas[0], bandeira, semTabela ? "bandeira_sem_tabela" : undefined);
  }
  const registro = `${modelo} no ${bandeira}${entrada ? ` com entrada de ${reais(entrada)}` : ""}: ${ok.map((r) => `${linhaRegistro(r.parcelas, r.parcela, r.total)} [taxa ${r.taxa}%]`).join("; ")}`;
  if (ok.length === 1) {
    const r = ok[0];
    return { acao: "enviar", texto: textoSimulacaoPronta({ nome: p.nome, modelo, aVista: r.aVista, parcelas: r.parcelas, bandeira: r.bandeira, parcela: r.parcela, total: r.total, entrada: r.entrada }), registro };
  }
  return {
    acao: "enviar",
    texto: textoTabelaCompleta({ nome: p.nome, modelo, bandeira, aVista: preco, entrada: entrada ?? undefined, linhas: ok.map((r) => ({ parcelas: r.parcelas, parcela: r.parcela, total: r.total })) }),
    registro,
  };
}
