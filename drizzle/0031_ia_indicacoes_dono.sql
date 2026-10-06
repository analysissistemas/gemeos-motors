-- Treino da IA pelo dono (05/10/2026): "A X gêmeos é conhecida como pneu largo, aquelas motos na pegada de
-- motoqueiro fantasma. Motos que ele pode indicar com maior garantia e autonomia, fazem até 70: T3, T1 e T5.
-- A Tank a autonomia está 65, ela é 45/55".
-- Tank AG11: 45 a 55 km por carga (a conta de economia passa a usar 45).
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"autonomia":"45 a 55 km"}'::jsonb
WHERE upper(trim("nome")) IN ('TANK AG11', 'AG11', 'TANK');--> statement-breakpoint
-- T1, T3 Retrô e T5 Retrô: até 70 km
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"autonomia":"Até 70 km"}'::jsonb
WHERE upper(trim("nome")) ~ '^T[135]( |$)';--> statement-breakpoint
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT 'Produtos', 'Indicações do dono: autonomia, garantia e apelidos', $t$Cliente que quer a moto que roda mais, que vai rodar muito por dia ou que quer mais garantia: indique a T3, a T1 e a T5. São as de maior autonomia da loja (fazem até 70 km com uma carga) e as de maior garantia. Ofereça só as que estiverem EM ESTOQUE.
A X Gêmeos é a moto conhecida como "pneu largo": pneu bem largo, na pegada do Motoqueiro Fantasma. Cliente que fala em "pneu largo", "pneu gordo", "pneuzão" ou "moto do Motoqueiro Fantasma" está falando da X Gêmeos.
A Tank AG11 faz de 45 a 55 km com uma carga. Nunca diga 64 ou 65 km.$t$
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" WHERE "titulo" = 'Indicações do dono: autonomia, garantia e apelidos');
