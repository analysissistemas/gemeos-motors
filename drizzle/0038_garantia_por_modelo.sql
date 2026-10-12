-- Análise da conversa do Heverton (11/10/2026): perguntou a garantia da DF17 e a IA respondeu "a partir de 3 meses",
-- porque a base só dizia "a partir de 3 meses, com modelos de 1 ano". A garantia agora é um campo da ficha de cada
-- modelo (Estoque → Catálogo; não aparece no site). DF17: 1 ano (dono, 12/10/2026).
UPDATE "modelos" SET "ficha" = coalesce("ficha", '{}'::jsonb) || '{"garantia":"1 ano"}'::jsonb
WHERE upper(trim("nome")) = 'DF17';--> statement-breakpoint
UPDATE "ia_conhecimento"
SET "conteudo" = replace("conteudo", 'A garantia muda conforme o modelo: a partir de 3 meses (o mínimo do Código de Defesa do Consumidor), com modelos de 1 ano de garantia e bateria com até 2 anos.', 'A garantia muda conforme o modelo. A garantia de cada moto está no CATÁLOGO DA LOJA (garantia). Moto sem garantia no catálogo: NÃO diga prazo nenhum (nem "a partir de 3 meses"); diga que a equipe confirma o prazo desse modelo e já te retorna.')
WHERE "titulo" = 'Prazo de garantia';--> statement-breakpoint
-- a simulação de parcelas passou a ser calculada pelo sistema (10/10/2026)
UPDATE "ia_conhecimento"
SET "conteudo" = replace("conteudo", 'Simulação de parcelas e valor final: quem faz é o vendedor.', 'Simulação de parcelas e valor final: o sistema calcula com a tabela da maquininha.')
WHERE "titulo" = 'Formas de pagamento';
