import { z } from "zod";

/** Posição da foto na moldura do card (components/ui/enquadrar-foto.tsx). */
export const esquemaEnquadre = z.object({ zoom: z.number().positive().max(10), x: z.number().min(-5000).max(5000), y: z.number().min(-5000).max(5000) });
