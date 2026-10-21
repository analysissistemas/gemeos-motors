-- Milton (21/10/2026), garantia dos modelos novos do catálogo: "A mais barata 3 meses, a de trilha 6 meses, triciclo 1 ano"
-- (a mais barata = Bicicleta Elétrica Dobrável Urbana 400W, R$ 4.000; a de trilha = MT4 Off-Road; o triciclo = Foxscoo).
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"3 meses"}'::jsonb
WHERE "nome" ILIKE '%dobr%vel%400W%';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"6 meses"}'::jsonb
WHERE "nome" ILIKE '%MT4%';--> statement-breakpoint
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"1 ano"}'::jsonb
WHERE "nome" ILIKE '%foxscoo%';
