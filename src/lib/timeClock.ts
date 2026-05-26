export type TimeClockEntryType =
  | "clock_in"
  | "break_start"
  | "break_end"
  | "break_start_2"
  | "break_end_2"
  | "clock_out";

export const ENTRY_TYPE_LABEL: Record<TimeClockEntryType, string> = {
  clock_in: "Entrada",
  break_start: "Saída intervalo 1",
  break_end: "Retorno intervalo 1",
  break_start_2: "Saída intervalo 2",
  break_end_2: "Retorno intervalo 2",
  clock_out: "Saída",
};

/**
 * Ordem padrão das batidas (sem 2º intervalo).
 * Use `getEntryOrder(hasSecondBreak)` para obter a ordem correta.
 */
export const ENTRY_TYPE_ORDER: TimeClockEntryType[] = [
  "clock_in",
  "break_start",
  "break_end",
  "clock_out",
];

export const ENTRY_TYPE_ORDER_WITH_SECOND_BREAK: TimeClockEntryType[] = [
  "clock_in",
  "break_start",
  "break_end",
  "break_start_2",
  "break_end_2",
  "clock_out",
];

/** Retorna a sequência de batidas conforme houver ou não um 2º intervalo no dia. */
export function getEntryOrder(hasSecondBreak: boolean): TimeClockEntryType[] {
  return hasSecondBreak ? ENTRY_TYPE_ORDER_WITH_SECOND_BREAK : ENTRY_TYPE_ORDER;
}

/** Determina a próxima batida esperada com base nas batidas já registradas hoje */
export function nextExpectedEntry(
  typesToday: TimeClockEntryType[],
  hasSecondBreak: boolean = false,
): TimeClockEntryType | null {
  const order = getEntryOrder(hasSecondBreak);
  for (const t of order) {
    if (!typesToday.includes(t)) return t;
  }
  return null; // dia já completo
}

export function getCurrentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

/** Distância em metros entre duas coordenadas (fórmula de Haversine). */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

