export const receptionStates = [
  "STANDBY", "DETECTION", "SCANNING", "IDENTITY_REVEAL", "NICKNAME_REQUEST",
  "WAITING_NICKNAME", "NICKNAME_CONFIRMED", "PHOTO_REQUEST", "PHOTO_COUNTDOWN",
  "WAITING_PHOTO", "AVATAR_PROCESSING", "GAMER_CALIBRATION", "PLAYER_UNLOCKED", "COMPLETED",
] as const;

export type ReceptionState = (typeof receptionStates)[number];

export const receptionStateLabels: Record<ReceptionState, string> = {
  STANDBY: "Esperando jugadores",
  DETECTION: "Jugador detectado",
  SCANNING: "Escaneando identidad",
  IDENTITY_REVEAL: "Identidad confirmada",
  NICKNAME_REQUEST: "Solicitando nickname",
  WAITING_NICKNAME: "Esperando nickname",
  NICKNAME_CONFIRMED: "Nickname registrado",
  PHOTO_REQUEST: "Solicitando avatar",
  PHOTO_COUNTDOWN: "Preparando fotografía",
  WAITING_PHOTO: "Esperando fotografía",
  AVATAR_PROCESSING: "Procesando avatar",
  GAMER_CALIBRATION: "Calibración gamer",
  PLAYER_UNLOCKED: "Jugador desbloqueado",
  COMPLETED: "Activación completada",
};

export const receptionMediaScenes = [
  { key: "DETECTION", label: "Detección" },
  { key: "SCANNING", label: "Escaneo" },
  { key: "IDENTITY_REVEAL", label: "Revelación de identidad" },
  { key: "NICKNAME_REQUEST", label: "Solicitud de nickname" },
  { key: "WAITING_NICKNAME", label: "Espera de nickname" },
  { key: "NICKNAME_CONFIRMED", label: "Nickname confirmado" },
  { key: "PHOTO_REQUEST", label: "Solicitud de fotografía" },
  { key: "PHOTO_COUNTDOWN", label: "Cuenta regresiva" },
  { key: "WAITING_PHOTO", label: "Espera de fotografía" },
  { key: "AVATAR_PROCESSING", label: "Procesamiento de avatar" },
  { key: "GAMER_CALIBRATION", label: "Calibración gamer" },
  { key: "PLAYER_UNLOCKED", label: "Jugador desbloqueado" },
  { key: "BIRTHDAY_HERO", label: "Cumpleañero · escena especial" },
  { key: "NEXUS_SYSTEM_BREACH", label: "Transición hacia GLITCH" },
] as const;

export const nicknameStates = new Set<ReceptionState>(["NICKNAME_REQUEST", "WAITING_NICKNAME"]);
export const photoStates = new Set<ReceptionState>(["PHOTO_REQUEST", "PHOTO_COUNTDOWN", "WAITING_PHOTO"]);

