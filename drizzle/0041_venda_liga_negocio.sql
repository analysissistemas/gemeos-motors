-- Venda feita direto em Vendas não fechava o negócio do funil (dono, 14/10/2026: V-00005, T1 do Leandro, finalizada em
-- 13/10 e o negócio parado em "Visita / test drive"). Daqui pra frente o código liga a venda ao negócio aberto do
-- cliente; aqui, uma vez, as vendas já finalizadas sem negócio: liga ao negócio aberto mais recente do mesmo cliente
-- (sem outra venda ativa) e move esse negócio para "Venda fechada", com o registro no histórico do negócio.
WITH por_venda AS (
  SELECT DISTINCT ON (vd.id) vd.id AS venda_id, ng.id AS negocio_id, vd.veiculo_id, vd.finalizada_em, vd.valor_vendido
  FROM "vendas" vd
  JOIN "negocios" ng ON ng.cliente_id = vd.cliente_id
  WHERE vd.status = 'finalizada' AND vd.negocio_id IS NULL
    AND ng.etapa IN ('whatsapp', 'interessado', 'visita', 'equipe', 'proposta', 'negociando')
    AND NOT EXISTS (SELECT 1 FROM "vendas" v2 WHERE v2.negocio_id = ng.id AND v2.status <> 'cancelada')
  ORDER BY vd.id, ng.criado_em DESC
),
-- um negócio só recebe uma venda (índice vendas_negocio_unico): duas vendas do mesmo cliente, fica a mais antiga
alvo AS (
  SELECT DISTINCT ON (negocio_id) * FROM por_venda ORDER BY negocio_id, venda_id
),
ligou AS (
  UPDATE "vendas" vd SET negocio_id = alvo.negocio_id FROM alvo WHERE vd.id = alvo.venda_id RETURNING alvo.*
),
fechou AS (
  UPDATE "negocios" ng
  SET etapa = 'fechada', etapa_desde = coalesce(ligou.finalizada_em, now()), fechado_em = coalesce(ligou.finalizada_em, now()), veiculo_id = coalesce(ligou.veiculo_id, ng.veiculo_id), atualizado_em = now()
  FROM ligou WHERE ng.id = ligou.negocio_id
  RETURNING ng.id, ligou.valor_vendido
)
INSERT INTO "negocio_eventos" (negocio_id, tipo, descricao)
SELECT id, 'venda', 'Venda finalizada em Vendas ligada a este negócio (ajuste de 14/10/2026)' FROM fechou;
