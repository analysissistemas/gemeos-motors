import { POSICOES_CAMERA, type CameraInfo, type PosicaoCamera, type ProvedorCamera } from "./tipos";

const MOTIVO = "Câmera não conectada";

const info = (posicao: PosicaoCamera): CameraInfo => ({
  posicao,
  nome: `Câmera ${posicao}`,
  fonte: null,
  status: "nao_conectada",
  motivo: MOTIVO,
});

/** Único provedor por enquanto: nunca abre conexão, nunca devolve imagem. */
export const provedorNaoConectado: ProvedorCamera = {
  id: "nao_conectado",
  async listar() {
    return POSICOES_CAMERA.map(info);
  },
  async status(posicao) {
    return info(posicao);
  },
  async snapshot() {
    return { ok: false, motivo: MOTIVO };
  },
  async eventos() {
    return { ok: false, motivo: MOTIVO };
  },
};
