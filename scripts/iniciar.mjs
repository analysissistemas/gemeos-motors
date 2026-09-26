/* Porta de entrada do container no VPS (CMD do Dockerfile):
   1. confere a pasta da mídia do chat (volume /data do EasyPanel);
   2. aplica as migrations pendentes no banco de DATABASE_URL (banco novo e
      vazio ganha as tabelas sozinho; o que já foi aplicado não roda de novo);
   3. liga o servidor do Next (server.js).
   Sem DATABASE_URL, pula o passo 2 e sobe assim mesmo: a loja abre, e o
   sistema da equipe mostra erro até o banco ser configurado. */
import { accessSync, constants, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aplicarMigracoes } from "./migracoes.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1) mídia */
const pastaMidia = process.env.MIDIA_DIR || "/data/midia";
try {
  mkdirSync(path.join(pastaMidia, "chat"), { recursive: true });
  accessSync(path.join(pastaMidia, "chat"), constants.W_OK);
  console.log(`[iniciar] mídia do chat em ${pastaMidia}`);
} catch (e) {
  console.error(
    `[iniciar] ERRO: a pasta de mídia ${pastaMidia} não existe ou não aceita gravação (${e.code ?? e.message}).\n` +
      "          No EasyPanel, serviço sistema > Armazenamento: monte um volume em /data.\n" +
      "          Sem isso, fotos e áudios do atendimento se perderiam a cada implantação.",
  );
  process.exit(1);
}

/* 2) banco: tenta algumas vezes, porque o Postgres pode estar subindo junto */
const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[iniciar] DATABASE_URL não configurada: migrations puladas (a loja abre; o sistema da equipe não).");
} else {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await aplicarMigracoes(url);
      console.log("[iniciar] banco em dia (migrations aplicadas)");
      break;
    } catch (e) {
      const msg = `${e.code ?? ""} ${e.message ?? e}`.trim();
      if (tentativa >= 10) {
        console.error(`[iniciar] ERRO: não foi possível preparar o banco depois de ${tentativa} tentativas: ${msg}`);
        process.exit(1);
      }
      console.warn(`[iniciar] banco ainda indisponível (tentativa ${tentativa}/10): ${msg}`);
      await esperar(3000);
    }
  }
}

/* 3) servidor */
await import(pathToFileURL(process.env.SERVIDOR_JS || path.join(raiz, "server.js")).href);
