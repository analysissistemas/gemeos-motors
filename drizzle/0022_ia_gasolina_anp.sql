-- O preço da gasolina agora vem sozinho da ANP (toda semana, pela cidade do cliente ou a média do
-- estado da loja). O texto da base passa a dizer isso; o valor escrito vira só a reserva (ANP fora do ar).
-- Só troca se a equipe ainda não editou o item.
UPDATE "ia_conhecimento"
SET "conteudo" = $t$Números usados pela IA para calcular quanto o cliente economiza com a moto elétrica.
O preço da gasolina é atualizado sozinho toda semana pela pesquisa da ANP: o da cidade do cliente, quando a ANP pesquisa lá, ou a média do estado (Goiana entra na média de Pernambuco).
Preço da gasolina de reserva (só se a ANP estiver fora do ar): R$ 6,94 o litro.
Moto a gasolina de referência (160 cilindradas): 40 km por litro.
O custo da carga vem do item "Gasto de energia e autonomia".$t$,
    "atualizado_em" = now()
WHERE "titulo" = 'Comparação com gasolina (conta de economia)' AND "conteudo" LIKE '%R$ 6,77 o litro (média de Recife na ANP, semana até 19/09/2026)%';
