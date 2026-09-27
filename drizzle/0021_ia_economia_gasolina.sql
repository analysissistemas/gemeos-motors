-- Conta de economia moto elétrica × gasolina (pedido do dono, 27/09/2026). O sistema calcula a
-- economia de cada moto pela autonomia com estes números; a equipe edita o texto na tela
-- (Inteligência artificial → Base de conhecimento). Não sobrescreve se já existir.
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT 'Produtos', 'Comparação com gasolina (conta de economia)', $t$Números usados pela IA para calcular quanto o cliente economiza com a moto elétrica.
Preço da gasolina: R$ 6,77 o litro (média de Recife na ANP, semana até 19/09/2026). Atualize quando a gasolina mudar.
Moto a gasolina de referência (160 cilindradas): 40 km por litro.
O custo da carga vem do item "Gasto de energia e autonomia".$t$
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" WHERE "titulo" = 'Comparação com gasolina (conta de economia)');
