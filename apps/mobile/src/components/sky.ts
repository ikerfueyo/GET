/**
 * Where the Sun, Moon, Mars and the stars are right now, as vectors in
 * the Earth-fixed frame (x towards 0°N 0°E, y towards 0°N 90°E, z towards the
 * North Pole), in Earth radii. Low-precision formulas: the Moon from the
 * Astronomical Almanac's short series, the planets from JPL's approximate
 * Keplerian elements (1800–2050). Good to a fraction of a degree, which is far
 * below a pixel on a phone.
 */
import starData from './stars.json';

export type Vec = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Earth radius and the astronomical unit, in km */
const EARTH_KM = 6371;
const AU = 149_597_870.7 / EARTH_KM;
export const MOON_RADIUS = 1737.4 / EARTH_KM;

const OBLIQUITY = rad(23.4393);

/** ecliptic → equatorial: tilt about the x axis by the obliquity */
const eclToEq = ([x, y, z]: Vec): Vec => [
  x,
  y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY),
  y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY),
];

/** equatorial (fixed to the stars) → Earth-fixed: turn by sidereal time */
const eqToEarth = ([x, y, z]: Vec, gmst: number): Vec => {
  const c = Math.cos(gmst);
  const s = Math.sin(gmst);
  return [x * c + y * s, -x * s + y * c, z];
};

const fromAngles = (lon: number, lat: number, dist = 1): Vec => [
  dist * Math.cos(lat) * Math.cos(lon),
  dist * Math.cos(lat) * Math.sin(lon),
  dist * Math.sin(lat),
];

// a, e, I, L, long. of perihelion, long. of node; then their rates per century
type Elements = [number, number, number, number, number, number, number, number, number, number, number, number];
const EARTH: Elements = [
  1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
  0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0,
];
const MARS: Elements = [
  1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
  0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343,
];

/** heliocentric ecliptic position in AU */
function heliocentric(el: Elements, T: number): Vec {
  const a = el[0] + el[6] * T;
  const e = el[1] + el[7] * T;
  const I = rad(el[2] + el[8] * T);
  const L = el[3] + el[9] * T;
  const peri = el[4] + el[10] * T;
  const node = rad(el[5] + el[11] * T);
  const w = rad(peri) - node;
  const M = rad(((L - peri) % 360) + 360);
  let E = M;
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w), Math.sin(w), Math.cos(node), Math.sin(node), Math.cos(I), Math.sin(I)];
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const angleBetween = (a: Vec, b: Vec) =>
  Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b)))));

export type Planet = { pos: Vec; mag: number };
export type Sky = { gmst: number; sun: Vec; moon: Vec; mars: Planet; marsPole: Vec };

export function skyAt(date: Date): Sky {
  const d = date.getTime() / 86_400_000 - 10957.5; // days since J2000.0
  const T = d / 36525;
  const gmst = rad(280.46061837 + 360.98564736629 * d);
  const toEarth = (ecl: Vec) => eqToEarth(eclToEq(ecl), gmst);

  // Moon
  const s = (a: number, b: number) => Math.sin(rad(a + b * T));
  const c = (a: number, b: number) => Math.cos(rad(a + b * T));
  const lon =
    218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22) +
    0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const lat = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const parallax =
    0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) +
    0.0028 * c(269.9, 954397.74);
  const moon = toEarth(fromAngles(rad(lon), rad(lat), 1 / Math.sin(rad(parallax))));

  // Sun and planets, geocentric
  const earth = heliocentric(EARTH, T);
  const planet = (el: Elements, magnitude: (r: number, delta: number, phase: number) => number): Planet => {
    const helio = heliocentric(el, T);
    const geo = sub(helio, earth);
    const phase = deg(angleBetween(helio, geo)); // Sun–planet–Earth angle
    return { pos: toEarth(geo.map((v) => v * AU) as Vec), mag: magnitude(len(helio), len(geo), phase) };
  };
  // Mallama & Hilton (2018) visual magnitude
  const mars = planet(MARS, (r, D, i) => -1.601 + 5 * Math.log10(r * D) + 2.267e-2 * i - 1.302e-4 * i * i);

  // Mars' north pole points at RA 317.68°, Dec 52.89° (IAU)
  const marsPole = eqToEarth(fromAngles(rad(317.68), rad(52.89)), gmst);

  return { gmst, sun: toEarth(earth.map((v) => -v * AU) as Vec), moon, mars, marsPole };
}

/** the Bright Star Catalogue down to magnitude 5.5 (≈2,850 stars), as [ra°, dec°, mag] */
const STARS = (starData as [number, number, number][]).map(([ra, dec, mag]) => ({ v: fromAngles(rad(ra), rad(dec)), mag }));

/** star directions (unit vectors) in the Earth-fixed frame */
export function starsAt(gmst: number) {
  return STARS.map((s) => ({ v: eqToEarth(s.v, gmst), mag: s.mag }));
}

/** dot radius in px for a point of light of this magnitude */
export const dotRadius = (mag: number) => Math.max(0.35, 1.25 - 0.18 * mag);
