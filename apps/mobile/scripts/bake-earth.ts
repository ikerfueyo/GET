/**
 * Bakes the globe's map into equirectangular images (assets/earth-*.png), so
 * the GPU only wraps a picture around a sphere instead of re-drawing every
 * coastline each frame. Run after changing the map data or its colours:
 *   npx tsx scripts/bake-earth.ts
 * Colours mirror theme.ts (ocean, land, desert, ice, landStroke).
 */
import { geoEquirectangular, geoPath } from 'd3-geo';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { feature, mesh } from 'topojson-client';
import countries from 'world-atlas/countries-110m.json';
import surfaces from '../src/components/surfaces.json';

const COLORS = { ocean: '#2D5BC4', land: '#2E7D4F', desert: '#C8B27A', ice: '#FFFFFF', border: '#256A42' };
export const SIZES = [1024, 2048, 4096];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const c = countries as any, s = surfaces as any;
const layers = {
  land: feature(c, c.objects.land),
  desert: feature(s, s.objects.desert),
  ice: feature(s, s.objects.ice),
  borders: mesh(c, c.objects.countries, (a: unknown, b: unknown) => a !== b),
};

const { chromium } = createRequire(import.meta.url)('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const w of SIZES) {
    const path = geoPath(geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, w / 4]).precision(0.1));
    const d = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, path(v as never) ?? '']));
    const png: string = await page.evaluate(
      ({ w, d, col }: { w: number; d: Record<string, string>; col: typeof COLORS }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = w / 2;
        const g = canvas.getContext('2d')!;
        g.fillStyle = col.ocean;
        g.fillRect(0, 0, w, w / 2);
        for (const k of ['land', 'desert', 'ice'] as const) {
          g.fillStyle = col[k];
          g.fill(new Path2D(d[k]));
        }
        // the polygon's edge along the South Pole doesn't quite reach the bottom row
        g.fillStyle = col.ice;
        g.fillRect(0, (w / 2) * (174 / 180), w, w / 2);
        // about 0.6 px on screen at the zoom each size is used for
        g.strokeStyle = col.border;
        g.lineWidth = 0.7;
        g.stroke(new Path2D(d.borders));
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { w, d, col: COLORS },
    );
    writeFileSync(`assets/earth-${w}.png`, Buffer.from(png, 'base64'));
  }
  await browser.close();
})();
