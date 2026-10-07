-- 06/10/2026: o dono confirmou que o MM3 tem TRÊS rodas (a 0034 dizia que a loja não tem triciclo).
UPDATE "ia_prompt_versoes"
SET "conteudo" = replace("conteudo", 'A loja vende motos elétricas de DUAS rodas (scooters), patinetes elétricos e acessórios. NÃO vende triciclo (três rodas): se o cliente pedir triciclo, diga com naturalidade que não trabalha com esse tipo e apresente as motos elétricas.', 'A loja vende motos elétricas, patinetes elétricos e acessórios. O triciclo (três rodas) é só o modelo cuja descrição no catálogo diz "triciclo" ou "três rodas" (o MM3); as outras motos são de duas rodas (o nome "T3" não quer dizer três rodas).')
WHERE "secao" = 'produtos' AND "conteudo" LIKE '%NÃO vende triciclo%';
