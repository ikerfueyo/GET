/**
 * Where the Moon and Mars are right now, as the Earth longitude they sit
 * above (their "sub-point"). Low-precision mean-orbit formulas: good to a few
 * degrees, which is plenty for placing them around the globe.
 */
const norm = (deg: number) => ((deg % 360) + 540) % 360 - 180;
const rad = (d: number) => (d * Math.PI) / 180;

export function bodyLongitudes(date: Date): { moon: number; mars: number } {
  const d = date.getTime() / 86_400_000 - 10957.5; // days since J2000.0
  const gmst = 280.46061837 + 360.98564736629 * d;

  // Moon: mean longitude plus the largest periodic term
  const meanAnomaly = rad(134.963 + 13.064993 * d);
  const moonLon = 218.316 + 13.176396 * d + 6.289 * Math.sin(meanAnomaly);

  // Mars seen from Earth: subtract two circular heliocentric orbits
  const earthLon = rad(100.464 + 0.9856474 * d);
  const marsLon = rad(355.433 + 0.5240207766 * d);
  const x = 1.524 * Math.cos(marsLon) - Math.cos(earthLon);
  const y = 1.524 * Math.sin(marsLon) - Math.sin(earthLon);
  const marsGeo = (Math.atan2(y, x) * 180) / Math.PI;

  return { moon: norm(moonLon - gmst), mars: norm(marsGeo - gmst) };
}
