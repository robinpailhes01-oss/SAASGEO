// =====================================================================
// Liste statique des grandes villes francaises (>50k habitants).
//
// Sert au resolveur city-resolver pour determiner la "ville de
// reference" (city_main) la plus proche d'une adresse donnee.
//
// Pourquoi statique ? Le besoin est figé (~80 entrees, ne change pas
// d'un semestre a l'autre), zero dependance reseau au moment de la
// resolution, deterministe et instantane. Si le besoin grandit, on
// pourra basculer vers geo.api.gouv.fr/communes?lat=X&lon=Y mais
// pour le MVP c'est sur-engineering.
//
// Donnees : population legale INSEE 2024, coordonnees GPS du chef-lieu.
// Source : INSEE / Wikipedia.
// =====================================================================

export type MajorCity = {
  name: string;
  region: string;
  // Coordonnees GPS du centre/chef-lieu (utilises pour Haversine).
  lat: number;
  lon: number;
};

// ~80 villes francaises >50k hab, triees par population desc puis nom.
// Format compact pour faciliter l'edition.
export const MAJOR_CITIES_FR: MajorCity[] = [
  { name: "Paris", region: "Île-de-France", lat: 48.8566, lon: 2.3522 },
  { name: "Marseille", region: "Provence-Alpes-Côte d'Azur", lat: 43.2965, lon: 5.3698 },
  { name: "Lyon", region: "Auvergne-Rhône-Alpes", lat: 45.7640, lon: 4.8357 },
  { name: "Toulouse", region: "Occitanie", lat: 43.6047, lon: 1.4442 },
  { name: "Nice", region: "Provence-Alpes-Côte d'Azur", lat: 43.7102, lon: 7.2620 },
  { name: "Nantes", region: "Pays de la Loire", lat: 47.2184, lon: -1.5536 },
  { name: "Montpellier", region: "Occitanie", lat: 43.6108, lon: 3.8767 },
  { name: "Strasbourg", region: "Grand Est", lat: 48.5734, lon: 7.7521 },
  { name: "Bordeaux", region: "Nouvelle-Aquitaine", lat: 44.8378, lon: -0.5792 },
  { name: "Lille", region: "Hauts-de-France", lat: 50.6292, lon: 3.0573 },
  { name: "Rennes", region: "Bretagne", lat: 48.1173, lon: -1.6778 },
  { name: "Reims", region: "Grand Est", lat: 49.2583, lon: 4.0317 },
  { name: "Saint-Étienne", region: "Auvergne-Rhône-Alpes", lat: 45.4397, lon: 4.3872 },
  { name: "Toulon", region: "Provence-Alpes-Côte d'Azur", lat: 43.1242, lon: 5.9280 },
  { name: "Le Havre", region: "Normandie", lat: 49.4944, lon: 0.1079 },
  { name: "Grenoble", region: "Auvergne-Rhône-Alpes", lat: 45.1885, lon: 5.7245 },
  { name: "Dijon", region: "Bourgogne-Franche-Comté", lat: 47.3220, lon: 5.0415 },
  { name: "Angers", region: "Pays de la Loire", lat: 47.4784, lon: -0.5632 },
  { name: "Nîmes", region: "Occitanie", lat: 43.8367, lon: 4.3601 },
  { name: "Villeurbanne", region: "Auvergne-Rhône-Alpes", lat: 45.7665, lon: 4.8795 },
  { name: "Saint-Denis", region: "La Réunion", lat: -20.8823, lon: 55.4504 },
  { name: "Aix-en-Provence", region: "Provence-Alpes-Côte d'Azur", lat: 43.5297, lon: 5.4474 },
  { name: "Le Mans", region: "Pays de la Loire", lat: 48.0061, lon: 0.1996 },
  { name: "Clermont-Ferrand", region: "Auvergne-Rhône-Alpes", lat: 45.7772, lon: 3.0870 },
  { name: "Brest", region: "Bretagne", lat: 48.3905, lon: -4.4861 },
  { name: "Tours", region: "Centre-Val de Loire", lat: 47.3941, lon: 0.6848 },
  { name: "Amiens", region: "Hauts-de-France", lat: 49.8941, lon: 2.2958 },
  { name: "Limoges", region: "Nouvelle-Aquitaine", lat: 45.8336, lon: 1.2611 },
  { name: "Annecy", region: "Auvergne-Rhône-Alpes", lat: 45.8992, lon: 6.1294 },
  { name: "Boulogne-Billancourt", region: "Île-de-France", lat: 48.8350, lon: 2.2410 },
  { name: "Perpignan", region: "Occitanie", lat: 42.6886, lon: 2.8949 },
  { name: "Metz", region: "Grand Est", lat: 49.1193, lon: 6.1757 },
  { name: "Besançon", region: "Bourgogne-Franche-Comté", lat: 47.2378, lon: 6.0241 },
  { name: "Orléans", region: "Centre-Val de Loire", lat: 47.9029, lon: 1.9093 },
  { name: "Mulhouse", region: "Grand Est", lat: 47.7508, lon: 7.3359 },
  { name: "Rouen", region: "Normandie", lat: 49.4431, lon: 1.0993 },
  { name: "Caen", region: "Normandie", lat: 49.1829, lon: -0.3707 },
  { name: "Argenteuil", region: "Île-de-France", lat: 48.9472, lon: 2.2467 },
  { name: "Nancy", region: "Grand Est", lat: 48.6921, lon: 6.1844 },
  { name: "Montreuil", region: "Île-de-France", lat: 48.8615, lon: 2.4467 },
  { name: "Roubaix", region: "Hauts-de-France", lat: 50.6927, lon: 3.1738 },
  { name: "Tourcoing", region: "Hauts-de-France", lat: 50.7236, lon: 3.1612 },
  { name: "Avignon", region: "Provence-Alpes-Côte d'Azur", lat: 43.9493, lon: 4.8055 },
  { name: "Vitry-sur-Seine", region: "Île-de-France", lat: 48.7873, lon: 2.4030 },
  { name: "Créteil", region: "Île-de-France", lat: 48.7904, lon: 2.4554 },
  { name: "Versailles", region: "Île-de-France", lat: 48.8049, lon: 2.1204 },
  { name: "Asnières-sur-Seine", region: "Île-de-France", lat: 48.9159, lon: 2.2848 },
  { name: "Colombes", region: "Île-de-France", lat: 48.9226, lon: 2.2528 },
  { name: "Aubervilliers", region: "Île-de-France", lat: 48.9145, lon: 2.3826 },
  { name: "Poitiers", region: "Nouvelle-Aquitaine", lat: 46.5802, lon: 0.3404 },
  { name: "Aulnay-sous-Bois", region: "Île-de-France", lat: 48.9384, lon: 2.4944 },
  { name: "Antibes", region: "Provence-Alpes-Côte d'Azur", lat: 43.5808, lon: 7.1239 },
  { name: "Saint-Maur-des-Fossés", region: "Île-de-France", lat: 48.7997, lon: 2.4928 },
  { name: "Calais", region: "Hauts-de-France", lat: 50.9513, lon: 1.8587 },
  { name: "La Rochelle", region: "Nouvelle-Aquitaine", lat: 46.1591, lon: -1.1518 },
  { name: "Champigny-sur-Marne", region: "Île-de-France", lat: 48.8166, lon: 2.5123 },
  { name: "Rueil-Malmaison", region: "Île-de-France", lat: 48.8767, lon: 2.1804 },
  { name: "Béziers", region: "Occitanie", lat: 43.3442, lon: 3.2152 },
  { name: "Cannes", region: "Provence-Alpes-Côte d'Azur", lat: 43.5528, lon: 7.0174 },
  { name: "Saint-Nazaire", region: "Pays de la Loire", lat: 47.2806, lon: -2.2089 },
  { name: "Drancy", region: "Île-de-France", lat: 48.9264, lon: 2.4453 },
  { name: "Mérignac", region: "Nouvelle-Aquitaine", lat: 44.8403, lon: -0.6438 },
  { name: "Issy-les-Moulineaux", region: "Île-de-France", lat: 48.8246, lon: 2.2730 },
  { name: "Noisy-le-Grand", region: "Île-de-France", lat: 48.8467, lon: 2.5527 },
  { name: "Évry-Courcouronnes", region: "Île-de-France", lat: 48.6293, lon: 2.4413 },
  { name: "Levallois-Perret", region: "Île-de-France", lat: 48.8929, lon: 2.2870 },
  { name: "Cergy", region: "Île-de-France", lat: 49.0356, lon: 2.0769 },
  { name: "Vénissieux", region: "Auvergne-Rhône-Alpes", lat: 45.6975, lon: 4.8869 },
  { name: "Pessac", region: "Nouvelle-Aquitaine", lat: 44.8060, lon: -0.6311 },
  { name: "Troyes", region: "Grand Est", lat: 48.2973, lon: 4.0744 },
  { name: "Clichy", region: "Île-de-France", lat: 48.9020, lon: 2.3055 },
  { name: "Ivry-sur-Seine", region: "Île-de-France", lat: 48.8138, lon: 2.3878 },
  { name: "Antony", region: "Île-de-France", lat: 48.7541, lon: 2.2972 },
  { name: "Lorient", region: "Bretagne", lat: 47.7484, lon: -3.3702 },
  { name: "Pau", region: "Nouvelle-Aquitaine", lat: 43.2951, lon: -0.3708 },
  { name: "Quimper", region: "Bretagne", lat: 47.9962, lon: -4.1024 },
  { name: "Niort", region: "Nouvelle-Aquitaine", lat: 46.3239, lon: -0.4625 },
  { name: "Villeneuve-d'Ascq", region: "Hauts-de-France", lat: 50.6171, lon: 3.1683 },
  { name: "Valence", region: "Auvergne-Rhône-Alpes", lat: 44.9334, lon: 4.8924 },
  { name: "Sarcelles", region: "Île-de-France", lat: 48.9956, lon: 2.3789 },
  { name: "La Seyne-sur-Mer", region: "Provence-Alpes-Côte d'Azur", lat: 43.1024, lon: 5.8800 },
  { name: "Cholet", region: "Pays de la Loire", lat: 47.0606, lon: -0.8788 },
  { name: "Bayonne", region: "Nouvelle-Aquitaine", lat: 43.4929, lon: -1.4748 },
  { name: "Bourges", region: "Centre-Val de Loire", lat: 47.0810, lon: 2.3988 },
  { name: "Chambéry", region: "Auvergne-Rhône-Alpes", lat: 45.5646, lon: 5.9178 },
  { name: "Saint-Quentin", region: "Hauts-de-France", lat: 49.8473, lon: 3.2873 },
  { name: "Ajaccio", region: "Corse", lat: 41.9192, lon: 8.7386 },
  { name: "Beauvais", region: "Hauts-de-France", lat: 49.4295, lon: 2.0807 },
  { name: "Saint-Denis (93)", region: "Île-de-France", lat: 48.9362, lon: 2.3574 },
  { name: "Hyères", region: "Provence-Alpes-Côte d'Azur", lat: 43.1205, lon: 6.1287 },
  { name: "La Roche-sur-Yon", region: "Pays de la Loire", lat: 46.6705, lon: -1.4260 },
  { name: "Vannes", region: "Bretagne", lat: 47.6582, lon: -2.7608 },
  { name: "Évreux", region: "Normandie", lat: 49.0241, lon: 1.1505 },
];
