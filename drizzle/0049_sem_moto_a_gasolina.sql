-- A loja não trabalha mais com moto a gasolina (usuário, 27/10/2026: "não ofereça nunca"; a Kawasaki Z400 aparecia no
-- site e a IA a oferecia). Os modelos saem do catálogo ativo (site e IA); as unidades no Estoque ficam como estão.
UPDATE "modelos" SET "ativo" = false WHERE "tipo" = 'moto_combustao' AND "ativo" = true;
