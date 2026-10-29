/**
 * HS 1: planet Earth in black space, with the stars where they really are and
 * the Moon and Mars on their real bearings and phases.
 * Drag to rotate, pinch (or mouse wheel on web) to zoom, tap the selected pin
 * to zoom into it. Taps elsewhere do nothing: the selected location only
 * changes from the Location Interface. Zooming in past the
 * globe's closest view (or tapping the pin) dives into the street map, HS 2.
 *
 * Drawn with d3-geo's orthographic projection into react-native-svg so it
 * runs in Expo Go and on the web without native 3D. The stars are seen through
 * a perspective camera floating above the point at the centre.
 */
import { geoCircle, geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
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
// lighter versions drawn while the globe is moving, so dragging and zooming stay smooth
const LAND_LOW = feature(surf, surf.objects.landLow) as unknown as GeoPermissibleObjects;
const ICE_LOW = feature(surf, surf.objects.iceLow) as unknown as GeoPermissibleObjects;
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
// the Moon's maria as seen from the Earth, north up: [x, y, rx, ry] in Moon radii
const MARIA: [number, number, number, number][] = [
  [-0.55, 0.15, 0.27, 0.45], // Oceanus Procellarum
  [-0.25, 0.48, 0.24, 0.2], // Imbrium
  [0.2, 0.45, 0.14, 0.13], // Serenitatis
  [0.36, 0.14, 0.17, 0.15], // Tranquillitatis
  [0.72, 0.3, 0.09, 0.08], // Crisium
  [0.6, -0.12, 0.11, 0.13], // Fecunditatis
  [-0.18, -0.36, 0.15, 0.12], // Nubium
  [-0.5, -0.42, 0.09, 0.08], // Humorum
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Globe({ width, height, selected, focus, onDive }: Props) {
  // rotation is [-lng, -lat] of the point facing the viewer
  const view = useRef({ lambda: -selected.lng, phi: -clamp(selected.lat, -60, 60), zoom: 1 });
  const [, setFrame] = useState(0);
  const nextFrame = () => setFrame((f) => (f + 1) % 1_000_000);
  // While the view changes, draw at most once per screen frame and in less
  // detail; once it has been still for a moment, draw it in full again.
  const moving = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameReq = useRef<number | null>(null);
  const redraw = () => {
    moving.current = true;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      moving.current = false;
      nextFrame();
    }, 160);
    if (frameReq.current !== null) return;
    frameReq.current = requestAnimationFrame(() => {
      frameReq.current = null;
      nextFrame();
    });
  };
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
      if (frameReq.current !== null) cancelAnimationFrame(frameReq.current);
    },
    [],
  );
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
  const lowDetail = moving.current;
  const path = geoPath(projection).digits(1);
  const landD = path(lowDetail ? LAND_LOW : LAND) ?? '';
  const iceD = path(lowDetail ? ICE_LOW : ICE) ?? '';
  const desertD = path(DESERT) ?? '';
  const bordersD = lowDetail ? '' : (path(BORDERS) ?? '');

  const center: [number, number] = [-lambda, -phi];

  // night: the hemisphere facing away from the real Sun, darkening in six
  // light bands from the terminator inwards, so the edge reads as twilight
  // (two darker bands while moving)
  const sky = useMemo(() => skyAt(now), [now]);
  const sunLen = Math.hypot(...sky.sun);
  const antiSun: [number, number] = [
    (Math.atan2(-sky.sun[1], -sky.sun[0]) * 180) / Math.PI,
    (Math.asin(-sky.sun[2] / sunLen) * 180) / Math.PI,
  ];
  const nightBands = lowDetail ? [90, 81] : [90, 87, 84, 81, 78, 75];
  const nightOpacity = lowDetail ? 0.2 : 0.075;
  const nightDs = useMemo(
    () => nightBands.map((radius) => path(geoCircle().center(antiSun).radius(radius)()) ?? ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, lowDetail, antiSun[0], antiSun[1]],
  );
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

  // ── the stars, through a camera above the centre point ──
  // focal length: about 70° of view across the screen's long side
  const focal = Math.max(width, height) / 2 / Math.tan(rad(35));
  const stars = useMemo(() => starsAt(sky.gmst), [sky]);
  const P = unit(center[1], center[0]);
  const F: Vec = [-P[0], -P[1], -P[2]]; // looking down at the Earth
  const U = normalize([-F[2] * F[0], -F[2] * F[1], 1 - F[2] * F[2]]); // north, square to the view
  const R = cross(F, U);
  /** screen position of a direction in the sky, if it is on screen */
  const toScreen = (v: Vec) => {
    const z = dot(v, F);
    if (z <= 0) return null;
    const x = cx + (focal * dot(v, R)) / z;
    const y = cy - (focal * dot(v, U)) / z;
    return x < -8 || x > width + 8 || y < -8 || y > height + 8 ? null : { x, y };
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

  // ── the Moon and Mars ──
  // Their directions from the Earth and their phases are real, but at true scale
  // they would be specks (the Moon is 30 Earths away), so they are drawn
  // closer and bigger: the Moon at its true size against the Earth, Mars
  // smaller as it is farther. Each sits on its real bearing; when that points
  // away from the viewer it passes behind the globe. Zooming in pushes them
  // out of the picture, so they are gone once the Earth fills the screen.
  const sizeRef = baseR * Math.min(zoom, 1.6); // don't let them balloon when zoomed in
  const bodies = [
    { key: 'moon', pos: sky.moon, dist: 1.5, rad: Math.max(10, sizeRef * MOON_RADIUS), fill: colors.moon },
    { key: 'mars', pos: sky.mars.pos, dist: 2.05, rad: Math.max(3, sizeRef * 0.053), fill: colors.mars },
  ].map((b) => {
    const u = normalize(b.pos);
    const toSun = normalize([sky.sun[0] - b.pos[0], sky.sun[1] - b.pos[1], sky.sun[2] - b.pos[2]]);
    // laid out at the unzoomed scale, kept on screen...
    const r1 = baseR * Math.min(zoom, 1);
    const ox = clamp(cx + b.dist * r1 * dot(u, R), b.rad + 4, width - b.rad - 4) - cx;
    const oy = clamp(cy - b.dist * r1 * dot(u, U), b.rad + 4, height - b.rad - 4) - cy;
    // ...then, past zoom 1, carried outwards with the Earth and beyond the screen's corners
    const grow = Math.max(1, zoom);
    const len = Math.hypot(ox, oy) || 1;
    const push = (grow - 1) * Math.hypot(width, height) * 0.3;
    const ux = len > 1 ? ox / len : 0;
    const uy = len > 1 ? oy / len : -1;
    return {
      ...b,
      u,
      x: cx + ox * grow + ux * push,
      y: cy + oy * grow + uy * push,
      front: dot(u, P) > 0,
      // hidden behind the globe: must not slide out from behind it while zooming
      eclipsed: dot(u, P) <= 0 && len + b.rad < r1,
      k: dot(toSun, P), // cos of the phase angle: 1 full, -1 new
      sunAngle: (Math.atan2(-dot(toSun, U), dot(toSun, R)) * 180) / Math.PI,
    };
  });

  /** the sunlit part of a disc of radius `m` lit from +x; k = cos(phase angle) */
  const litPath = (m: number, k: number) =>
    `M0,${-m}A${m},${m} 0 0,1 0,${m}A${Math.abs(k) * m},${m} 0 0,${k > 0 ? 1 : 0} 0,${-m}Z`;

  const drawBody = (b: (typeof bodies)[number]) => {
    let surface = null;
    if (b.key === 'moon') {
      // the dark maria of the near side, which faces the viewer when the Moon is behind the Earth
      const near = clamp(-dot(b.u, P) * 1.6, 0, 1);
      surface = near > 0 && (
        <G opacity={near}>
          {MARIA.map(([mx, my, rx, ry], i) => (
            <Ellipse key={i} cx={mx * b.rad} cy={-my * b.rad} rx={rx * b.rad} ry={ry * b.rad} fill={colors.moonMaria} />
          ))}
        </G>
      );
    } else if (b.key === 'mars') {
      // the polar cap that leans towards the viewer
      const pole = dot(sky.marsPole, P) >= 0 ? sky.marsPole : (sky.marsPole.map((v) => -v) as Vec);
      surface = (
        <Circle cx={0.66 * b.rad * dot(pole, R)} cy={-0.66 * b.rad * dot(pole, U)} r={0.32 * b.rad} fill={colors.ice} />
      );
    }
    return (
      <G key={b.key} transform={`translate(${b.x},${b.y})`}>
        <Circle r={b.rad} fill={b.fill} />
        {surface}
        <Path d={litPath(b.rad, -b.k)} fill={colors.night} opacity={0.94} transform={`rotate(${b.sunAngle + 180})`} />
      </G>
    );
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
        {bodies.filter((b) => !b.front && !b.eclipsed).map(drawBody)}

        <Circle cx={cx} cy={cy} r={r * 1.035} fill="url(#air)" />
        <Circle cx={cx} cy={cy} r={r} fill={colors.ocean} />
        <Path d={landD} fill={colors.land} />
        <Path d={desertD} fill={colors.desert} />
        <Path d={iceD} fill={colors.ice} />
        {bordersD !== '' && <Path d={bordersD} fill="none" stroke={colors.landStroke} strokeWidth={0.6} />}
        {nightDs.map((d, i) => (
          <Path key={i} d={d} fill={colors.night} opacity={nightOpacity} />
        ))}
        <Circle cx={cx} cy={cy} r={r} fill="url(#shade)" />

        {pin && (
          <G>
            <Ellipse cx={pin[0]} cy={pin[1] + 13} rx={7} ry={2.5} fill="#000" opacity={0.35} />
            <Circle cx={pin[0]} cy={pin[1]} r={11} fill={colors.red} />
            <Circle cx={pin[0]} cy={pin[1]} r={4.6} fill={colors.white} />
          </G>
        )}

        {bodies.filter((b) => b.front).map(drawBody)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
});
