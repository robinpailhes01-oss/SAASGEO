// =====================================================================
// city-resolver — resolution de la "grande ville de reference"
// (city_main) a partir d'une adresse / ville donnee.
//
// Pourquoi : la majorite des prospects cherchent "hotel Montpellier"
// pas "hotel Carnon". Sans cette ville de reference, l'audit teste
// des requetes que personne ne pose. Cf. brief Phase localisation.
//
// Strategie :
//   1. Geocoder l'adresse via api-adresse.data.gouv.fr (free, no key,
//      no rate limit pour notre volume) -> { lat, lon }.
//   2. Trouver la grande ville (>50k hab, liste statique
//      MAJOR_CITIES_FR) la plus proche via Haversine, dans un rayon
//      de 80 km par defaut.
//   3. Si rien dans le rayon ou erreur reseau : null (le pipeline
//      continue sans city_main, queries-gen fallback sur city_exact).
//
// Le module est PUR (pas d'import server-only), testable a coup de mocks
// fetch.
// =====================================================================

import { MAJOR_CITIES_FR, type MajorCity } from "./major-cities";

export type ResolvedCityMain = {
  name: string;
  region: string;
  distance_km: number;
};

const ADRESSE_API_URL = "https://api-adresse.data.gouv.fr/search/";
const DEFAULT_MAX_KM = 80; // generosement, on capture les villages
                           // satellites des grandes metropoles
const FETCH_TIMEOUT_MS = 4000; // 4s : si l'API gov.fr lague, on lache

// Haversine : distance en km entre 2 points GPS.
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // rayon terre en km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Trouve la grande ville la plus proche d'un point GPS, dans le rayon.
// Renvoie null si aucune ville >50k dans le rayon.
export function findNearestMajorCity(
  lat: number,
  lon: number,
  maxKm: number = DEFAULT_MAX_KM,
  cities: MajorCity[] = MAJOR_CITIES_FR
): ResolvedCityMain | null {
  let best: ResolvedCityMain | null = null;
  for (const c of cities) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d > maxKm) continue;
    if (best === null || d < best.distance_km) {
      best = { name: c.name, region: c.region, distance_km: d };
    }
  }
  return best;
}

type GeocodeResult = { lat: number; lon: number; label: string } | null;

// Geocode une adresse / ville via api-adresse.data.gouv.fr.
// Documentation : https://adresse.data.gouv.fr/api-doc/adresse
// Renvoie null si pas de resultat ou erreur reseau.
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    q: trimmed,
    limit: "1",
    autocomplete: "0",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${ADRESSE_API_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string };
      }>;
    };
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length !== 2) return null;
    // GeoJSON : [lon, lat]
    const [lon, lat] = coords;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    return {
      lat,
      lon,
      label: feature.properties?.label ?? trimmed,
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// Resolution complete : adresse libre -> city_main (nom de la grande
// ville la plus proche). Renvoie null si rien d'utilisable.
//
// La 2eme valeur du tuple est la coord geocodee, utile pour les
// callers qui veulent aussi enrichir d'autres champs (region, etc.).
export async function resolveCityMain(
  query: string
): Promise<ResolvedCityMain | null> {
  const geo = await geocodeAddress(query);
  if (!geo) return null;
  return findNearestMajorCity(geo.lat, geo.lon);
}
