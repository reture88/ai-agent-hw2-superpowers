import cityCoordinates from "../../data/city-coordinates.json";

export interface Coordinates {
  lat: number;
  lon: number;
}

const DIACRITIC_MARKS = /[̀-ͯ]/g;

export function normalizeCityName(city: string): string {
  return city
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const normalizedCoordinates: Record<string, Coordinates> = cityCoordinates;

export function lookupCoordinates(city: string): Coordinates | null {
  const key = normalizeCityName(city);
  return normalizedCoordinates[key] ?? null;
}
