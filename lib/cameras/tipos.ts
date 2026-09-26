/**
 * Câmeras — tipos e contrato (Frente I: só arquitetura).
 * Nenhuma câmera real está conectada. Não há URL, IP ou RTSP embutido aqui:
 * endereços virão de cadastro (banco) e credenciais de variáveis de ambiente.
 */

export const POSICOES_CAMERA = [1, 2, 3] as const;
export type PosicaoCamera = (typeof POSICOES_CAMERA)[number];

export const TIPOS_FONTE = {
  rtsp: "RTSP",
  ip_camera: "Câmera IP",
  nvr: "NVR / DVR",
} as const;
export type TipoFonte = keyof typeof TIPOS_FONTE;

export type IdProvedorCamera = "nao_conectado";

export type StatusCamera = "nao_conectada" | "conectando" | "online" | "offline" | "erro";

export const TIPOS_EVENTO_CAMERA = ["movimento", "pessoa", "conexao_perdida", "conexao_restabelecida", "snapshot", "outro"] as const;
export type TipoEventoCamera = (typeof TIPOS_EVENTO_CAMERA)[number];

export type CameraInfo = {
  posicao: PosicaoCamera;
  nome: string;
  fonte: TipoFonte | null;
  status: StatusCamera;
  motivo?: string;
};

export type SnapshotCamera = {
  posicao: PosicaoCamera;
  /** Conteúdo da imagem; nunca uma imagem inventada. */
  bytes: Uint8Array;
  tipoMime: string;
  capturadoEm: Date;
};

export type EventoCamera = {
  posicao: PosicaoCamera;
  tipo: TipoEventoCamera;
  ocorridoEm: Date;
  descricao?: string;
};

export type ResultadoCamera<T> = { ok: true; dados: T } | { ok: false; motivo: string };

/** Contrato que todo provedor de câmera precisa cumprir. */
export interface ProvedorCamera {
  readonly id: IdProvedorCamera;
  listar(): Promise<CameraInfo[]>;
  status(posicao: PosicaoCamera): Promise<CameraInfo>;
  snapshot(posicao: PosicaoCamera): Promise<ResultadoCamera<SnapshotCamera>>;
  eventos(posicao: PosicaoCamera, desde?: Date): Promise<ResultadoCamera<EventoCamera[]>>;
}
