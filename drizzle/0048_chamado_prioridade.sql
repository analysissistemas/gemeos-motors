-- Fila única de melhorias (dono, 23/10/2026): o dono marca os piores do dia e eles sobem para o topo.
ALTER TABLE "chamados_melhoria" ADD COLUMN "prioridade" boolean DEFAULT false NOT NULL;