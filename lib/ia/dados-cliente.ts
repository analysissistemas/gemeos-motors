/* Lê os dados que o cliente manda para fechar o pedido (lista do Milton: nome completo, CPF, número para
   contato, data de nascimento, cidade, CEP, rua, bairro, número, ponto de referência, até que horas pode
   receber, forma de pagamento). Pedido do dono (03/10/2026): "o objetivo da IA é pegar essas informações e
   guardar no CRM, com o resumo, para daí em diante a equipe assumir". Puro: sem banco.

   O cliente responde do jeito dele: com rótulo ("CPF: 111..."), sem rótulo (uma informação por linha) ou
   tudo numa linha só com vírgulas. Primeiro valem os rótulos; o que sobrar é reconhecido pelo formato
   (CPF com dígito verificador, CEP, data, telefone, "Rua ...", "até 18h", "Pix"...). Na dúvida, não
   preenche: dado errado no cadastro é pior que dado faltando. */

export type DadosCliente = {
  nomeCompleto?: string;
  cpf?: string; // só dígitos, conferido
  telefone?: string; // só dígitos, com DDD
  nascimento?: string; // AAAA-MM-DD
  cidade?: string;
  cep?: string; // só dígitos
  rua?: string;
  numero?: string;
  bairro?: string;
  referencia?: string;
  horario?: string;
  pagamento?: string;
};

const soDigitos = (s: string) => s.replace(/\D/g, "");
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const limpar = (s: string) => s.replace(/^[\s•\-*·]+|[\s.;,]+$/g, "").replace(/\s+/g, " ").trim();

/** CPF com os dois dígitos verificadores certos (e não "111.111.111-11"). */
export function cpfValido(cpf: string) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function dataNascimento(s: string): string | undefined {
  const m = /(?<!\d)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?!\d)/.exec(s);
  if (!m) return undefined;
  let ano = Number(m[3]);
  if (ano < 100) ano += ano > 30 ? 1900 : 2000;
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  const hoje = new Date().getFullYear();
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > hoje - 10) return undefined;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const PAGAMENTOS: [RegExp, string][] = [
  [/\bpix\b/, "Pix"],
  [/\bdinheiro\b|\bespecie\b|a vista em dinheiro/, "Dinheiro"],
  [/\bdebito\b/, "Cartão de débito"],
  [/\bcredito\b|\bcartao\b|\d{1,2}\s?x\b|parcelad/, "Cartão de crédito"],
  [/\btransferencia\b|\bted\b|\bdoc\b/, "Transferência"],
];
function pagamentoDe(s: string) {
  const t = semAcento(s);
  const achados = PAGAMENTOS.filter(([rx]) => rx.test(t)).map(([, nome]) => nome);
  if (!achados.length) return undefined;
  const parcelas = /(\d{1,2})\s?x\b/.exec(t);
  return achados.join(" + ") + (parcelas && achados.includes("Cartão de crédito") ? ` (${parcelas[1]}x)` : "");
}

/* rótulos que o cliente costuma escrever (a lista do Milton e variações) */
const ROTULOS: [RegExp, keyof DadosCliente][] = [
  [/^nome( completo)?$/, "nomeCompleto"],
  [/^cpf$/, "cpf"],
  [/^(telefone|tel|celular|whats(app)?|contato)( (pra|para|de) contato)?$|^numero (pra|para|de) contato$/, "telefone"],
  [/^(data( de)? )?nasc(imento)?$/, "nascimento"],
  [/^cidade$/, "cidade"],
  [/^cep$/, "cep"],
  [/^(rua|endereco|avenida|av)$/, "rua"],
  [/^bairro$/, "bairro"],
  [/^(numero da casa|n[ºo°]?|numero|num|casa)$/, "numero"],
  [/^(ponto de )?referencia$/, "referencia"],
  [/^(ate que horas.*|horario.*|hora.*receber.*)$/, "horario"],
  [/^(forma de )?pagamento$/, "pagamento"],
];

function aplicar(d: DadosCliente, campo: keyof DadosCliente, valorBruto: string) {
  const v = limpar(valorBruto);
  if (!v) return;
  switch (campo) {
    case "cpf":
      if (cpfValido(v)) d.cpf = soDigitos(v);
      return;
    case "telefone": {
      const t = soDigitos(v);
      if (t.length >= 10 && t.length <= 13) d.telefone = t;
      return;
    }
    case "nascimento":
      d.nascimento = dataNascimento(v) ?? d.nascimento;
      return;
    case "cep": {
      const c = soDigitos(v);
      if (c.length === 8) d.cep = c;
      return;
    }
    case "pagamento":
      d.pagamento = pagamentoDe(v) ?? v.slice(0, 60);
      return;
    default:
      d[campo] = v.slice(0, 160);
  }
}

/** Os dados que dá para tirar da mensagem do cliente. Nada inventado: só o que ele escreveu. */
export function lerDadosDoCliente(texto: string): DadosCliente {
  const d: DadosCliente = {};
  /* uma informação por linha; tudo numa linha só? quebra nas vírgulas e ponto e vírgula entre rótulos */
  let linhas = texto.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length <= 2 && /[:;]/.test(texto)) linhas = texto.split(/[;\n]+|,(?=\s*[\p{L} ]{2,30}:)/u).map((l) => l.trim()).filter(Boolean);
  const sobra: string[] = [];
  for (const linha of linhas) {
    /* "Rótulo: valor", "Rótulo - valor" ou a pergunta da lista respondida na mesma linha ("Até que horas...? 17h") */
    const m = /^([^:?–-]{1,60})\s*[:?–-]\s*(.+)$/.exec(linha);
    const rotulo = m ? semAcento(limpar(m[1])) : "";
    const campo = m ? ROTULOS.find(([rx]) => rx.test(rotulo))?.[1] : undefined;
    if (m && campo) aplicar(d, campo, m[2]);
    else sobra.push(linha);
  }
  /* sem rótulo: pelo formato */
  for (const linha of sobra) {
    const t = semAcento(linha);
    const digitos = soDigitos(linha);
    const cpf = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/.exec(linha);
    if (!d.cpf && cpf && cpfValido(cpf[0])) {
      d.cpf = soDigitos(cpf[0]);
      continue;
    }
    if (!d.cep && /(?<!\d)\d{5}-\d{3}(?!\d)/.test(linha)) {
      d.cep = soDigitos(/(?<!\d)\d{5}-\d{3}(?!\d)/.exec(linha)![0]);
      continue;
    }
    if (!d.nascimento && dataNascimento(linha)) {
      d.nascimento = dataNascimento(linha);
      continue;
    }
    if (!d.horario && /\bate (as )?\d{1,2}(h|:\d{2}| horas)?\b|\b\d{1,2}h\b/.test(t) && !/\b(rua|av|avenida)\b/.test(t)) {
      d.horario = limpar(linha).slice(0, 80);
      continue;
    }
    if (!d.pagamento && pagamentoDe(linha) && digitos.length < 8) {
      d.pagamento = pagamentoDe(linha);
      continue;
    }
    if (!d.rua && /^(rua|r\.|avenida|av\.?|travessa|tv\.?|estrada|rodovia|sitio|loteamento|conjunto)\b/.test(t)) {
      /* "Rua das Flores, 120, Centro" → rua, número e bairro */
      const partes = linha.split(",").map(limpar).filter(Boolean);
      d.rua = partes[0].slice(0, 160);
      const num = partes.slice(1).find((p) => /^(n[ºo°]?\s*)?\d{1,6}[a-z]?$/i.test(p));
      if (num && !d.numero) d.numero = soDigitos(num) + (/[a-z]$/i.test(num) ? num.slice(-1).toUpperCase() : "");
      const resto = partes.slice(1).filter((p) => p !== num);
      if (resto[0] && !d.bairro && /^\p{L}/u.test(resto[0])) d.bairro = resto[0].slice(0, 80);
      continue;
    }
    if (!d.referencia && /\b(perto|proximo|em frente|ao lado|referencia|atras|esquina|vizinho)\b/.test(t)) {
      d.referencia = limpar(linha).slice(0, 160);
      continue;
    }
    if (!d.telefone && digitos.length >= 10 && digitos.length <= 13 && /^[\d\s()+\-.]+$/.test(linha)) {
      d.telefone = digitos;
      continue;
    }
    /* nome completo: a primeira linha só com letras, com nome e sobrenome */
    if (!d.nomeCompleto && /^[\p{L}' ]+$/u.test(limpar(linha)) && limpar(linha).split(" ").length >= 2 && limpar(linha).length <= 80) {
      d.nomeCompleto = limpar(linha)
        .split(" ")
        .map((p) => (/^(da|de|do|das|dos|e)$/i.test(p) ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase()))
        .join(" ");
      continue;
    }
  }
  return d;
}

/** O que ainda falta da lista, para a equipe saber o que conferir. */
export function camposFaltando(d: DadosCliente, modo: "entrega" | "retirada", ja: { cidade?: string | null; pagamento?: string | null } = {}) {
  const obrigatorios: [keyof DadosCliente, string][] =
    modo === "retirada"
      ? [["nomeCompleto", "nome completo"], ["cpf", "CPF"], ["horario", "dia e horário da retirada"]]
      : [
          ["nomeCompleto", "nome completo"],
          ["cpf", "CPF"],
          ["nascimento", "data de nascimento"],
          ["cep", "CEP"],
          ["rua", "rua"],
          ["numero", "número"],
          ["bairro", "bairro"],
          ["horario", "até que horas pode receber"],
        ];
  const faltam = obrigatorios.filter(([k]) => !d[k]).map(([, r]) => r);
  if (modo === "entrega" && !d.cidade && !ja.cidade) faltam.push("cidade");
  if (!d.pagamento && !ja.pagamento) faltam.push("forma de pagamento");
  return faltam;
}

/** Linha de endereço para o resumo (sem CPF, sem data de nascimento). */
export function enderecoDe(d: DadosCliente, cidade?: string | null) {
  return [d.rua && `${d.rua}${d.numero ? `, ${d.numero}` : ""}`, d.bairro, d.cidade ?? cidade ?? undefined, d.cep && `CEP ${d.cep.slice(0, 5)}-${d.cep.slice(5)}`]
    .filter(Boolean)
    .join(" · ");
}
