-- 07/10/2026: os lembretes "só cumprimentou e não respondeu" (tarefas para a equipe, 10 min / 1 h / 23 h) foram
-- substituídos pelo follow-up de aquecimento, que a IA envia sozinha. Os antigos ainda pendentes saem da lista.
UPDATE "follow_ups"
SET "status" = 'cancelado', "concluido_em" = now(), "notas" = coalesce("notas", '') || ' (Substituído pelo follow-up de aquecimento automático.)'
WHERE "status" = 'pendente' AND "contexto"->>'semResposta' = 'true';
