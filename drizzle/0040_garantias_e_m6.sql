-- Garantia por modelo e autonomia da M6 (estoque do Milton e regra do usuário, 12/10/2026): linha T (T1, T3 RETRÔ, T5
-- RETRÔ; a T6 está chegando) tem 2 anos de garantia na bateria; o resto das motos, 1 ano; a linha mais baratinha (N2),
-- 6 meses (ainda não está no catálogo: preencher em Estoque → Catálogo quando entrar). Patinete fica para confirmar.
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"2 anos na bateria e 1 ano no restante da moto"}'::jsonb
WHERE upper(trim("nome")) IN ('T1', 'T3 RETRÔ', 'T5 RETRÔ', 'T6');--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"1 ano"}'::jsonb
WHERE upper(trim("nome")) IN ('TANK AG11', 'M6', 'AG08', 'DF17', 'TCN BASKET', 'MM3', 'X GÊMEOS');--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"6 meses"}'::jsonb
WHERE upper(trim("nome")) = 'N2';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"autonomia":"até 60 km"}'::jsonb
WHERE upper(trim("nome")) = 'M6';
--> statement-breakpoint
UPDATE "modelos" SET "descricao" = replace(replace("descricao", '45 a 55 km', 'até 60 km'), '45 a 55km', 'até 60 km')
WHERE upper(trim("nome")) = 'M6' AND "descricao" IS NOT NULL;
