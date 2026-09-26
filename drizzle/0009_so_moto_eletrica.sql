-- "Triciclo elétrico" deixou de ser tipo separado (pedido do dono em 26/09/2026):
-- o MM3 e qualquer veículo desse tipo passam a ser moto elétrica.
UPDATE "modelos" SET "tipo" = 'moto_eletrica' WHERE "tipo" = 'triciclo_eletrico';--> statement-breakpoint
UPDATE "veiculos" SET "tipo" = 'moto_eletrica' WHERE "tipo" = 'triciclo_eletrico';
