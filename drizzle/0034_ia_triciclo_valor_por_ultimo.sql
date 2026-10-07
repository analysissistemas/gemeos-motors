-- 06/10/2026: a loja NÃO tem triciclo (a IA chamou a T3 Retrô, de duas rodas, de "triciclo elétrico").
UPDATE "ia_prompt_versoes"
SET "conteudo" = replace("conteudo", 'A loja vende moto elétrica (inclusive a de três rodas, que também é moto elétrica) e acessórios.', 'A loja vende motos elétricas de DUAS rodas (scooters), patinetes elétricos e acessórios. NÃO vende triciclo (três rodas): se o cliente pedir triciclo, diga com naturalidade que não trabalha com esse tipo e apresente as motos elétricas.')
WHERE "secao" = 'produtos' AND "conteudo" LIKE '%inclusive a de três rodas%';
