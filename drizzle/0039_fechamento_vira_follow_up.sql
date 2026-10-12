-- Milton (12/10/2026): "O que está faltando para concluirmos a sua compra?" saiu da resposta do orçamento e virou o
-- 1º follow-up (1 h sem resposta). O exemplo publicado em Respostas-modelo ainda ensinava a IA a perguntar na hora.
UPDATE "ia_prompt_versoes"
SET "conteudo" = replace("conteudo", E'por *R$ <preço>* ✅\n  O que está faltando para concluirmos a sua compra?"', E'por *R$ <preço>* ✅"\n  (a foto vai junto; "O que está faltando para concluirmos a sua compra?" o sistema manda depois, se ele não responder)')
WHERE "secao" = 'modelos' AND "status" = 'publicada';
