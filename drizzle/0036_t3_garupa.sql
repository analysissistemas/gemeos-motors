-- 07/10/2026: o dono confirmou que a T3 Retrô leva garupa (a IA tinha dito "pensada para um piloto"). A descrição estava vazia.
UPDATE "modelos"
SET "descricao" = 'Leva garupa: duas pessoas, respeitando a carga máxima de 180 kg.'
WHERE "nome" = 'T3 RETRÔ' AND ("descricao" IS NULL OR btrim("descricao") = '');
