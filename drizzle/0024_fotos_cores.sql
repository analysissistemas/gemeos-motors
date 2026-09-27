-- Fotos oficiais por cor (27/09/2026), no mesmo padrão (fundo branco, 1000x1000, mesma sessão de
-- fotos entre as cores do modelo): TANK AG11 cinza; TCN Basket branca e preta. Só preenche cor sem
-- foto ou com a foto antiga que a migration 0023 pôs (não mexe em foto enviada pela equipe).
UPDATE "modelo_cores" c SET "foto_url" = v.foto
FROM "modelos" m, (VALUES
  ('TANK AG11', 'cinza', '/fotos/motos/tank-ag11-cinza.webp'),
  ('TCN BASKET', 'branca', '/fotos/motos/tcn-basket-branca.webp'),
  ('TCN BASKET', 'preta', '/fotos/motos/tcn-basket-preta.webp')
) AS v(modelo, cor, foto)
WHERE c."modelo_id" = m."id" AND upper(m."nome") = v.modelo AND lower(c."nome") = v.cor
  AND (c."foto_url" IS NULL OR c."foto_url" = '/fotos/motos/tcn-basket.webp');
