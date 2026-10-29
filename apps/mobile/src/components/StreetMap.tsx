/**
 * The flat map you reach by zooming into the globe. It opens at the globe's
 * scale as the globe's own drawing, closer: green land, blue water, rivers,
 * country and state borders, white ice, tan deserts. Nearer the ground it
 * becomes a satellite view (land, water, mountains, like Google Earth) and,
 * once you reach street level, turns into HS 2 from
 * Sketches/Home Screen.png: white ground, thick black streets with their names
 * in white. The selected location's red pin (with its own icon) stays the whole way down.
 *
 * Imagery is Esri World Imagery; streets are OpenStreetMap vector tiles (see
 * ./tiles) drawn with react-native-svg. Neither needs a map SDK or API key, so it
 * looks the same in Expo Go and on the web. Drag to pan, pinch (or mouse wheel)
 * to zoom; pinching back out past where you came in
 * hands back to the globe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { feature } from 'topojson-client';
import type { LatLng, SavedLocation } from '@get/shared';
import { colors, fonts } from '../theme';
import { placeShapes } from './Icons';
import surfaces from './surfaces.json';
import { T } from './ui';
import { ATTRIBUTION, BUILDINGS_ZOOM, ROADS, TILE_MAX_ZOOM, fromWorld, getBuildings, getTile, onTilesChanged, peekTile, toWorld, type Label, type TileData } from './tiles';

const TILE = 512; // screen px of a tile at its own zoom, as in MapLibre
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
/** tapping the pin on the globe flies all the way down to here */
const PIN_ZOOM = 16;
/** the drawn map gives way to the satellite view between these */
const SATELLITE_FROM = 10.5;
const SATELLITE_FULL = 11.5;
/** the satellite view gives way to the black-and-white streets between these */
const STREETS_FROM = 14.4;
const STREETS_FULL = 15.4;
/** building footprints fade in between these, under the streets */
const BUILDINGS_FROM = 15.6;
const BUILDINGS_FULL = 16.4;

const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const SAT_MAX_ZOOM = 18;
const SAT_ATTRIBUTION = 'Esri, Maxar, Earthstar Geographics';

type View2 = { x: number; y: number; zoom: number };

// the globe's ice and deserts (see Globe.tsx), so they carry on into the drawn map
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const surf = surfaces as any;
const ICE = feature(surf, surf.objects.ice) as unknown as GeoPermissibleObjects;
const DESERT = feature(surf, surf.objects.desert) as unknown as GeoPermissibleObjects;

type Props = {
  width: number;
  height: number;
  active: boolean;
  selected: LatLng & { icon?: SavedLocation['icon'] };
  /**
   * when the key changes the map opens on this point at the globe's scale
   * (its radius in px); with `streets` it then flies down to street level
   */
  enter: { point: LatLng; key: number; scale?: number; streets?: boolean };
  /** when the key changes the map flies to the point if it is out of view */
  focus: { point: LatLng; key: number };
  onExit?: (center: LatLng) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const wrap = (x: number) => x - Math.floor(x);
const worldPx = (zoom: number) => TILE * 2 ** zoom;
const roadWidth = (base: number, zoom: number) => Math.max(0.8, base * 2 ** ((zoom - 16) * 0.8));

export function StreetMap({ width, height, active, selected, enter, focus, onExit }: Props) {
  const start = toWorld(enter.point.lng, enter.point.lat);
  const view = useRef<View2>({ ...start, zoom: MIN_ZOOM });
  /** letting go below this zoom goes back to the globe */
  const exitBelow = useRef(MIN_ZOOM);
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => (f + 1) % 1_000_000);
  const anim = useRef<number | null>(null);

  useEffect(() => onTilesChanged(redraw), []);

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };
  useEffect(() => stopAnim, []);

  const animate = (to: View2, ms: number, from: View2 = { ...view.current }) => {
    stopAnim();
    // take the short way around the date line
    let tx = to.x;
    while (tx - from.x > 0.5) tx -= 1;
    while (tx - from.x < -0.5) tx += 1;
    const t0 = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / ms);
      const e = easeInOut(t);
      view.current = {
        x: wrap(from.x + (tx - from.x) * e),
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      };
      redraw();
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };

  const enteredAt = useRef(0);
  useEffect(() => {
    if (!enter.key) return;
    enteredAt.current = Date.now();
    const p = toWorld(enter.point.lng, enter.point.lat);
    // the zoom whose ground scale matches the globe's at this latitude
    const cos = Math.cos((enter.point.lat * Math.PI) / 180);
    const z0 = enter.scale ? clamp(Math.log2((2 * Math.PI * enter.scale * cos) / TILE), MIN_ZOOM + 0.6, 12) : 12;
    exitBelow.current = z0 - 0.5;
    if (enter.streets) animate({ ...p, zoom: PIN_ZOOM }, 1800, { ...p, zoom: z0 });
    else {
      stopAnim();
      view.current = { ...p, zoom: z0 };
      redraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter.key]);

  useEffect(() => {
    if (!active) return;
    const p = toWorld(focus.point.lng, focus.point.lat);
    const W = worldPx(view.current.zoom);
    let dx = (p.x - view.current.x) * W;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    const dy = (p.y - view.current.y) * W;
    if (Math.abs(dx) < width * 0.38 && Math.abs(dy) < height * 0.38) return; // already in view
    animate({ ...p, zoom: view.current.zoom }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.key]);

  // ── gestures ──
  type Mode = 'none' | 'pan' | 'pinch';
  const g = useRef({ mode: 'none' as Mode, base: view.current, dx0: 0, dy0: 0, d0: 0, wp: { x: 0, y: 0 }, t: 0, moved: false });
  const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches ?? [];

  const latest = useRef({ width, height, onExit, selected });
  latest.current = { width, height, onExit, selected };

  const screenToWorld = (sx: number, sy: number, v: View2 = view.current) => {
    const W = worldPx(v.zoom);
    const { width: w, height: h } = latest.current;
    return { x: v.x + (sx - w / 2) / W, y: v.y + (sy - h / 2) / W };
  };

  const setView = (v: View2) => {
    view.current = { x: wrap(v.x), y: clamp(v.y, 0, 1), zoom: clamp(v.zoom, MIN_ZOOM, MAX_ZOOM) };
  };

  const exit = () => {
    stopAnim();
    const c = fromWorld(view.current.x, view.current.y);
    latest.current.onExit?.(c);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          stopAnim();
          g.current = { ...g.current, mode: 'none', base: { ...view.current }, t: Date.now(), moved: false };
        },
        onPanResponderMove: (e, gs) => {
          const ts = touchesOf(e);
          if (ts.length >= 2) {
            const mx = (ts[0].pageX + ts[1].pageX) / 2;
            const my = (ts[0].pageY + ts[1].pageY) / 2;
            const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
            if (g.current.mode !== 'pinch') {
              // keep the point between the fingers under the fingers
              g.current = { ...g.current, mode: 'pinch', base: { ...view.current }, d0: d || 1, wp: screenToWorld(mx, my) };
            }
            const zoom = clamp(g.current.base.zoom + Math.log2(d / g.current.d0), MIN_ZOOM, MAX_ZOOM);
            const W = worldPx(zoom);
            const { width: w, height: h } = latest.current;
            setView({ x: g.current.wp.x - (mx - w / 2) / W, y: g.current.wp.y - (my - h / 2) / W, zoom });
            g.current.moved = true;
          } else {
            if (g.current.mode !== 'pan') {
              g.current = { ...g.current, mode: 'pan', base: { ...view.current }, dx0: gs.dx, dy0: gs.dy };
            }
            const dx = gs.dx - g.current.dx0;
            const dy = gs.dy - g.current.dy0;
            if (Math.abs(gs.dx) + Math.abs(gs.dy) > 6) g.current.moved = true;
            const W = worldPx(g.current.base.zoom);
            setView({ ...g.current.base, x: g.current.base.x - dx / W, y: g.current.base.y - dy / W });
          }
          redraw();
        },
        onPanResponderRelease: (e, gs) => {
          if (!g.current.moved) {
            // a tap: on the red pin it flies down to the streets; anywhere else it does
            // nothing, since the selected location only changes from the Location Interface
            const sel = latest.current.selected;
            const p = toWorld(sel.lng, sel.lat);
            const W = worldPx(view.current.zoom);
            const { width: w, height: h } = latest.current;
            let dx = (p.x - view.current.x) * W;
            if (dx > W / 2) dx -= W;
            if (dx < -W / 2) dx += W;
            const px = w / 2 + dx;
            const py = h / 2 + (p.y - view.current.y) * W;
            if (Math.hypot(e.nativeEvent.locationX - px, e.nativeEvent.locationY - py) < 28) {
              animate({ ...p, zoom: Math.max(PIN_ZOOM, view.current.zoom) }, 1400);
            }
            return;
          }
          if (view.current.zoom < exitBelow.current) return exit();
          if (g.current.mode !== 'pan') return;
          // a little inertia after a flick
          let vx = gs.vx * 16;
          let vy = gs.vy * 16;
          const coast = () => {
            vx *= 0.92;
            vy *= 0.92;
            if (Math.abs(vx) + Math.abs(vy) < 0.3) return (anim.current = null);
            const W = worldPx(view.current.zoom);
            setView({ ...view.current, x: view.current.x - vx / W, y: view.current.y - vy / W });
            redraw();
            anim.current = requestAnimationFrame(coast);
          };
          anim.current = requestAnimationFrame(coast);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const wheelOut = useRef(0);
  const webWheel =
    Platform.OS === 'web'
      ? {
          onWheel: (e: { deltaY: number }) => {
            // the scroll that dove in from the globe keeps coming for a moment; let the dive finish
            if (Date.now() - enteredAt.current < 1200) return;
            stopAnim();
            const zoom = view.current.zoom - e.deltaY * 0.003;
            if (zoom < exitBelow.current) {
              // keep scrolling out past the edge to go back to the globe
              wheelOut.current += e.deltaY;
              if (wheelOut.current > 240) {
                wheelOut.current = 0;
                return exit();
              }
            } else wheelOut.current = 0;
            setView({ ...view.current, zoom });
            redraw();
          },
        }
      : {};

  // ── draw ──
  const { x: cxW, y: cyW, zoom } = view.current;
  const tz = clamp(Math.floor(zoom), 0, TILE_MAX_ZOOM);
  const n = 2 ** tz;
  const ts = TILE * 2 ** (zoom - tz); // screen px per tile at this zoom
  const cxT = cxW * n;
  const cyT = cyW * n;
  const x0 = Math.floor(cxT - width / 2 / ts);
  const x1 = Math.floor(cxT + width / 2 / ts);
  const y0 = Math.max(0, Math.floor(cyT - height / 2 / ts));
  const y1 = Math.min(n - 1, Math.floor(cyT + height / 2 / ts));

  type Placed = { key: string; tile: TileData; ox: number; oy: number; s: number; buildings?: string };
  const below: Placed[] = []; // coarser tiles standing in while the right ones load
  const tiles: Placed[] = [];
  const seen = new Set<string>();
  const streets = clamp((zoom - STREETS_FROM) / (STREETS_FULL - STREETS_FROM), 0, 1);
  const buildings = clamp((zoom - BUILDINGS_FROM) / (BUILDINGS_FULL - BUILDINGS_FROM), 0, 1);
  const drawn = 1 - clamp((zoom - SATELLITE_FROM) / (SATELLITE_FULL - SATELLITE_FROM), 0, 1);
  if (enter.key && (streets > 0 || drawn > 0)) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ox = width / 2 + (tx - cxT) * ts;
        const oy = height / 2 + (ty - cyT) * ts;
        const t = getTile(tz, ((tx % n) + n) % n, ty);
        if (t) {
          // Overture's footprints where loaded, OpenStreetMap's own until then
          const b = buildings > 0 && tz === BUILDINGS_ZOOM ? getBuildings(tz, ((tx % n) + n) % n, ty) : undefined;
          tiles.push({ key: `${tz}/${tx}/${ty}`, tile: t, ox, oy, s: ts / t.extent, buildings: b ?? t.buildings });
          continue;
        }
        for (let k = 1; k <= 4 && tz - k >= 0; k++) {
          const pz = tz - k;
          const pn = 2 ** pz;
          const px = Math.floor(tx / 2 ** k);
          const py = Math.floor(ty / 2 ** k);
          const key = `${pz}/${px}/${py}`;
          if (seen.has(key)) break;
          const p = peekTile(pz, ((px % pn) + pn) % pn, py);
          if (!p) continue;
          seen.add(key);
          const pts = ts * 2 ** k;
          below.unshift({ key, tile: p, ox: width / 2 + (px - cxW * pn) * pts, oy: height / 2 + (py - cyW * pn) * pts, s: pts / p.extent });
          break;
        }
      }
    }
  }

  const drawTile = ({ key, tile, ox, oy, s, buildings: b = tile.buildings }: Placed) => (
    <G key={key} transform={`translate(${ox} ${oy}) scale(${s})`}>
      {!!tile.water && <Path d={tile.water} fill={colors.field} />}
      {!!b && buildings > 0 && (
        // fill only: an outline would also trace where buildings are cut at tile edges
        <Path d={b} fill="#E4E4E4" opacity={buildings} />
      )}
      {ROADS.slice()
        .reverse()
        .map((r) =>
          tile.roads[r.key] ? (
            <Path
              key={r.key}
              d={tile.roads[r.key]}
              fill="none"
              stroke={colors.black}
              strokeWidth={roadWidth(r.width, zoom) / s}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
    </G>
  );

  // the drawn map: the globe's colours, with OpenStreetMap's water, rivers and borders
  const drawTileDrawn = ({ key, tile, ox, oy, s }: Placed) => (
    <G key={key} transform={`translate(${ox} ${oy}) scale(${s})`}>
      {!!tile.water && <Path d={tile.water} fill={colors.ocean} />}
      {!!tile.rivers && <Path d={tile.rivers} fill="none" stroke={colors.ocean} strokeWidth={1.1 / s} strokeLinejoin="round" />}
      {!!tile.stateBorders && <Path d={tile.stateBorders} fill="none" stroke={colors.landStroke} strokeWidth={0.7 / s} opacity={0.75} />}
      {!!tile.countryBorders && <Path d={tile.countryBorders} fill="none" stroke={colors.landStroke} strokeWidth={1.3 / s} />}
    </G>
  );
  let iceD = '';
  let desertD = '';
  if (enter.key && drawn > 0) {
    const Wd = worldPx(zoom);
    const mercator = geoMercator()
      .scale(Wd / (2 * Math.PI))
      .translate([width / 2 + (0.5 - cxW) * Wd, height / 2 + (0.5 - cyW) * Wd])
      .clipExtent([
        [-10, -10],
        [width + 10, height + 10],
      ]);
    const path = geoPath(mercator);
    iceD = path(ICE) ?? '';
    desertD = path(DESERT) ?? '';
  }

  const sel = toWorld(selected.lng, selected.lat);
  const W = worldPx(zoom);
  let pdx = (sel.x - cxW) * W;
  if (pdx > W / 2) pdx -= W;
  if (pdx < -W / 2) pdx += W;
  const pin = { x: width / 2 + pdx, y: height / 2 + (sel.y - cyW) * W };

  // street names, in white inside the street, kept apart from each other
  const labels: { l: Label; x: number; y: number; size: number }[] = [];
  if (zoom >= 14.5) {
    const placed: { x: number; y: number; r: number; name: string }[] = [];
    for (const { tile, ox, oy, s } of tiles) {
      for (const l of tile.labels) {
        const w = roadWidth(ROADS.find((r) => r.key === l.road)!.width, zoom);
        const size = Math.min(11, w - 3);
        if (size < 7) continue;
        const textLen = l.name.length * size * 0.56;
        const segLen = l.length * s;
        if (textLen > segLen * 0.9) continue;
        // long streets get their name repeated every few hundred px, like the sketch
        const count = Math.max(1, Math.floor(segLen / 320));
        for (let k = 0; k < count; k++) {
          const f = (k + 0.5) / count;
          const x = ox + (l.ax + (l.bx - l.ax) * f) * s;
          const y = oy + (l.ay + (l.by - l.ay) * f) * s;
          if (x < 0 || y < 0 || x > width || y > height) continue;
          const r = textLen / 2 + 12;
          if (Math.hypot(x - pin.x, y - pin.y) < r + 16) continue; // keep clear of the red ring
          if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r || (p.name === l.name && Math.hypot(p.x - x, p.y - y) < 220))) continue;
          placed.push({ x, y, r, name: l.name });
          labels.push({ l, x, y, size });
        }
        if (labels.length >= 40) break;
      }
    }
  }

  // satellite imagery, with a coarser layer underneath while the sharp tiles load
  const satellite = (z: number) => {
    const sn = 2 ** z;
    const size = (TILE / 2) * 2 ** (zoom + 1 - z); // Esri tiles are 256 px
    const out: { key: string; uri: string; left: number; top: number; size: number }[] = [];
    const sx = cxW * sn;
    const sy = cyW * sn;
    for (let ty = Math.max(0, Math.floor(sy - height / 2 / size)); ty <= Math.min(sn - 1, Math.floor(sy + height / 2 / size)); ty++) {
      for (let tx = Math.floor(sx - width / 2 / size); tx <= Math.floor(sx + width / 2 / size); tx++) {
        out.push({
          key: `${z}/${tx}/${ty}`,
          uri: `${SATELLITE}/${z}/${ty}/${((tx % sn) + sn) % sn}`,
          left: width / 2 + (tx - sx) * size,
          top: height / 2 + (ty - sy) * size,
          size: size + 0.5, // hide hairline seams
        });
      }
    }
    return out;
  };
  const satZ = clamp(Math.floor(zoom + 1.5), 1, SAT_MAX_ZOOM);
  const sat = enter.key && streets < 1 && drawn < 1 ? [...(satZ > 3 ? satellite(satZ - 3) : []), ...satellite(satZ)] : [];

  return (
    <View style={[styles.root, { width, height }]} {...responder.panHandlers} {...(webWheel as object)}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {sat.map((t) => (
          <Image key={t.key} source={{ uri: t.uri }} style={{ position: 'absolute', left: t.left, top: t.top, width: t.size, height: t.size }} />
        ))}
      </View>
      {streets > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.white, opacity: streets }]} pointerEvents="none" />}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {!!enter.key && drawn > 0 && (
          <G opacity={drawn}>
            <Rect x={0} y={0} width={width} height={height} fill={colors.land} />
            {!!desertD && <Path d={desertD} fill={colors.desert} />}
            {!!iceD && <Path d={iceD} fill={colors.ice} />}
            {below.map(drawTileDrawn)}
            {tiles.map(drawTileDrawn)}
          </G>
        )}
        {streets > 0 && (
          <G opacity={streets}>
        {below.map(drawTile)}
        {tiles.map(drawTile)}
        {labels.map(({ l, x, y, size }, i) => (
          <SvgText
            key={`${l.name}${i}`}
            transform={`translate(${x} ${y}) rotate(${(l.angle * 180) / Math.PI})`}
            y={size * 0.36}
            fill={colors.white}
            fontSize={size}
            fontWeight="600"
            fontFamily={fonts.sans}
            textAnchor="middle"
          >
            {l.name}
          </SvgText>
        ))}
        </G>
        )}
        {!!enter.key && (
          <G>
            <Ellipse cx={pin.x} cy={pin.y + 15} rx={8} ry={3} fill="#000" opacity={0.3} />
            <Circle cx={pin.x} cy={pin.y} r={13} fill={colors.red} />
            <G transform={`translate(${pin.x - 7.75} ${pin.y - 7.75}) scale(${15.5 / 24})`}>{placeShapes(selected.icon ?? 'here', colors.white)}</G>
          </G>
        )}
      </Svg>
      <T style={[styles.attribution, streets < 0.5 && { color: colors.hairline }]} pointerEvents="none">
        {streets < 0.5 && drawn < 0.5 ? SAT_ATTRIBUTION : ATTRIBUTION}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
  attribution: { position: 'absolute', right: 8, bottom: 18, fontSize: 9, color: colors.muted },
});
