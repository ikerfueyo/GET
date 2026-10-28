/**
 * HS 2: the street-level map you reach by zooming into the globe. White ground,
 * thick black streets with their names in white, the selected location as the
 * red ring, as in Sketches/Home Screen.png.
 *
 * Streets come from OpenStreetMap vector tiles (see ./tiles) and are drawn with
 * react-native-svg, so it looks the same in Expo Go and on the web and needs no
 * map SDK or API key. Drag to pan, pinch (or mouse wheel) to zoom, tap to pick a
 * location; pinching out far enough hands back to the globe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';
import type { LatLng } from '@get/shared';
import { colors, fonts } from '../theme';
import { T } from './ui';
import { ATTRIBUTION, ROADS, TILE_MAX_ZOOM, fromWorld, getTile, onTilesChanged, peekTile, toWorld, type Label, type TileData } from './tiles';

const TILE = 512; // screen px of a tile at its own zoom, as in MapLibre
const MIN_ZOOM = 11;
const MAX_ZOOM = 19;
/** where a dive from the globe starts and lands */
export const ENTER_FROM = 12;
export const ENTER_TO = 15.6;
/** letting go below this zoom goes back to the globe */
const EXIT_ZOOM = 12.2;

type View2 = { x: number; y: number; zoom: number };

type Props = {
  width: number;
  height: number;
  active: boolean;
  selected: LatLng;
  /** when the key changes the map opens on this point, zooming in from ENTER_FROM */
  enter: { point: LatLng; key: number };
  /** when the key changes the map flies to the point if it is out of view */
  focus: { point: LatLng; key: number };
  onPick?: (point: LatLng) => void;
  onExit?: (center: LatLng) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const wrap = (x: number) => x - Math.floor(x);
const worldPx = (zoom: number) => TILE * 2 ** zoom;
const roadWidth = (base: number, zoom: number) => Math.max(0.8, base * 2 ** ((zoom - 16) * 0.8));

export function StreetMap({ width, height, active, selected, enter, focus, onPick, onExit }: Props) {
  const start = toWorld(enter.point.lng, enter.point.lat);
  const view = useRef<View2>({ ...start, zoom: ENTER_TO });
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
    animate({ ...p, zoom: ENTER_TO }, 1100, { ...p, zoom: ENTER_FROM });
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
    animate({ ...p, zoom: Math.max(view.current.zoom, 14) }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.key]);

  // ── gestures ──
  type Mode = 'none' | 'pan' | 'pinch';
  const g = useRef({ mode: 'none' as Mode, base: view.current, dx0: 0, dy0: 0, d0: 0, wp: { x: 0, y: 0 }, t: 0, moved: false });
  const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches ?? [];

  const latest = useRef({ width, height, onPick, onExit });
  latest.current = { width, height, onPick, onExit };

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
          if (!g.current.moved && Date.now() - g.current.t < 400) {
            const p = screenToWorld(e.nativeEvent.locationX, e.nativeEvent.locationY);
            latest.current.onPick?.(fromWorld(wrap(p.x), p.y));
            return;
          }
          if (view.current.zoom < EXIT_ZOOM) return exit();
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
            if (zoom < MIN_ZOOM) {
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

  type Placed = { key: string; tile: TileData; ox: number; oy: number; s: number };
  const below: Placed[] = []; // coarser tiles standing in while the right ones load
  const tiles: Placed[] = [];
  const seen = new Set<string>();
  if (enter.key) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ox = width / 2 + (tx - cxT) * ts;
        const oy = height / 2 + (ty - cyT) * ts;
        const t = getTile(tz, ((tx % n) + n) % n, ty);
        if (t) {
          tiles.push({ key: `${tz}/${tx}/${ty}`, tile: t, ox, oy, s: ts / t.extent });
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

  const drawTile = ({ key, tile, ox, oy, s }: Placed) => (
    <G key={key} transform={`translate(${ox} ${oy}) scale(${s})`}>
      {!!tile.water && <Path d={tile.water} fill={colors.field} />}
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

  return (
    <View style={[styles.root, { width, height }]} {...responder.panHandlers} {...(webWheel as object)}>
      <Svg width={width} height={height} pointerEvents="none">
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
        {!!enter.key && (
          <G>
            <Ellipse cx={pin.x} cy={pin.y + 15} rx={8} ry={3} fill="#000" opacity={0.3} />
            <Circle cx={pin.x} cy={pin.y} r={13} fill={colors.red} />
            <Circle cx={pin.x} cy={pin.y} r={5.5} fill={colors.white} />
          </G>
        )}
      </Svg>
      <T style={styles.attribution} pointerEvents="none">
        {ATTRIBUTION}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, overflow: 'hidden' },
  attribution: { position: 'absolute', right: 8, bottom: 18, fontSize: 9, color: colors.muted },
});
