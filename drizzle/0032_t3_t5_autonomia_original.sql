-- Corrige a 0031: T3 Retrô e T5 Retrô já tinham a faixa cadastrada pela equipe (60 a 70 km e 55 a 70 km),
-- que é a mais precisa e a que a conta de economia deve usar. A T1 continua "Até 70 km" (era assim).
UPDATE "modelos" SET "ficha" = "ficha" || '{"autonomia":"60 a 70 km"}'::jsonb
WHERE upper(trim("nome")) ~ '^T3( |$)' AND "ficha"->>'autonomia' = 'Até 70 km';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = "ficha" || '{"autonomia":"55 a 70 km"}'::jsonb
WHERE upper(trim("nome")) ~ '^T5( |$)' AND "ficha"->>'autonomia' = 'Até 70 km';
