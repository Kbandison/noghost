import { describe, expect, it } from "vitest";
import {
  ALLOWED_RADII_KM,
  defaultRadiusFor,
  distanceKm,
  distanceLabel,
  formatRadius,
  isUsablePoint,
  nearestRadius,
  placeLabel,
  proximityScore,
  radiiFor,
  roundForStorage,
  unitForCountry,
  unitForLocale,
  withinReach,
} from "./geo";

// Real places, so a wrong formula is obvious rather than self-consistent.
const MIDTOWN = { lat: 33.7815, lng: -84.3835 };      // Atlanta
const DECATUR = { lat: 33.7748, lng: -84.2963 };      // ~8km east
const MARIETTA = { lat: 33.9526, lng: -84.5499 };     // ~28km northwest
const NASHVILLE = { lat: 36.1627, lng: -86.7816 };    // ~340km
const LISBON = { lat: 38.7223, lng: -9.1393 };

describe("distance", () => {
  it("matches known separations", () => {
    expect(distanceKm(MIDTOWN, DECATUR)).toBeGreaterThan(7);
    expect(distanceKm(MIDTOWN, DECATUR)).toBeLessThan(9);
    expect(distanceKm(MIDTOWN, MARIETTA)).toBeGreaterThan(24);
    expect(distanceKm(MIDTOWN, MARIETTA)).toBeLessThan(32);
    expect(Math.round(distanceKm(MIDTOWN, NASHVILLE))).toBeGreaterThan(300);
  });

  it("is zero for the same point and symmetric", () => {
    expect(distanceKm(MIDTOWN, MIDTOWN)).toBe(0);
    expect(distanceKm(MIDTOWN, LISBON)).toBeCloseTo(distanceKm(LISBON, MIDTOWN), 6);
  });

  it("does not fall apart across the date line", () => {
    // A flat approximation reports half the planet here. Two points 2° apart
    // either side of the antimeridian are a couple of hundred kilometres.
    const east = { lat: 0, lng: 179 };
    const west = { lat: 0, lng: -179 };
    expect(distanceKm(east, west)).toBeLessThan(250);
  });
});

describe("both people have to be willing", () => {
  it("uses the smaller radius, so neither is overruled", () => {
    // Decatur is ~8km from Midtown. One will travel 25km, the other only 5.
    expect(withinReach(MIDTOWN, 25, DECATUR, 5)).toBe(false);
    expect(withinReach(MIDTOWN, 25, DECATUR, 10)).toBe(true);
    // And it does not matter which way round they are asked.
    expect(withinReach(DECATUR, 5, MIDTOWN, 25)).toBe(false);
  });
});

describe("proximity as score", () => {
  it("grades rather than switching, which is what the cluster rule got wrong", () => {
    // The old +3 was all-or-nothing on a boundary: half a mile apart across a
    // line scored zero, nine miles apart inside one scored full marks.
    expect(proximityScore(MIDTOWN, MIDTOWN)).toBe(3);
    expect(proximityScore(MIDTOWN, DECATUR)).toBe(2);
    expect(proximityScore(MIDTOWN, MARIETTA)).toBe(1);
    expect(proximityScore(MIDTOWN, NASHVILLE)).toBe(0);
  });

  it("scores nothing rather than guessing when a point is missing", () => {
    expect(proximityScore(null, MIDTOWN)).toBe(0);
    expect(proximityScore(MIDTOWN, null)).toBe(0);
  });
});

describe("what a member is shown", () => {
  it("is a bucket, never a number somebody could triangulate on", () => {
    expect(distanceLabel(MIDTOWN, MIDTOWN)).toBe("Just around the corner");
    expect(distanceLabel(MIDTOWN, DECATUR)).toBe("Across town");
    expect(distanceLabel(MIDTOWN, NASHVILLE)).toBe("Worth the trip");
    // No digits at all — a label that leaks a radius is a circle to stand on.
    for (const label of [distanceLabel(MIDTOWN, DECATUR), distanceLabel(MIDTOWN, MARIETTA)]) {
      expect(label).not.toMatch(/\d/);
    }
  });
});

describe("what gets stored", () => {
  it("is rounded before it ever reaches the database", () => {
    const precise = { lat: 33.78151234, lng: -84.38359876 };
    expect(roundForStorage(precise)).toEqual({ lat: 33.782, lng: -84.384 });
  });

  it("keeps enough precision for every decision the product makes", () => {
    // Rounding must not move somebody into a different proximity bucket.
    const a = roundForStorage({ lat: 33.78151234, lng: -84.38359876 });
    const b = roundForStorage({ lat: 33.77481111, lng: -84.29632222 });
    expect(proximityScore(a, b)).toBe(proximityScore(MIDTOWN, DECATUR));
  });

  it("refuses what a failed geocode looks like", () => {
    expect(isUsablePoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isUsablePoint(null)).toBe(false);
    expect(isUsablePoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isUsablePoint({ lat: NaN, lng: 1 })).toBe(false);
    expect(isUsablePoint(MIDTOWN)).toBe(true);
    expect(isUsablePoint(LISBON)).toBe(true);
  });
});

describe("placeLabel — a place, never an address", () => {
  it("composes a city and state rather than trusting the title", () => {
    // The exact response `30308` came back with from the live API. The title
    // names a building; the label must not.
    const label = placeLabel(
      {
        title: "30308, U-Rescue Villa, Atlanta, GA, United States",
        locality: "Atlanta",
        regionCode: "GA",
        regionName: "Georgia",
        country: "United States",
      },
      "30308",
    );
    expect(label).toBe("Atlanta, GA");
    expect(label).not.toContain("U-Rescue Villa");
    expect(label).not.toContain("30308");
  });

  it("never leaks a building name, whatever the title says", () => {
    const titles = [
      "30308, U-Rescue Villa, Atlanta, GA, United States",
      "221B Baker Street, Marylebone, London, England, United Kingdom",
      "Apartment 4, 12 Rua Garrett, Lisboa, Portugal",
    ];
    for (const title of titles) {
      const label = placeLabel({ title, locality: "Somewhere", regionCode: "XX" }, "typed");
      expect(label).toBe("Somewhere, XX");
    }
  });

  it("prefers a short region code to a long region name", () => {
    expect(placeLabel({ locality: "Atlanta", regionCode: "GA", regionName: "Georgia" }, "x"))
      .toBe("Atlanta, GA");
    // Some regions report their full name in the code field; a code is only a
    // code when it is short.
    expect(
      placeLabel(
        { locality: "Lisbon", regionCode: "Lisboa Metropolitan Area", regionName: "Lisboa" },
        "x",
      ),
    ).toBe("Lisbon, Lisboa");
  });

  it("falls back to the country when there is no region", () => {
    expect(placeLabel({ locality: "Lisbon", country: "Portugal" }, "x")).toBe("Lisbon, Portugal");
  });

  it("uses the sub-region when there is no locality", () => {
    expect(placeLabel({ subRegion: "DeKalb County", regionCode: "GA" }, "x"))
      .toBe("DeKalb County, GA");
  });

  it("trims the title to its tail when there is nothing else — never its head", () => {
    // The head is the specific end. "30308, U-Rescue Villa, ..." must not
    // survive as "30308, U-Rescue Villa".
    expect(placeLabel({ title: "30308, U-Rescue Villa, Atlanta, GA, United States" }, "30308"))
      .toBe("GA, United States");
  });

  it("gives back what they typed rather than nothing at all", () => {
    expect(placeLabel({}, "30308")).toBe("30308");
    expect(placeLabel({ title: "  ", locality: "  " }, "Lisbon")).toBe("Lisbon");
  });
});

describe("distance units — stored in km, read in whatever you think in", () => {
  it("picks miles for the countries that actually use them", () => {
    for (const c of ["US", "GB", "LR", "MM", "us", "gb"]) {
      expect(unitForCountry(c)).toBe("mi");
    }
    // Britain is the one that catches people out: metric for nearly everything,
    // imperial on road signs.
    expect(unitForCountry("GB")).toBe("mi");
  });

  it("picks kilometres everywhere else, and when it has no idea", () => {
    for (const c of ["PT", "FR", "JP", "CA", "AU", "", null, undefined]) {
      expect(unitForCountry(c)).toBe("km");
    }
  });

  it("reads a locale's region", () => {
    expect(unitForLocale("en-US")).toBe("mi");
    expect(unitForLocale("en-GB")).toBe("mi");
    expect(unitForLocale("en-CA")).toBe("km");
    expect(unitForLocale("pt-PT")).toBe("km");
    expect(unitForLocale("en")).toBe("km");
    expect(unitForLocale(undefined)).toBe("km");
  });

  it("offers round numbers in the unit shown, not converted ones", () => {
    // The whole point: an applicant in Atlanta picks "25 miles", and 40 is
    // simply what that is in the column. They never see 16 or 161.
    expect(radiiFor("mi").map((km) => formatRadius(km, "mi")))
      .toEqual(["5 miles", "10 miles", "25 miles", "50 miles", "100+ miles"]);
    expect(radiiFor("km").map((km) => formatRadius(km, "km")))
      .toEqual(["5 km", "10 km", "25 km", "50 km", "100+ km"]);
  });

  it("every offered radius is one the server will accept", () => {
    for (const unit of ["km", "mi"] as const) {
      for (const km of radiiFor(unit)) expect(ALLOWED_RADII_KM).toContain(km);
      expect(ALLOWED_RADII_KM).toContain(defaultRadiusFor(unit));
    }
  });

  it("stays inside the database's 1–500 constraint", () => {
    for (const km of ALLOWED_RADII_KM) {
      expect(km).toBeGreaterThanOrEqual(1);
      expect(km).toBeLessThanOrEqual(500);
    }
  });

  it("a radius set in one unit still reaches the same people in the other", () => {
    // Nobody's matching changes when they cross a border, because the column
    // never changed — only the label.
    const atlanta = { lat: 33.781, lng: -84.384 };
    const decatur = { lat: 33.775, lng: -84.296 };
    expect(withinReach(atlanta, 40, decatur, 40)).toBe(true);
    expect(formatRadius(40, "mi")).toBe("25 miles");
    expect(formatRadius(40, "km")).toBe("40 km");
  });
});

describe("nearestRadius — a stored value from the other unit", () => {
  it("never shows one unit's numbers under the other unit's label", () => {
    // The bug: an American whose radius was set in kilometres saw
    // "3 | 6 | 16 | 31 | 62 miles". Whatever is selected, the options shown are
    // always this unit's own round numbers.
    for (const stored of [5, 10, 25, 50, 100, 8, 16, 40, 80, 161, 37]) {
      const labels = radiiFor("mi").map((km) => formatRadius(km, "mi"));
      expect(labels).toEqual(["5 miles", "10 miles", "25 miles", "50 miles", "100+ miles"]);
      // And something is always selected, so the form always posts a radius.
      expect(radiiFor("mi")).toContain(nearestRadius(stored, radiiFor("mi")));
    }
  });

  it("rounds up, so nobody's reach silently narrows", () => {
    // 25km is nearer to 16 than to 40, and picking 16 would quietly remove
    // people from their drops without anybody choosing that.
    expect(nearestRadius(25, radiiFor("mi"))).toBe(40);
    expect(nearestRadius(9, radiiFor("mi"))).toBe(16);
    expect(nearestRadius(8, radiiFor("mi"))).toBe(8);
  });

  it("falls back to the largest when the stored value is beyond every option", () => {
    expect(nearestRadius(500, radiiFor("mi"))).toBe(161);
    expect(nearestRadius(500, radiiFor("km"))).toBe(100);
  });

  it("leaves a value that is already on the list alone", () => {
    for (const unit of ["km", "mi"] as const) {
      for (const km of radiiFor(unit)) expect(nearestRadius(km, radiiFor(unit))).toBe(km);
    }
  });
});
