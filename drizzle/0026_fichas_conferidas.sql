-- Fichas conferidas com as fontes públicas (27/09/2026, pedido do dono: "adicione mais informações
-- sobre o produto e confira se está correto"). Só entra o que tem fonte; o resto fica como a loja cadastrou.
-- TCN Basket (lojas Ibyte/Risen): 32 km/h, pneu 14" x 2,5 sem câmara, recarga 8 a 10 h.
UPDATE "modelos" SET "ficha" = "ficha" || '{"velocidade":"32 km/h","pneu":"14\" x 2,5 sem câmara","recarga":"8h a 10h"}'::jsonb
WHERE upper("nome") = 'TCN BASKET' AND NOT ("ficha" ? 'velocidade') AND NOT ("ficha" ? 'pneu') AND NOT ("ficha" ? 'recarga');--> statement-breakpoint
-- Detalhes (a IA usa; só onde a equipe ainda não escreveu descrição)
UPDATE "modelos" SET "descricao" = 'Aro 12, freio a disco na frente e atrás, marcha à ré, alarme, Bluetooth com rádio e caixas de som, partida por chave, aproximação (NFC) ou controle, bateria de lítio removível e luzes em LED. Aguenta até 180 kg.'
WHERE upper("nome") = 'TANK AG11' AND ("descricao" IS NULL OR "descricao" = '');--> statement-breakpoint
UPDATE "modelos" SET "descricao" = 'Bicicleta elétrica com cestinha, quadro de aço, freio a tambor na frente e atrás, pneu sem câmara e 3 níveis de força. Pesa 52 kg e aguenta até 150 kg.'
WHERE upper("nome") = 'TCN BASKET' AND ("descricao" IS NULL OR "descricao" = '');--> statement-breakpoint
UPDATE "modelos" SET "descricao" = 'Scooter econômica para o dia a dia, com bateria de lítio. Aguenta até 200 kg.'
WHERE upper("nome") = 'AG08' AND ("descricao" IS NULL OR "descricao" = '');--> statement-breakpoint
-- AG08 também sai na cor verde militar (catálogo do distribuidor Angie Motors)
INSERT INTO "modelo_cores" ("modelo_id", "nome", "hex", "ordem")
SELECT m."id", 'Verde militar', '#4b5320', 4 FROM "modelos" m WHERE upper(m."nome") = 'AG08'
ON CONFLICT DO NOTHING;
