-- 06/10/2026: a simulação de parcelas no cartão passa a ser feita pelo sistema (tabela da maquininha, lib/ia/simulacao-cartao.ts).
UPDATE "ia_conhecimento"
SET "conteudo" = replace("conteudo", 'Simulação de parcelas e valor final: quem faz é o vendedor.', 'Simulação de parcelas: o sistema calcula na hora, pela bandeira e pelo número de parcelas. American Express acima de 12x, bandeira sem tabela e entrada: o vendedor confirma.')
WHERE "titulo" = 'Formas de pagamento' AND "conteudo" LIKE '%quem faz é o vendedor%';
UPDATE "ia_conhecimento"
SET "conteudo" = replace("conteudo", 'Aqui, pagando à vista, o cliente não paga a taxa da maquininha.', 'Pagando à vista (Pix, dinheiro ou transferência), o cliente não paga a taxa da maquininha. No cartão de crédito parcelado a taxa é do cliente. Pagar TUDO no cartão de débito também tem taxa: não diga o percentual; diga que o dono precisa confirmar se há margem e que o vendedor responde por aqui. Não há entrada mínima; com entrada, a taxa vale só sobre o que sobra para parcelar.')
WHERE "titulo" = 'Juros e valor anunciado' AND "conteudo" LIKE '%pagando à vista, o cliente não paga a taxa%';
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT 'Pagamento', 'Como conduzir o pagamento', $t$Sempre incentive primeiro o pagamento em dinheiro ou Pix: é o melhor valor, sem taxa nenhuma. Só depois, se o cliente quiser parcelar, faça a simulação no cartão (o sistema calcula). Tudo no cartão de débito também tem taxa (juros): não diga o percentual, diga que o dono confirma se há margem. Se o cliente disser que não tem jeito de fechar, não insista nem prometa desconto: diga que o vendedor vai consultar a gerência para ver o que dá para fazer.$t$
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" WHERE "titulo" = 'Como conduzir o pagamento');
