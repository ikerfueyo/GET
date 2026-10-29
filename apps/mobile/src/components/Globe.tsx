/**
 * HS 1: planet Earth in black space, with the stars, the Moon, Venus and Mars
 * where they really are, at their true sizes and distances.
 * Drag to rotate, pinch (or mouse wheel on web) to zoom, tap the selected pin
 * to zoom into it. Taps elsewhere do nothing: the selected location only
 * changes from the Location Interface. Zooming in past the
 * globe's closest view (or tapping the pin) dives into the street map, HS 2.
 *
 * Drawn with d3-geo's orthographic projection into react-native-svg so it
 * runs in Expo Go and on the web without native 3D. The sky around it is seen
 * from a perspective camera floating above the point at the centre, far
 * enough out that the Earth's silhouette matches the drawn globe.
 */
import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { feature, mesh } from 'topojson-client';
import countries110 from 'world-atlas/countries-110m.json';
import type { LatLng } from '@get/shared';
import { colors } from '../theme';
import { MOON_RADIUS, dotRadius, skyAt, starsAt, type Vec } from './sky';
import surfaces from './surfaces.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = countries110 as any;
const LAND = feature(topo, topo.objects.land) as unknown as GeoPermissibleObjects;
// Surfaces painted over the green land (surfaces.json). Ice: Natural Earth
// 1:50m glaciated areas, simplified and clipped to the 110m coastline, plus
// every 110m landmass that is mostly ice or lies south of 60°S, painted whole,
// so Antarctica, Greenland, Svalbard and Franz Josef Land are white and the
// ice fields of the Canadian Arctic, Alaska, Patagonia and the Himalaya show.
// Desert: Natural Earth 1:50m desert regions (Sahara, Arabia, Gobi, Australia's
// deserts, Atacama, Kalahari...), clipped the same way.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const surf = surfaces as any;
const ICE = feature(surf, surf.objects.ice) as unknown as GeoPermissibleObjects;
const DESERT = feature(surf, surf.objects.desert) as unknown as GeoPermissibleObjects;
const BORDERS = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as GeoPermissibleObjects;

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 12;

type Props = {
  width: number;
  height: number;
  selected: LatLng;
  /** when this object changes the globe flies to it */
  focus?: { point: LatLng; zoom?: number; key: number };
  /**
   * zoomed in past MAX_ZOOM: time for the flat map. `scale` is the globe's
   * radius in px, so the map can open at the same scale; `byPin` is set when
   * the pin was tapped, which goes all the way down to the streets.
   */
  onDive?: (center: LatLng, scale: number, byPin: boolean) => void;
};

const rad = (d: number) => (d * Math.PI) / 180;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** unit vector of a latitude/longitude in the Earth-fixed frame */
const unit = (lat: number, lng: number): Vec => [
  Math.cos(rad(lat)) * Math.cos(rad(lng)),
  Math.cos(rad(lat)) * Math.sin(rad(lng)),
  Math.sin(rad(lat)),
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Globe({ width, height, selected, focus, onDive }: Props) {
  // rotation is [-lng, -lat] of the point facing the viewer
  const view = useRef({ lambda: -selected.lng, phi: -clamp(selected.lat, -60, 60), zoom: 1 });
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => (f + 1) % 1_000_000);
  const anim = useRef<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  // the sky turns and the Moon and planets move in real time; once a minute is plenty
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.37;

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  const flyTo = (p: LatLng, zoom?: number, then?: () => void) => {
    stopAnim();
    const from = { ...view.current };
    // take the short way around
    let toLambda = -p.lng;
    while (toLambda - from.lambda > 180) toLambda -= 360;
    while (toLambda - from.lambda < -180) toLambda += 360;
    const to = { lambda: toLambda, phi: -clamp(p.lat, -80, 80), zoom: zoom ?? from.zoom };
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / 900);
      const e = easeInOut(t);
      view.current = {
        lambda: from.lambda + (to.lambda - from.lambda) * e,
        phi: from.phi + (to.phi - from.phi) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      };
      redraw();
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
      if (t >= 1) then?.();
    };
    anim.current = requestAnimationFrame(step);
  };

  const dive = (byPin = false) => {
    const { lambda: l, phi: p, zoom: z } = view.current;
    latest.current.onDive?.({ lng: -l, lat: -p }, baseR * z, byPin);
  };

  useEffect(() => {
    if (focus) flyTo(focus.point, focus.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  useEffect(() => stopAnim, []);

  const { lambda, phi, zoom } = view.current;
  const r = baseR * zoom;
  const projection = useMemo(
    () => geoOrthographic().scale(r).translate([cx, cy]).rotate([lambda, phi]).clipAngle(90).precision(0.6),
    [r, cx, cy, lambda, phi],
  );
  const path = geoPath(projection);
  const landD = path(LAND) ?? '';
  const iceD = path(ICE) ?? '';
  const desertD = path(DESERT) ?? '';
  const bordersD = path(BORDERS) ?? '';

  const center: [number, number] = [-lambda, -phi];
  const pinVisible = geoDistance([selected.lng, selected.lat], center) < Math.PI / 2 - 0.02;
  const pin = pinVisible ? projection([selected.lng, selected.lat]) : null;

  // ── gestures ──
  const gesture = useRef({ lambda: 0, phi: 0, zoom: 1, pinch: 0, t: 0, moved: false, dived: false });
  const pinchDistance = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return 0;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };

  const latest = useRef({ projection, pin, onDive });
  latest.current = { projection, pin, onDive };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          stopAnim();
          gesture.current = { ...view.current, pinch: pinchDistance(e), t: Date.now(), moved: false, dived: false };
        },
        onPanResponderMove: (e, g) => {
          const d = pinchDistance(e);
          if (d > 0) {
            if (!gesture.current.pinch) gesture.current.pinch = d;
            const want = (gesture.current.zoom * d) / gesture.current.pinch;
            view.current.zoom = clamp(want, MIN_ZOOM, MAX_ZOOM);
            gesture.current.moved = true;
            if (want > MAX_ZOOM * 1.1 && !gesture.current.dived) {
              gesture.current.dived = true;
              dive();
            }
          } else {
            if (Math.abs(g.dx) + Math.abs(g.dy) > 6) gesture.current.moved = true;
            // degrees per pixel shrink as you zoom in, like Apple Maps
            const k = 180 / (Math.PI * baseR * view.current.zoom);
            view.current.lambda = gesture.current.lambda + g.dx * k;
            view.current.phi = clamp(gesture.current.phi - g.dy * k, -85, 85);
          }
          redraw();
        },
        onPanResponderRelease: (e, g) => {
          if (gesture.current.dived) return;
          if (!gesture.current.moved && Date.now() - gesture.current.t < 400) {
            handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
            return;
          }
          // a little inertia after a flick
          let vx = g.vx * 16;
          let vy = g.vy * 16;
          const coast = () => {
            vx *= 0.92;
            vy *= 0.92;
            if (Math.abs(vx) + Math.abs(vy) < 0.3) return (anim.current = null);
            const k = 180 / (Math.PI * baseR * view.current.zoom);
            view.current.lambda += vx * k;
            view.current.phi = clamp(view.current.phi - vy * k, -85, 85);
            redraw();
            anim.current = requestAnimationFrame(coast);
          };
          anim.current = requestAnimationFrame(coast);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseR],
  );

  function handleTap(x: number, y: number) {
    const { projection: proj, pin: p } = latest.current;
    if (p && Math.hypot(p[0] - x, p[1] - y) < 26) {
      // "Location is zoomed into upon touch"
      const ll = proj.invert?.([p[0], p[1]]);
      if (ll) flyTo({ lng: ll[0], lat: ll[1] }, MAX_ZOOM, () => dive(true));
    }
  }

  const wheelIn = useRef(0);
  const webWheel =
    Platform.OS === 'web'
      ? {
          onWheel: (e: { deltaY: number; preventDefault?: () => void }) => {
            stopAnim();
            // keep scrolling in past the closest view to dive into the streets
            if (view.current.zoom >= MAX_ZOOM && e.deltaY < 0) {
              wheelIn.current -= e.deltaY;
              if (wheelIn.current > 240) {
                wheelIn.current = 0;
                return dive();
              }
            } else wheelIn.current = 0;
            view.current.zoom = clamp(view.current.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
            redraw();
          },
        }
      : {};

  // ── the sky, through a perspective camera above the centre point ──
  // focal length: about 70° of view across the screen's long side
  const focal = Math.max(width, height) / 2 / Math.tan(rad(35));
  // camera distance (Earth radii) at which the Earth's silhouette is r px
  const camDist = Math.sqrt(1 + (focal / r) ** 2);
  const sky = useMemo(() => skyAt(now), [now]);
  const stars = useMemo(() => starsAt(sky.gmst), [sky]);
  const P = unit(center[1], center[0]);
  const F: Vec = [-P[0], -P[1], -P[2]]; // looking down at the Earth
  const U = normalize([-F[2] * F[0], -F[2] * F[1], 1 - F[2] * F[2]]); // north, square to the view
  const R = cross(F, U);
  const cam: Vec = [P[0] * camDist, P[1] * camDist, P[2] * camDist];
  /** screen position of a direction (or, with `point`, a position in Earth radii) */
  const toScreen = (v: Vec, point = false) => {
    const w: Vec = point ? [v[0] - cam[0], v[1] - cam[1], v[2] - cam[2]] : v;
    const z = dot(w, F);
    if (z <= 0) return null;
    const x = cx + (focal * dot(w, R)) / z;
    const y = cy - (focal * dot(w, U)) / z;
    return x < -8 || x > width + 8 || y < -8 || y > height + 8 ? null : { x, y, dist: Math.hypot(...w) };
  };

  // stars drawn as a handful of paths, one per size, rather than thousands of circles
  const starPaths = new Map<number, string[]>();
  for (const st of stars) {
    const p = toScreen(st.v);
    if (!p) continue;
    const size = Math.round(dotRadius(st.mag) * 5) / 5;
    const d = `M${(p.x - size).toFixed(1)},${p.y.toFixed(1)}a${size},${size} 0 1,0 ${2 * size},0a${size},${size} 0 1,0 ${-2 * size},0`;
    if (!starPaths.has(size)) starPaths.set(size, []);
    starPaths.get(size)!.push(d);
  }

  // the Moon: true size, lit from the Sun's side
  const moonP = toScreen(sky.moon, true);
  let moonEl = null;
  if (moonP) {
    const mr = Math.max(0.8, (focal * MOON_RADIUS) / moonP.dist);
    const toSun = normalize([sky.sun[0] - sky.moon[0], sky.sun[1] - sky.moon[1], sky.sun[2] - sky.moon[2]]);
    const toCam = normalize([cam[0] - sky.moon[0], cam[1] - sky.moon[1], cam[2] - sky.moon[2]]);
    const k = dot(toSun, toCam); // cos of the phase angle: 1 full, -1 new
    const step = moonP.dist * 0.01;
    const lit = toScreen([sky.moon[0] + toSun[0] * step, sky.moon[1] + toSun[1] * step, sky.moon[2] + toSun[2] * step], true);
    const angle = lit ? Math.atan2(lit.y - moonP.y, lit.x - moonP.x) * (180 / Math.PI) : 0;
    const litD = `M0,${-mr}A${mr},${mr} 0 0,1 0,${mr}A${Math.abs(k) * mr},${mr} 0 0,${k > 0 ? 1 : 0} 0,${-mr}Z`;
    moonEl = (
      <G transform={`translate(${moonP.x},${moonP.y}) rotate(${angle})`}>
        <Circle r={mr} fill={colors.moonDark} />
        <Path d={litD} fill={colors.moon} />
      </G>
    );
  }

  // Venus and Mars are far too small to show a disc: points of light, sized by brightness
  const planet = (pl: { pos: Vec; mag: number }, fill: string, key: string) => {
    const p = toScreen(pl.pos, true);
    return p ? <Circle key={key} cx={p.x} cy={p.y} r={dotRadius(pl.mag)} fill={fill} /> : null;
  };

  return (
    <View style={[styles.root, { width, height }]} {...responder.panHandlers} {...(webWheel as object)}>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <RadialGradient id="shade" cx="42%" cy="38%" r="62%">
            <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </RadialGradient>
          {/* a thin glow of atmosphere around the limb */}
          <RadialGradient id="air" cx="50%" cy="50%" r="50%">
            <Stop offset={1 / 1.035 - 0.01} stopColor={colors.air} stopOpacity="0.55" />
            <Stop offset="1" stopColor={colors.air} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {[...starPaths].map(([size, ds]) => (
          <Path key={size} d={ds.join('')} fill={colors.white} opacity={Math.min(1, 0.35 + size * 0.5)} />
        ))}
        {planet(sky.venus, colors.venus, 'venus')}
        {planet(sky.mars, colors.mars, 'mars')}
        {moonEl}

        <Circle cx={cx} cy={cy} r={r * 1.035} fill="url(#air)" />
        <Circle cx={cx} cy={cy} r={r} fill={colors.ocean} />
        <Path d={landD} fill={colors.land} />
        <Path d={desertD} fill={colors.desert} />
        <Path d={iceD} fill={colors.ice} />
        <Path d={bordersD} fill="none" stroke={colors.landStroke} strokeWidth={0.6} />
        <Circle cx={cx} cy={cy} r={r} fill="url(#shade)" />

        {pin && (
          <G>
            <Ellipse cx={pin[0]} cy={pin[1] + 13} rx={7} ry={2.5} fill="#000" opacity={0.35} />
            <Circle cx={pin[0]} cy={pin[1]} r={11} fill={colors.red} />
            <Circle cx={pin[0]} cy={pin[1]} r={4.6} fill={colors.white} />
          </G>
        )}

      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
});
