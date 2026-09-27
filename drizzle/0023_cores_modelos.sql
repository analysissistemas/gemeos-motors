-- Cores das motos (pedido do dono, 27/09/2026), pesquisadas nas lojas que vendem a linha Angie:
-- AG08: bege, preta e branca (+ a cinza da foto que a loja já tinha); TANK AG11: + cinza;
-- TCN Basket: branca e preta. Cor com foto própria usa a foto oficial que o site já tinha;
-- as outras ficam sem foto até o fornecedor mandar (Estoque -> Catálogo -> cor -> foto).
-- Não duplica: o índice único (modelo, nome da cor) ignora o que já existe.
INSERT INTO "modelo_cores" ("modelo_id", "nome", "hex", "foto_url", "ordem")
SELECT m."id", c.nome, c.hex, c.foto, c.ordem
FROM "modelos" m
JOIN (VALUES
  ('AG08', 'Cinza', '#7c8085', '/fotos/motos/ag08.webp', 0),
  ('AG08', 'Preta', '#1f2020', NULL, 1),
  ('AG08', 'Branca', '#f4f5f7', NULL, 2),
  ('AG08', 'Bege', '#e8dfcb', NULL, 3),
  ('TANK AG11', 'Cinza', '#7c8085', NULL, 2),
  ('TCN BASKET', 'Branca', '#f4f5f7', '/fotos/motos/tcn-basket.webp', 0),
  ('TCN BASKET', 'Preta', '#1f2020', NULL, 1)
) AS c(modelo, nome, hex, foto, ordem) ON upper(m."nome") = c.modelo
ON CONFLICT DO NOTHING;
