-- Milton (20/10/2026): "T3 retrô, T5 retrô são conhecidas como vespa". O sistema já indica as retrô quando o cliente
-- fala em vespa (lib/ia/necessidade.ts); aqui a IA aprende o apelido para responder no texto livre.
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT 'Produtos', 'Apelido: vespa', $t$A T3 Retrô e a T5 Retrô são as motos que os clientes chamam de "vespa" (o visual retrô, estilo Vespa). Cliente que pergunta por "vespa", "a vespinha" ou "moto estilo vespa" está falando delas: apresente as que estiverem EM ESTOQUE. Nunca diga que a loja não tem vespa.$t$
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" WHERE "titulo" = 'Apelido: vespa');--> statement-breakpoint
-- Cyanthya (19/10/2026) perguntou "Onde fica a assistência?" sobre a T3 Retrô: a base tinha o endereço da loja, mas não
-- dizia que a assistência técnica é a da própria loja.
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT 'Garantia e assistência', 'Onde fica a assistência', $t$A assistência técnica é da própria loja e fica no mesmo endereço: Rodovia Margem da PE-75, nº 1418, Goiana (PE). Quem compra aqui tem a garantia e o suporte da própria Gêmeos Motors. Para quem mora longe, a loja combina a busca da moto.$t$
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" WHERE "titulo" = 'Onde fica a assistência');
