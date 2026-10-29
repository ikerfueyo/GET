/**
 * Street data for HS 2: OpenStreetMap vector tiles (OpenMapTiles schema) from
 * OpenFreeMap, which needs no API key. We only keep what the sketch draws:
 * streets and their names, building footprints for close zooms (like the Uber
 * Eats map), plus water so coastlines still read.
 */
import { VectorTile } from '@mapbox/vector-tile';
import { gunzipSync } from 'fflate';
import { Compression, PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
export const TILE_MAX_ZOOM = 14; // deeper zooms overzoom the z14 tiles
export const ATTRIBUTION = '© OpenMapTiles © OpenStreetMap © Overture Maps';

/** road classes drawn, widest first; widths are px at zoom 16 */
export const ROADS = [
  { key: 'major', classes: ['motorway', 'trunk', 'primary'], width: 16 },
  { key: 'mid', classes: ['secondary', 'tertiary'], width: 14 },
  { key: 'minor', classes: ['minor', 'busway'], width: 11 },
  { key: 'service', classes: ['service', 'track', 'raceway'], width: 6 },
  { key: 'path', classes: ['path', 'pedestrian'], width: 2.5 },
] as const;
export type RoadKey = (typeof ROADS)[number]['key'];

const ROAD_OF: Record<string, RoadKey> = {};
for (const r of ROADS) for (const c of r.classes) ROAD_OF[c] = r.key;

export interface Label {
  name: string;
  road: RoadKey;
  /** the straight piece of street the label runs along, tile units */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** radians, kept within ±90° so text never reads upside down */
  angle: number;
  length: number;
}

export interface TileData {
  extent: number;
  roads: Partial<Record<RoadKey, string>>;
  water: string;
  buildings: string;
  labels: Label[];
}

let template: Promise<string> | null = null;
function tileUrlTemplate() {
  template ??= fetch(TILEJSON)
    .then((r) => r.json())
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => {
      template = null; // try again on the next tile
      throw e;
    });
  return template;
}

const cache = new Map<string, TileData | 'loading' | 'error'>();
const listeners = new Set<() => void>();
export const onTilesChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

export const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

/** a tile only if it is already loaded; never starts a download */
export function peekTile(z: number, x: number, y: number): TileData | undefined {
  const hit = cache.get(tileKey(z, x, y));
  return hit && hit !== 'loading' && hit !== 'error' ? hit : undefined;
}

// ── buildings ──
// OpenStreetMap misses most buildings outside big cities (Tampico has almost
// none), so footprints come from Overture Maps, which merges OSM with Microsoft
// and Google's machine-traced buildings and covers nearly everywhere. It is one
// PMTiles archive read with HTTP range requests; bump the release when Overture
// retires it (https://docs.overturemaps.org/examples/overture-tiles).
const OVERTURE_BUILDINGS = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-10-21.0/buildings.pmtiles';
export const BUILDINGS_ZOOM = 14;

// Hermes has no DecompressionStream, so gunzip in JS
const decompress = async (buf: ArrayBuffer, c: Compression) =>
  c === Compression.Gzip ? (gunzipSync(new Uint8Array(buf)).buffer as ArrayBuffer) : buf;
let overture: PMTiles | null = null;
const buildingCache = new Map<string, string | 'loading' | 'error'>();

/** building footprints of a z14 tile as one SVG path in tile units, loading it if needed */
export function getBuildings(z: number, x: number, y: number): string | undefined {
  const key = tileKey(z, x, y);
  const hit = buildingCache.get(key);
  if (hit !== undefined) return hit === 'loading' || hit === 'error' ? undefined : hit;
  buildingCache.set(key, 'loading');
  overture ??= new PMTiles(OVERTURE_BUILDINGS, undefined, decompress);
  overture
    .getZxy(z, x, y)
    .then((r) => {
      const d: string[] = [];
      if (r) {
        const layer = new VectorTile(new PbfReader(new Uint8Array(r.data))).layers.building;
        for (let i = 0; layer && i < layer.length; i++) {
          const f = layer.feature(i);
          if (f.type === 3 && f.properties.is_underground !== true) d.push(ringsD(f.loadGeometry()));
        }
      }
      buildingCache.set(key, d.join(''));
      notify();
    })
    .catch(() => {
      buildingCache.set(key, 'error');
      setTimeout(() => buildingCache.get(key) === 'error' && buildingCache.delete(key), 5000);
    });
  return undefined;
}

/** returns the tile if it is ready, and starts loading it if it is not */
export function getTile(z: number, x: number, y: number): TileData | undefined {
  const key = tileKey(z, x, y);
  const hit = cache.get(key);
  if (hit && hit !== 'loading' && hit !== 'error') return hit;
  if (!hit) {
    cache.set(key, 'loading');
    tileUrlTemplate()
      .then((t) => fetch(t.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))))
      .then((r) => {
        if (!r.ok) throw new Error(`tile ${key}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        cache.set(key, parseTile(buf));
        notify();
      })
      .catch(() => {
        cache.set(key, 'error');
        // let a later pan retry it
        setTimeout(() => cache.get(key) === 'error' && cache.delete(key), 5000);
      });
  }
  return undefined;
}

function parseTile(buf: ArrayBuffer): TileData {
  const vt = new VectorTile(new PbfReader(buf));
  const out: TileData = { extent: 4096, roads: {}, water: '', buildings: '', labels: [] };
  const parts: Partial<Record<RoadKey, string[]>> = {};

  const roads = vt.layers.transportation;
  if (roads) {
    out.extent = roads.extent;
    for (let i = 0; i < roads.length; i++) {
      const f = roads.feature(i);
      const road = ROAD_OF[String(f.properties.class)];
      if (!road || f.type !== 2) continue;
      (parts[road] ??= []).push(linesD(f.loadGeometry()));
    }
  }
  for (const r of ROADS) if (parts[r.key]) out.roads[r.key] = parts[r.key]!.join('');

  const water = vt.layers.water;
  if (water) {
    const w: string[] = [];
    for (let i = 0; i < water.length; i++) {
      const f = water.feature(i);
      if (f.type === 3) w.push(ringsD(f.loadGeometry()));
    }
    out.water = w.join('');
  }

  const buildings = vt.layers.building;
  if (buildings) {
    const b: string[] = [];
    for (let i = 0; i < buildings.length; i++) {
      const f = buildings.feature(i);
      if (f.type === 3) b.push(ringsD(f.loadGeometry()));
    }
    out.buildings = b.join('');
  }

  const names = vt.layers.transportation_name;
  if (names) {
    for (let i = 0; i < names.length; i++) {
      const f = names.feature(i);
      const road = ROAD_OF[String(f.properties.class)];
      const name = f.properties.name;
      if (!road || road === 'path' || f.type !== 2 || typeof name !== 'string' || !name) continue;
      // the label sits on the longest straight piece of the street
      let best: Label | null = null;
      for (const line of f.loadGeometry()) {
        for (let j = 1; j < line.length; j++) {
          const a = line[j - 1];
          const b = line[j];
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (best && length <= best.length) continue;
          let angle = Math.atan2(b.y - a.y, b.x - a.x);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          best = { name, road, ax: a.x, ay: a.y, bx: b.x, by: b.y, angle, length };
        }
      }
      if (best) out.labels.push(best);
    }
  }
  return out;
}

type Pt = { x: number; y: number };
const linesD = (lines: Pt[][]) =>
  lines.map((l) => l.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')).join('');
const ringsD = (rings: Pt[][]) => linesD(rings).replace(/(M[^M]*)/g, '$1Z');

// ── Web Mercator ──
// world coordinates are 0..1 across and down the whole map

export const toWorld = (lng: number, lat: number) => {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
};

export const fromWorld = (x: number, y: number) => ({
  lng: x * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
});
