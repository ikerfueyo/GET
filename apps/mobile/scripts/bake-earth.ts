/**
 * Bakes the globe's map for the GPU, in two steps:
 *   npx tsx scripts/bake-earth.ts           draws 8192×4096 masks of land, desert
 *                                           and ice, and writes the border lines,
 *                                           into scripts/.masks/
 *   python3 scripts/bake-sdf.py             turns them into distance fields:
 *                                           assets/earth-sdf.png and earth-borders.png
 * (bake-sdf.py needs numpy, scipy and pillow.) Each texel stores how far it is
 * from the nearest edge, so the shader can cut edges sharply at any zoom
 * instead of stretching a picture. Re-run after changing surfaces.json.
 */
import { geoEquirectangular, geoPath } from 'd3-geo';
import { mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { feature, mesh } from 'topojson-client';
import countries from 'world-atlas/countries-110m.json';
import surfaces from '../src/components/surfaces.json';

const W = 8192;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const c = countries as any, s = surfaces as any;
const layers = {
  land: feature(c, c.objects.land),
  desert: feature(s, s.objects.desert),
  ice: feature(s, s.objects.ice),
};
const BORDERS = mesh(c, c.objects.countries, (a: unknown, b: unknown) => a !== b);

const { chromium } = createRequire(import.meta.url)('playwright');
(async () => {
  mkdirSync('scripts/.masks', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, W / 4]).precision(0.05);
  const path = geoPath(projection);
  // the borders as lines in 4096-wide texels, for exact distances to their centre
  const lines = BORDERS.coordinates.map((line) =>
    line.map(([lng, lat]) => projection([lng, lat])!.map((v) => +(v / 2).toFixed(3))),
  );
  writeFileSync('scripts/.masks/borders.json', JSON.stringify(lines));
  for (const [name, layer] of Object.entries(layers)) {
    const d = path(layer as never) ?? '';
    const png: string = await page.evaluate(
      ({ W, d, name }: { W: number; d: string; name: string }) => {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = W / 2;
        const g = canvas.getContext('2d')!;
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, W / 2);
        g.fillStyle = g.strokeStyle = '#fff';
        g.fill(new Path2D(d));
        // Antarctica's edge along the South Pole doesn't quite reach the bottom row
        if (name === 'land' || name === 'ice') g.fillRect(0, (W / 2) * (174 / 180), W, W / 2);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { W, d, name },
    );
    writeFileSync(`scripts/.masks/${name}.png`, Buffer.from(png, 'base64'));
  }
  await browser.close();
})();
