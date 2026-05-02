// =====================================================================
// Tests city-resolver — pure logique (Haversine + nearest match).
//
// On ne mocke PAS l'API api-adresse.data.gouv.fr ici (ce serait du
// noise) — la fonction `geocodeAddress` est testee separement par
// integration manuelle si besoin. On focus sur :
//   - haversineKm : distances connues entre villes francaises
//   - findNearestMajorCity : pour des coords donnees, on tombe bien
//     sur la ville attendue
// =====================================================================

import { describe, expect, it } from "vitest";

import {
  haversineKm,
  findNearestMajorCity,
} from "../city-resolver";

describe("haversineKm", () => {
  it("distance Paris -> Lyon ~ 392 km", () => {
    const d = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(420);
  });

  it("distance Carnon -> Montpellier ~ 12 km", () => {
    // Carnon (43.5469, 3.9787) -> Montpellier (43.6108, 3.8767)
    const d = haversineKm(43.5469, 3.9787, 43.6108, 3.8767);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(20);
  });

  it("distance d'un point a lui-meme = 0", () => {
    expect(haversineKm(48.85, 2.35, 48.85, 2.35)).toBe(0);
  });
});

describe("findNearestMajorCity", () => {
  it("Carnon (43.5469, 3.9787) -> Montpellier", () => {
    // Carnon est a ~12km au sud de Montpellier
    const result = findNearestMajorCity(43.5469, 3.9787);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Montpellier");
    expect(result!.distance_km).toBeLessThan(20);
  });

  it("Centre de Paris -> Paris elle-meme (distance ~ 0)", () => {
    const result = findNearestMajorCity(48.8566, 2.3522);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Paris");
    expect(result!.distance_km).toBeLessThan(2);
  });

  it("Cote d'Azur (43.5, 7.0) -> Cannes ou Antibes", () => {
    const result = findNearestMajorCity(43.5, 7.0);
    expect(result).not.toBeNull();
    expect(["Cannes", "Antibes", "Nice"]).toContain(result!.name);
  });

  it("Bretagne sud (47.6, -3.4) -> Lorient", () => {
    const result = findNearestMajorCity(47.6, -3.4);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Lorient");
  });

  it("renvoie null si rayon trop petit", () => {
    // Un point en plein milieu du desert (Atlantique entre France et UK)
    const result = findNearestMajorCity(50.0, -5.0, 30);
    expect(result).toBeNull();
  });

  it("renvoie null pour coordonnees a l'etranger eloignees", () => {
    // Tokyo
    const result = findNearestMajorCity(35.6762, 139.6503);
    expect(result).toBeNull();
  });

  it("respecte le rayon maxKm passe en parametre", () => {
    // Carnon est a ~12km de Montpellier
    expect(findNearestMajorCity(43.5469, 3.9787, 5)).toBeNull();
    expect(findNearestMajorCity(43.5469, 3.9787, 15)).not.toBeNull();
  });
});
