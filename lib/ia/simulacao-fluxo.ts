/* O que a loja responde quando o cliente fala em simular (relatório "Taxas da maquineta" do dono, 10/10/2026: "automação
   linear, sem margem para erro e sem colocar a IA para decidir"). Puro (sem banco): recebe o que o cliente escreveu, a
   última fala da loja, a moto, o preço e as taxas, e devolve UMA ação com o texto pronto. A IA não escreve nenhum valor.
   Quem executa é lib/ia/workflow/nos.ts; testes em tests/unit/simulacao-fluxo.test.ts.

   Ordem das decisões:
   1. Respondeu "sim/não" à pergunta do Amex acima de 12x → "sim" calcula; "não" pergunta em quantas vezes, até 12x.
   2. Sem saber a moto → pergunta qual (uma vez; perguntou e ainda não sabe → vendedor).
   3. Débito → com a bandeira, calcula; sem, pergunta a bandeira.
   4. Crédito → nada dito: avisa da taxa e pergunta em quantas vezes; bandeira sem parcelas: pergunta em quantas vezes;
      parcelas sem bandeira: pergunta a bandeira; as duas: calcula SÓ as pedidas (Milton, 12/10/2026: nunca a tabela
      inteira). Amex acima de 12x: pergunta se o cartão permite. Acima de 21x: vai o 21x, avisando do limite.
   5. Falou em entrada sem dizer o valor, bandeira sem tabela (Hipercard, Diners) → o vendedor faz. */
import {
  PERGUNTA_AMEX_ATE_12,
  PERGUNTA_PARCELAS,
  PERGUNTA_QUAL_MOTO,
  PERGUNTA_SO_PARCELAS,
  PERGUNTA_SO_BANDEIRA,
  RX_PERGUNTOU_AMEX,
  RX_PERGUNTOU_MOTO,
  respostaSimNao,
  RX_LOJA_PERGUNTOU_VEZES,
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
  /* "em 21" sozinho vale como parcelas quando a loja perguntou "em quantas vezes" (agora) ou acabou de pedir a bandeira
     depois dessa pergunta (antes: o "em 21" veio numa mensagem e o "visa" na seguinte) */
  const agora = simulacaoPedida(p.textoCliente, RX_LOJA_PERGUNTOU_VEZES.test(loja));
  const antes = simulacaoPedida(p.recentesCliente, /quantas vezes|bandeira/.test(loja));
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
    /* não permite: pergunta em quantas vezes até 12x (Milton, 12/10/2026: só o que o cliente pedir, nada de tabela) */
    if (resp === "nao") return { acao: "perguntar", texto: PERGUNTA_AMEX_ATE_12 };
  }

  /* a bandeira dita antes, ou a da última fala da loja ("No American Express dá pra parcelar em até 12 vezes. Em quantas
     vezes?", "No Visa, em 12 vezes: ..." e o cliente pergunta "e em 18?") */
  const bandeira = agora.bandeira ?? antes.bandeira ?? simulacaoPedida(p.ultimaDaLoja).bandeira;
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
  const pedidas = agora.todas.length ? agora.todas : antes.todas;
  /* Milton (12/10/2026): sem saber em quantas vezes, avisa da taxa e pergunta; nunca a tabela inteira */
  if (!pedidas.length && !bandeira) return { acao: "perguntar", texto: PERGUNTA_PARCELAS };
  if (!pedidas.length) {
    if (!tabelaCompleta({ preco, bandeira, entrada }, taxas).length) return vendedor(null, bandeira, "bandeira_sem_tabela");
    return p.jaPerguntou?.("parcelas") ? vendedor(null, bandeira) : { acao: "perguntar", texto: PERGUNTA_SO_PARCELAS };
  }
  if (!bandeira) return p.jaPerguntou?.("bandeira") ? vendedor(pedidas[0], null) : { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA };
  /* pediu mais que 21x (ex.: 22x): vai o máximo, 21x (Milton, 12/10/2026) */
  const passou = pedidas.some((n) => n > MAX_PARCELAS);
  const todas = Array.from(new Set(pedidas.map((n) => Math.min(n, MAX_PARCELAS))));
  if (bandeira === "American Express" && todas.some((n) => n > AMEX_ATE)) return { acao: "perguntar", texto: textoSimulacaoConsultar({ motivo: "amex_acima_12", modelo, parcelas: Math.max(...todas) }) };

  const resultados = todas.map((n) => simularCartao({ preco, parcelas: n, bandeira, entrada }, taxas));
  const ok = resultados.filter((r) => r.tipo === "ok");
  if (ok.length !== resultados.length || !ok.length) {
    const semTabela = resultados.some((r) => r.tipo === "consultar" && r.motivo === "bandeira_sem_tabela");
    return vendedor(todas[0], bandeira, semTabela ? "bandeira_sem_tabela" : undefined);
  }
  const registro = `${modelo} no ${bandeira}${entrada ? ` com entrada de ${reais(entrada)}` : ""}: ${ok.map((r) => `${linhaRegistro(r.parcelas, r.parcela, r.total)} [taxa ${r.taxa}%]`).join("; ")}`;
  const limite = passou ? `No cartão o máximo é ${MAX_PARCELAS} vezes, então simulei em ${MAX_PARCELAS} 😉

` : "";
  if (ok.length === 1) {
    const r = ok[0];
    return { acao: "enviar", texto: limite + textoSimulacaoPronta({ nome: p.nome, modelo, aVista: r.aVista, parcelas: r.parcelas, bandeira: r.bandeira, parcela: r.parcela, total: r.total, entrada: r.entrada }), registro };
  }
  return {
    acao: "enviar",
    texto: limite + textoTabelaCompleta({ nome: p.nome, modelo, bandeira, aVista: preco, entrada: entrada ?? undefined, linhas: ok.map((r) => ({ parcelas: r.parcelas, parcela: r.parcela, total: r.total })) }),
    registro,
  };
}
