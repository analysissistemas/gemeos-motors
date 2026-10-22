/* Foto e áudio do cliente (dono, 10/10/2026: "as pessoas estão mandando foto e a IA está oferecendo motos nada a ver";
   antes, 08 e 09/10/2026). O cliente manda de qualquer jeito (foto só, com legenda, foto e depois "tem essa?", áudio)
   e muitas vezes é moto que a loja nem trabalha. Reconhecer a moto pela foto erra, então a IA NUNCA tenta:
   - chegou foto ou áudio e o cliente não escreveu o nome de um modelo: vai o catálogo (texto do sistema), sem
     dizer que a loja tem a moto da foto;
   - catálogo já foi e o cliente pergunta "tem essa?" sem dizer o nome: a IA diz que pela foto não confirma e pede
     o nome ou a escolha no catálogo (sem mandar o link de novo);
   - escreveu o nome de um modelo: atendimento normal, só daquele modelo.
   Assistência (foto do defeito) e recado ficam fora: seguem o caminho deles.
   Áudio TRANSCRITO (desde 12/10/2026, Mayna Dornelas: o áudio explicava o problema do aparelho e a IA não ouviu) vale
   como texto: a IA entende o assunto e responde; o catálogo só vai para áudio sem transcrição.
   Puro (sem banco), testado em tests/unit/foto-cliente.test.ts. Quem usa é lib/ia/workflow/nos.ts. */
import { ultimaCitada } from "./midia-tipos.ts";

export const TEXTO_CATALOGO_FOTO =
  "Recebi a sua foto! 😊 Pela foto eu não consigo confirmar o modelo, mas aqui estão todos os que a gente tem, com foto e preço: gemeosmotors.com.br. Me diz qual te chamou atenção, ou o nome do modelo que você procura, que eu confiro pra você.";
export const TEXTO_CATALOGO_AUDIO =
  "Recebi o seu áudio! 😊 Pra te atender direitinho, dá uma olhadinha no nosso catálogo com todos os modelos, fotos e preços: gemeosmotors.com.br. Me conta qual te chamou atenção, ou escreve aqui o que você procura que eu te ajudo.";
/* "O que vocês têm?" e "tem modelo parecido?" (dono, 19/10/2026, com os textos dele de exemplo): o site, não a lista do
   estoque ("aqui esse estoque pode deixar confuso"). No site o cliente clica na moto e a mensagem chega com o modelo. */
export const RX_MODELO_PARECIDO = /(?:modelo|moto|algo|alguma|outra|outro)\s+(?:\p{L}+\s+)?(?:parecid[oa]|semelhante|igual|nesse estilo|desse tipo|tipo ess[ae])/iu;
const comNome = (nome: string | null | undefined, frase: string) => (nome ? `${nome}, ${frase[0].toLowerCase()}${frase.slice(1)}` : frase);
export const textoSiteOpcoes = (nome?: string | null) =>
  `${comNome(nome, "Temos uma boa variedade de modelos! 😃")} No nosso site você vê todos, com foto, preço e cores: gemeosmotors.com.br\n\nÉ só clicar na moto que te agradar que ela chega aqui pra mim e eu te passo tudo certinho 😉`;
export const textoSiteParecido = (nome?: string | null) =>
  `${comNome(nome, "Temos uma grande variedade de modelos, com opções pra diferentes gostos e necessidades! 🛵")} Dá uma olhada no nosso site e veja se tem algum parecido: gemeosmotors.com.br\n\nAchou um que gostou? É só clicar nele que chega aqui pra mim e eu te ajudo 🤝`;
export const TEXTO_FOTO_NAO_CONFIRMA =
  "Pela foto eu não consigo confirmar qual é o modelo 😊 Me diz o nome dele, ou qual do catálogo te chamou atenção, que eu confiro pra você se a gente tem.";
export const TEXTO_AUDIO_NAO_OUVE =
  "Por aqui eu ainda não consigo ouvir áudio 😊 Me escreve o que você procura, ou qual modelo do catálogo te chamou atenção, que eu te ajudo.";

/* o que o buffer traz de mídia: textoDaMensagem rotula "[imagem]" / "[imagem: legenda]" e "[áudio] ..." */
const RX_FOTO_NO_BUFFER = /^\[imagem[\]:]/mu;
const RX_AUDIO_NO_BUFFER = /^\[áudio[\]\s]/mu;
/* áudio que ficou sem transcrição (falhou, ou a transcrição está desligada no workflow) */
const RX_AUDIO_SEM_TEXTO = /^\[áudio\](?:\s*\(o cliente mandou um áudio; a IA não o transcreve\))?\s*$/u;
const blocos = (textoBuffer: string) => textoBuffer.split(/\n\s*\n/).map((b) => b.trim());
/** Tem áudio no buffer que ficou sem transcrição. */
const audioNaoOuvido = (textoBuffer: string) => blocos(textoBuffer).some((b) => RX_AUDIO_SEM_TEXTO.test(b));
/** Tem áudio transcrito no buffer. */
const audioOuvido = (textoBuffer: string) => blocos(textoBuffer).some((b) => /^\[áudio\]\s+\S/u.test(b) && !RX_AUDIO_SEM_TEXTO.test(b));
/* a loja já mandou o catálogo por causa de foto ou áudio (os textos acima) */
const RX_JA_MANDOU_CATALOGO = /^Recebi (?:a sua foto|o seu áudio)!|^Pela foto eu não consigo|^Por aqui eu ainda não consigo ouvir/u;
/* "tem essa?", "quanto é essa aí?", "é igual a da foto", "vocês têm essa moto?" */
const RX_REFERE_FOTO = /(?<![\p{L}])(?:ess[ae]s?|dess[ae]s?|nessa|naquela|aquela|dela|igual|parecida|mesma|da\s+foto|do\s+[áa]udio)(?![\p{L}])/iu;

export type RespostaMidia = "catalogo_foto" | "catalogo_audio" | "foto_nao_confirma" | "audio_nao_ouve" | null;

export const TEXTO_DA_RESPOSTA: Record<Exclude<RespostaMidia, null>, string> = {
  catalogo_foto: TEXTO_CATALOGO_FOTO,
  catalogo_audio: TEXTO_CATALOGO_AUDIO,
  foto_nao_confirma: TEXTO_FOTO_NAO_CONFIRMA,
  audio_nao_ouve: TEXTO_AUDIO_NAO_OUVE,
};

export const temFotoNoBuffer = (textoBuffer: string) => RX_FOTO_NO_BUFFER.test(textoBuffer);

/** O texto que o próprio cliente escreveu no buffer (legenda da foto e mensagens de texto), sem os rótulos de mídia. */
function escritoPeloCliente(textoBuffer: string) {
  return textoBuffer
    .split(/\n\s*\n/)
    /* "[imagem: legenda] (modelo escrito na foto: X)": a legenda e o modelo lido na foto ficam */
    .map((b) => b.replace(/^\[imagem:\s*([\s\S]*?)\]((?:\s*\(modelo escrito na foto:[^)]*\))?)$/u, "$1$2").replace(/^\[(?:imagem|áudio|vídeo|documento)[^\]]*\]\s*/u, ""))
    .join("\n")
    .trim();
}

/** Resposta do sistema para foto/áudio do cliente; null = a IA responde normalmente. */
export function respostaParaMidia(p: {
  textoBuffer: string;
  /** a última fala da loja (para não mandar o catálogo duas vezes seguidas) */
  ultimaDaLoja: string;
  /** nomes dos modelos do catálogo (ativos) */
  modelos: string[];
  /** assistência ou recado: foto do defeito não é pergunta de compra */
  foraDaVenda: boolean;
}): RespostaMidia {
  if (p.foraDaVenda) return null;
  const escrito = escritoPeloCliente(p.textoBuffer);
  /* escreveu o nome de um modelo da loja: a IA atende sobre ele */
  if (ultimaCitada(p.modelos.map((nome) => ({ nome })), escrito)) return null;
  const foto = RX_FOTO_NO_BUFFER.test(p.textoBuffer);
  const audio = audioNaoOuvido(p.textoBuffer);
  const jaMandou = RX_JA_MANDOU_CATALOGO.test(p.ultimaDaLoja.trim());
  if (foto) return jaMandou ? "foto_nao_confirma" : "catalogo_foto";
  if (audio) return jaMandou ? "audio_nao_ouve" : "catalogo_audio";
  /* só texto, logo depois do catálogo da foto: "tem essa?" sem o nome */
  if (jaMandou && RX_REFERE_FOTO.test(escrito)) return /áudio/u.test(p.ultimaDaLoja) ? "audio_nao_ouve" : "foto_nao_confirma";
  return null;
}

/** Instrução para a IA quando a foto veio junto com o nome de um modelo: ela não vê a foto. */
export function instrucaoDeFoto(textoBuffer: string): string {
  if (!RX_FOTO_NO_BUFFER.test(textoBuffer)) return "";
  return "# FOTO DO CLIENTE\nO cliente mandou uma foto, mas você NÃO vê a foto. Nunca diga qual moto é a da foto, que é parecida com algum modelo, nem que a loja tem a moto da foto. Fale só do modelo que ele escreveu pelo nome. Se ele citar uma moto que não está no CATÁLOGO, diga que esse modelo a loja não trabalha e convide a ver os modelos em gemeosmotors.com.br.\n\n";
}

/** Instrução para a IA quando o áudio do cliente foi transcrito: entender e responder, sem adivinhar moto. */
export function instrucaoDeAudio(textoBuffer: string): string {
  if (!RX_AUDIO_NO_BUFFER.test(textoBuffer) || !audioOuvido(textoBuffer)) return "";
  return "# ÁUDIO DO CLIENTE\nO texto depois de [áudio] é a transcrição automática do áudio do cliente: pode ter palavra trocada. Use para ENTENDER o que ele quer (compra, dúvida, problema com o que comprou, recado) e responda a isso. Nunca sugira nem escolha um modelo que ele não falou; se o nome de modelo na transcrição não bater com o CATÁLOGO, pergunte qual modelo ele quis dizer. Não diga que ouviu ou transcreveu o áudio.\n\n";
}

export type ItemDisponivel = { nome: string; tipo: string; cores: string[]; preco: number | null; autonomia: string | null; destaque: string | null };
const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })}`;
/* falou de moto: patinete fica de fora; falou de patinete: só patinete (Guilherme, 07/10/2026) */
const RX_FALOU_MOTO = /(?<![\p{L}])(?:motos?|mot(?:inha|oquinha)s?|scooters?|triciclos?)(?![\p{L}])/iu;
const RX_FALOU_PATINETE = /(?<![\p{L}])patinetes?(?![\p{L}])/iu;
/** Lista do que tem em estoque, montada pelo sistema (usuário, 12/10/2026: "quero que a IA mande a lista dos disponíveis"),
 *  depois do catálogo, quando o cliente manda foto ou áudio. Só unidade Disponível, com as cores e o preço reais. */
export function listaDisponiveis(itens: ItemDisponivel[], textoCliente: string): string | null {
  const escrito = escritoPeloCliente(textoCliente);
  const moto = RX_FALOU_MOTO.test(escrito);
  const patinete = RX_FALOU_PATINETE.test(escrito);
  const filtrados = itens.filter((i) => (moto && !patinete ? i.tipo !== "patinete" : patinete && !moto ? i.tipo === "patinete" : true)).filter((i) => i.preco);
  if (!filtrados.length) return null;
  const linhas = filtrados.slice(0, 9).map((i) => {
    const cores = i.cores.length ? ` (${i.cores.map((c) => c.toLowerCase()).join(", ")})` : "";
    /* "Até 70 km" na ficha da T1: no meio da frase vai minúsculo */
    const sobre = [i.destaque, i.autonomia ? `autonomia de ${i.autonomia.charAt(0).toLowerCase()}${i.autonomia.slice(1)}` : null].filter(Boolean).join(", ");
    return `• *${i.nome}*${cores}${sobre ? ` – ${sobre}` : ""} – ${brl(i.preco!)}`;
  });
  const oque = moto && !patinete ? "motos elétricas" : patinete && !moto ? "patinetes elétricos" : "motos e patinetes elétricos";
  return `Tenho estas ${oque} disponíveis para pronta entrega:\n${linhas.join("\n")}`;
}
