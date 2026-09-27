-- Base de conhecimento da Gêmeos Motors (27/09/2026), organizada a partir das respostas do dono
-- ("conhecimento do gemeos.txt"). Cada item entra só se ainda não existir um com o mesmo título,
-- então rodar de novo não duplica e o que a equipe editou na tela não é sobrescrito.
-- O horário de funcionamento NÃO está aqui: é ajustável na tela (Inteligência artificial → Base de conhecimento).
INSERT INTO "ia_conhecimento" ("categoria", "titulo", "conteudo")
SELECT v.categoria, v.titulo, v.conteudo
FROM (VALUES
  ('Produtos', 'Potência e velocidade das motos elétricas', $t$Nossas motos elétricas são autopropelidas: motor de até 1000 W e velocidade máxima de 32 km/h.
É o limite que a legislação brasileira permite para rodar sem CNH, sem emplacamento e sem IPVA.
Vendemos as motos dentro desse limite legal de 32 km/h.$t$),

  ('Produtos', 'Desbloquear a velocidade (acima de 32 km/h)', $t$A loja não recomenda desbloquear.
Os motores são de origem chinesa e tecnicamente passam de 32 km/h, mas acima disso a moto sai da regra da legislação: numa fiscalização o cliente corre o risco de perder a moto.
Moto desbloqueada perde a garantia da loja.
Quem procura velocidade deve escolher uma moto a combustão. A moto elétrica é para quem quer economia.$t$),

  ('Produtos', 'Onde andar com a moto elétrica', $t$As motos elétricas são para andar dentro da cidade.
Não são para rodovia (BR) nem para pista.$t$),

  ('Produtos', 'Gasto de energia e autonomia', $t$Uma carga completa (de 0 a 100%) custa entre R$ 2 e R$ 5 na conta de luz, conforme o carregador: de 2 a 5 amperes. Quanto menor a amperagem do carregador, menor o gasto.
As baterias são de lítio, em geral de 60 V.
Com uma carga a moto anda cerca de 40 km (no modo econômico, mais).
Exemplo: para andar 400 km são umas 10 cargas, cerca de R$ 20 de energia.$t$),

  ('Produtos', 'Chuva e lavagem (resistência à água)', $t$As motos têm proteção a partir de IP64: aguentam chuva e respingos.
A vedação muda de modelo para modelo; o vendedor confirma a do modelo escolhido.
A bateria fica no baú e o motor fica na roda traseira.
Não lavar com jato de água forte: a pressão pode passar pela vedação e danificar a parte elétrica.$t$),

  ('Produtos', 'Blindagem de pneu', $t$O pneu não vem blindado: a blindagem é um serviço à parte.
Na compra da moto, a blindagem sai com 50% de desconto.
Recomendamos blindar pelo menos o pneu traseiro: o motor fica na roda de trás, e um prego obriga a desmontar o motor só para trocar o pneu. Com o desconto, vale blindar os dois.
Também fazemos só a blindagem, sem compra de moto, em menos de uma hora.$t$),

  ('Produtos', 'Por que escolher 1000 W', $t$Moto elétrica abaixo de 1000 W costuma virar necessidade de troca em pouco tempo.
Com 1000 W o cliente leva uma moto com mais folga de motor e precisa trocar menos.$t$),

  ('Produtos', 'Marcas com que a loja trabalha', $t$Trabalhamos com poucas marcas, escolhidas porque não deram problema de funcionamento e têm peça de reposição fácil (muitas peças são as mesmas de motos a combustão).
A ideia é trazer mais modelos das mesmas marcas, e não encher a loja de marcas diferentes.$t$),

  ('Perguntas frequentes', 'Vocês têm a Foston?', $t$Não vendemos a Foston. Temos um modelo que concorre com ela, com investimento um pouco maior e mais vantagens:
- aguenta até 150 kg (a Foston, até 100 kg);
- garantia de 1 ano (a Foston, 3 meses);
- vem montada, pronta para sair pilotando (a Foston vem desmontada na caixa);
- entrega sem taxa, dependendo da região;
- peça de reposição e atendimento presencial na loja.$t$),

  ('Pagamento', 'Formas de pagamento', $t$Moto elétrica: à vista (Pix, dinheiro, transferência ou cartão de débito) ou no cartão de crédito em até 21x.
Com uma entrada, os juros das parcelas no cartão diminuem.
Não fazemos financiamento de moto elétrica: por ser autopropelida, a única forma parcelada é o cartão de crédito.
Moto a combustão e carro: o vendedor informa as condições.
Simulação de parcelas e valor final: quem faz é o vendedor.$t$),

  ('Pagamento', 'Juros e valor anunciado', $t$Todo parcelamento tem juros (cartão, consórcio ou financiamento): a taxa da maquininha sempre existe.
Quem anuncia parcela sem acréscimo coloca essa taxa dentro do preço.
Aqui, pagando à vista, o cliente não paga a taxa da maquininha.$t$),

  ('Pagamento', 'Preço de entrada', $t$Temos motos elétricas a partir de R$ 5.200.
O preço de cada modelo o vendedor confirma.$t$),

  ('Pagamento', 'Veículo ou aparelho na troca', $t$Aceitamos na troca o que tiver valor e der para negociar: moto (elétrica ou a combustão), carro, celular, caixa de som e outros.
Para avaliar, peça fotos do item e a nota fiscal. Um consultor faz a avaliação e apresenta os modelos.$t$),

  ('Pagamento', 'Seguro da moto', $t$Ainda não oferecemos seguro para as motos; a loja está organizando isso.
Se o cliente tiver interesse, anote e diga que a loja avisa quando o seguro estiver disponível.$t$),

  ('Garantia e assistência', 'Prazo de garantia', $t$A garantia muda conforme o modelo: a partir de 3 meses (o mínimo do Código de Defesa do Consumidor), com modelos de 1 ano de garantia e bateria com até 2 anos.
Na compra, a garantia pode ser negociada com o consultor.
Moto com velocidade desbloqueada perde a garantia.$t$),

  ('Garantia e assistência', 'Como usar a garantia', $t$Deu problema: o cliente traz a moto à loja ou a loja busca, conforme foi combinado na compra (quem recebeu em casa também pode trazer).
Primeiro a equipe técnica avalia o problema; depois a loja apresenta a solução.
Exemplo: se a bateria parou, a moto passa por inspeção antes da troca.$t$),

  ('Garantia e assistência', 'Garantia para quem mora longe (ex.: Recife)', $t$A loja agenda um dia para buscar a moto; fazemos entregas em Recife com frequência.
Se a data não servir, o cliente pode trazer a moto à loja.
O mais importante é o cliente não ter prejuízo.$t$),

  ('Garantia e assistência', 'Suporte depois da compra', $t$Quem compra aqui tem suporte: pneu baixou, bateria parou, é só chamar que a loja orienta e ajuda.
Temos peça de reposição e atendimento presencial.$t$),

  ('Loja', 'Entrega', $t$Entregamos em toda a região. Dependendo da região, a entrega não tem taxa; o vendedor confirma para o endereço do cliente.$t$)
) AS v(categoria, titulo, conteudo)
WHERE NOT EXISTS (SELECT 1 FROM "ia_conhecimento" k WHERE lower(k."titulo") = lower(v.titulo));
