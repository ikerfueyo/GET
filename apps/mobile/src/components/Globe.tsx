/**
 * HS 1: planet Earth in black space, with the stars where they really are and
 * the Moon and Mars on their real bearings and phases.
 * Drag to rotate, pinch (or mouse wheel on web) to zoom, tap the selected pin
 * to zoom into it. Taps elsewhere do nothing: the selected location only
 * changes from the Location Interface. Zooming in past the
 * globe's closest view (or tapping the pin) dives into the street map, HS 2.
 *
 * Drawn on the GPU with Skia (bundled in Expo Go): the map is baked into
 * equirectangular distance fields (scripts/bake-earth.ts) and a small shader
 * wraps them around the sphere and shades the real night side, so turning the globe only
 * changes a few numbers per frame. The stars are seen through a perspective
 * camera floating above the point at the centre.
 */
import {
  Canvas,
  Circle,
  FilterMode,
  Fill,
  Group,
  ImageShader,
  MipmapMode,
  Oval,
  Path,
  RadialGradient,
  Shader,
  Skia,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { geoDistance, geoOrthographic } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import type { LatLng } from '@get/shared';
import { colors } from '../theme';
import { MOON_RADIUS, dotRadius, skyAt, starsAt, type Vec } from './sky';

// The map, baked as distance fields (scripts/bake-earth.ts, bake-sdf.py): each
// texel holds how far it is from the nearest coast, desert edge, ice edge
// (earth-sdf, one per channel) and country border (earth-borders). The shader
// cuts the edges where the distance is zero, so they stay sharp at any zoom on
// any screen. Ice (Natural Earth 1:50m glaciated areas, plus every landmass
// that is mostly ice or south of 60°S) and deserts come from surfaces.json, the
// land and borders from world-atlas 110m.
const SDF_IMAGE = require('../../assets/earth-sdf.png');
const BORDERS_IMAGE = require('../../assets/earth-borders.png');
const MAP_W = 4096;
const MAP_H = 2048;

// Wraps the map around the sphere seen from straight above `P` (north up,
// east right), darkens the side away from the Sun in two bands like twilight,
// and softens the rim to one pixel. `px` is a screen pixel in points.
const EARTH = Skia.RuntimeEffect.Make(`
uniform shader sdf;
uniform shader borders;
uniform float2 center;
uniform float radius;
uniform float px;
uniform float lineWidth;
uniform float3 P;
uniform float3 R;
uniform float3 U;
uniform float3 sun;
uniform float3 ocean;
uniform float3 land;
uniform float3 desert;
uniform float3 ice;
uniform float3 border;
uniform float3 night;

const float TEXELS_PER_RAD = ${MAP_W / (2 * Math.PI)};

// share of a pixel fp texels wide covered by the inside of an edge d texels away
float cover(float d, float fp) { return clamp(d / fp + 0.5, 0.0, 1.0); }

half4 main(float2 xy) {
  float2 q = (xy - center) / radius;
  float d2 = dot(q, q);
  if (d2 >= 1.0) return half4(0);
  float z = sqrt(1.0 - d2);
  float3 n = q.x * R - q.y * U + z * P;
  float lat = asin(clamp(n.z, -1.0, 1.0));
  float lng = atan(n.y, n.x);
  float2 uv = float2((lng / 6.2831853 + 0.5) * ${MAP_W}.0, (0.5 - lat / 3.1415927) * ${MAP_H}.0);

  // one screen pixel in texels, wider towards the rim and the poles
  float perPoint = TEXELS_PER_RAD / radius;
  float fp = perPoint * px / max(z, 0.12) / sqrt(max(cos(lat), 0.12));

  half3 a = sdf.eval(uv).rgb;
  float3 dist = (float3(a) * 255.0 - 128.0) / 16.0;
  float3 c = ocean;
  c = mix(c, land, cover(dist.r, fp));
  c = mix(c, desert, cover(dist.g, fp));
  c = mix(c, ice, cover(dist.b, fp));

  // borders lineWidth points wide: the part of this pixel that overlaps the line
  // (texels are stretched east-west towards the poles, so widen by about that)
  float bd = float(borders.eval(uv).r) * 255.0 / 64.0;
  float h = 0.5 * lineWidth * perPoint / sqrt(max(cos(lat), 0.12));
  float line = clamp(min(h, bd + fp * 0.5) - max(-h, bd - fp * 0.5), 0.0, fp) / fp;
  c = mix(c, border, line * cover(dist.r, fp));

  float s = dot(n, sun);
  if (s < 0.0) c = mix(c, night, 0.2);
  if (s < -0.1564) c = mix(c, night, 0.2); // 9° past the terminator
  float edge = clamp((1.0 - sqrt(d2)) * radius / px, 0.0, 1.0);
  return half4(half3(c), 1.0) * half(edge);
}`)!;

const PIN_BOX = 24;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

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
  // touches can arrive faster than the screen refreshes: draw at most once per frame
  const frameReq = useRef<number | null>(null);
  const redraw = () => {
    if (frameReq.current !== null) return;
    frameReq.current = requestAnimationFrame(() => {
      frameReq.current = null;
      setFrame((f) => (f + 1) % 1_000_000);
    });
  };
  useEffect(
    () => () => {
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
  // only used for the pin and for taps: single points, cheap
  const projection = useMemo(
    () => geoOrthographic().scale(r).translate([cx, cy]).rotate([lambda, phi]).clipAngle(90),
    [r, cx, cy, lambda, phi],
  );

  const center: [number, number] = [-lambda, -phi];

  const sky = useMemo(() => skyAt(now), [now]);
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
        <Group opacity={near}>
          {MARIA.map(([mx, my, rx, ry], i) => (
            <Oval
              key={i}
              x={(mx - rx) * b.rad}
              y={(-my - ry) * b.rad}
              width={2 * rx * b.rad}
              height={2 * ry * b.rad}
              color={colors.moonMaria}
            />
          ))}
        </Group>
      );
    } else if (b.key === 'mars') {
      // the polar cap that leans towards the viewer
      const pole = dot(sky.marsPole, P) >= 0 ? sky.marsPole : (sky.marsPole.map((v) => -v) as Vec);
      surface = (
        <Circle cx={0.66 * b.rad * dot(pole, R)} cy={-0.66 * b.rad * dot(pole, U)} r={0.32 * b.rad} color={colors.ice} />
      );
    }
    return (
      <Group key={b.key} transform={[{ translateX: b.x }, { translateY: b.y }]}>
        <Circle cx={0} cy={0} r={b.rad} color={b.fill} />
        {surface}
        <Group transform={[{ rotate: rad(b.sunAngle + 180) }]}>
          <Path path={litPath(b.rad, -b.k)} color={colors.night} opacity={0.94} />
        </Group>
      </Group>
    );
  };

  const sdf = useImage(SDF_IMAGE);
  const borderMap = useImage(BORDERS_IMAGE);
  const sunDir = normalize(sky.sun);
  const mapRect = { x: 0, y: 0, width: MAP_W, height: MAP_H };
  const sampling = { filter: FilterMode.Linear, mipmap: MipmapMode.None };

  return (
    <View style={[styles.root, { width, height }]} {...responder.panHandlers} {...(webWheel as object)}>
      <Canvas style={{ width, height }} pointerEvents="none">
        {[...starPaths].map(([size, ds]) => (
          <Path key={size} path={ds.join('')} color={colors.white} opacity={Math.min(1, 0.35 + size * 0.5)} />
        ))}
        {bodies.filter((b) => !b.front && !b.eclipsed).map(drawBody)}

        {/* a thin glow of atmosphere around the limb */}
        <Circle cx={cx} cy={cy} r={r * 1.035}>
          <RadialGradient
            c={vec(cx, cy)}
            r={r * 1.035}
            colors={[colors.air + '8C', colors.air + '00']}
            positions={[1 / 1.035 - 0.01, 1]}
          />
        </Circle>
        {sdf && borderMap ? (
          <Fill>
            <Shader
              source={EARTH}
              uniforms={{
                center: [cx, cy],
                radius: r,
                px: 1 / PixelRatio.get(),
                // a hairline from afar, a little bolder up close
                lineWidth: 0.6 * Math.min(zoom, MAX_ZOOM) ** 0.25,
                P,
                R,
                U,
                sun: sunDir,
                ocean: hex(colors.ocean),
                land: hex(colors.land),
                desert: hex(colors.desert),
                ice: hex(colors.ice),
                border: hex(colors.landStroke),
                night: hex(colors.night),
              }}
            >
              <ImageShader image={sdf} tx="repeat" ty="clamp" fit="fill" rect={mapRect} sampling={sampling} />
              <ImageShader image={borderMap} tx="repeat" ty="clamp" fit="fill" rect={mapRect} sampling={sampling} />
            </Shader>
          </Fill>
        ) : (
          <Circle cx={cx} cy={cy} r={r} color={colors.ocean} />
        )}
        {/* the limb darkens, lit from the upper left */}
        <Circle cx={cx} cy={cy} r={r}>
          <RadialGradient
            c={vec(cx - 0.16 * r, cy - 0.24 * r)}
            r={1.24 * r}
            colors={['#00000000', '#00000073']}
            positions={[0.55, 1]}
          />
        </Circle>

        {pin && <Oval x={pin[0] - 7} y={pin[1] + 13 - 2.5} width={14} height={5} color="#000" opacity={0.35} />}

        {bodies.filter((b) => b.front).map(drawBody)}
      </Canvas>
      {/* the pin is a small SVG over the canvas, so it can share its icon drawings with the rest of the app */}
      {pin && (
        <Svg
          width={PIN_BOX}
          height={PIN_BOX}
          style={[styles.pin, { left: pin[0] - PIN_BOX / 2, top: pin[1] - PIN_BOX / 2 }]}
          pointerEvents="none"
        >
          <SvgCircle cx={PIN_BOX / 2} cy={PIN_BOX / 2} r={11} fill={colors.red} />
          <SvgCircle cx={PIN_BOX / 2} cy={PIN_BOX / 2} r={4.6} fill={colors.white} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
  pin: { position: 'absolute' },
});
