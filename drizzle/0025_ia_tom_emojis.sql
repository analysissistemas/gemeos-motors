-- Tom mais humano com emojis do assunto, sem ficar informal (pedido do dono, 27/09/2026).
-- Nova versão do setor "Tom de voz" a partir da publicada, trocando só a linha dos emojis.
-- Se a equipe já mudou essa linha na tela, nada acontece.
INSERT INTO "ia_prompt_versoes" ("secao", "versao", "conteudo", "status", "nota", "publicado_em")
SELECT 'tom', (SELECT COALESCE(MAX("versao"), 0) + 1 FROM "ia_prompt_versoes" WHERE "secao" = 'tom'),
  replace(p."conteudo", 'Emoji: no máximo um por mensagem, e só destes: 🙏 😊 🙂 🤝 ✅ 😉.',
    'Emoji: deixe a conversa calorosa com 1 ou 2 emojis por resposta (nunca em toda frase), que combinem com o assunto: 😊 🙂 😃 🙌 👍 🤝 🙏 ✅ ✨ 🎉 ⚡ 🔋 🔌 🛵 🏍️ 💰 📍 📲 🛠️ 💚 (ex.: 🔋 carga, 💰 economia, 📍 entrega, 🛵 a moto, ✅ confirmação).
Caloroso, mas profissional: nada de gíria nem intimidade demais ("mano", "véi", "kkk"); "Que ótimo!", "Perfeito!" e "Show!" com moderação.'),
  'arquivada', 'Emojis do assunto, tom profissional (27/09/2026)', now()
FROM "ia_prompt_versoes" p
WHERE p."secao" = 'tom' AND p."status" = 'publicada'
  AND p."conteudo" LIKE '%Emoji: no máximo um por mensagem, e só destes: 🙏 😊 🙂 🤝 ✅ 😉.%';--> statement-breakpoint
UPDATE "ia_prompt_versoes" SET "status" = 'arquivada'
WHERE "secao" = 'tom' AND "status" = 'publicada'
  AND EXISTS (SELECT 1 FROM "ia_prompt_versoes" WHERE "secao" = 'tom' AND "nota" = 'Emojis do assunto, tom profissional (27/09/2026)');--> statement-breakpoint
UPDATE "ia_prompt_versoes" SET "status" = 'publicada', "publicado_em" = now()
WHERE "secao" = 'tom' AND "nota" = 'Emojis do assunto, tom profissional (27/09/2026)'
  AND NOT EXISTS (SELECT 1 FROM "ia_prompt_versoes" WHERE "secao" = 'tom' AND "status" = 'publicada');
