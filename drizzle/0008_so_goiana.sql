-- A loja física é só em Goiana (pedido do dono em 26/09/2026): o que apontava para
-- Carpina passa para Goiana, e a unidade Carpina deixa de existir. O endereço de
-- Goiana é preenchido só se ainda estiver vazio.
UPDATE "veiculos" SET "unidade_id" = (SELECT "id" FROM "unidades" WHERE "nome" = 'Goiana' LIMIT 1)
  WHERE "unidade_id" IN (SELECT "id" FROM "unidades" WHERE "nome" = 'Carpina');--> statement-breakpoint
UPDATE "ordens_servico" SET "unidade_id" = (SELECT "id" FROM "unidades" WHERE "nome" = 'Goiana' LIMIT 1)
  WHERE "unidade_id" IN (SELECT "id" FROM "unidades" WHERE "nome" = 'Carpina');--> statement-breakpoint
DELETE FROM "unidades" WHERE "nome" = 'Carpina';--> statement-breakpoint
UPDATE "unidades" SET "endereco" = 'Rodovia Margem da PE-75, nº 1418', "cidade" = coalesce("cidade", 'Goiana'), "estado" = coalesce("estado", 'PE')
  WHERE "nome" = 'Goiana' AND ("endereco" IS NULL OR "endereco" = '');
