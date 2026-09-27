-- Autonomia e ficha pelo fornecedor (27/09/2026, dono: "confirmo a autonomia de acordo com qualquer
-- fornecedora"): AG11 até 64 km (Angie Motors), recarga 6 a 8 h e freio a disco (loja que vende);
-- M6 45 a 55 km (lançamento da Angie); TCN Basket freio a tambor. Freio é campo novo da ficha.
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"autonomia":"Até 64 km","recarga":"6h a 8h","freio":"Disco na frente e atrás"}'::jsonb
WHERE upper("nome") = 'TANK AG11';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"autonomia":"45 a 55 km"}'::jsonb
WHERE upper("nome") = 'M6';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"freio":"Tambor na frente e atrás"}'::jsonb
WHERE upper("nome") = 'TCN BASKET';
