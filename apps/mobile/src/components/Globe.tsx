/**
 * HS 1: planet Earth in black space, orbited by the Moon and Mars.
 * Drag to rotate, pinch (or mouse wheel on web) to zoom, tap anywhere to pick
 * a location, tap the selected pin to zoom into it.
 *
 * Drawn with d3-geo's orthographic projection into react-native-svg so it
 * runs in Expo Go and on the web without native 3D.
 */
import { geoDistance, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { feature, mesh } from 'topojson-client';
import countries110 from 'world-atlas/countries-110m.json';
import type { LatLng } from '@get/shared';
import { colors } from '../theme';
import { bodyLongitudes } from './sky';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = countries110 as any;
const LAND = feature(topo, topo.objects.land) as unknown as GeoPermissibleObjects;
const BORDERS = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as GeoPermissibleObjects;

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 12;

type Props = {
  width: number;
  height: number;
  selected: LatLng;
  /** when this object changes the globe flies to it */
  focus?: { point: LatLng; zoom?: number; key: number };
  onPick?: (point: LatLng) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Globe({ width, height, selected, focus, onPick }: Props) {
  // rotation is [-lng, -lat] of the point facing the viewer
  const view = useRef({ lambda: -selected.lng, phi: -clamp(selected.lat, -60, 60), zoom: 1 });
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => (f + 1) % 1_000_000);
  const anim = useRef<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  // the Moon and Mars move in real time; once a minute is plenty
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

  const flyTo = (p: LatLng, zoom?: number) => {
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
    };
    anim.current = requestAnimationFrame(step);
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
  const bordersD = path(BORDERS) ?? '';

  const center: [number, number] = [-lambda, -phi];
  const pinVisible = geoDistance([selected.lng, selected.lat], center) < Math.PI / 2 - 0.02;
  const pin = pinVisible ? projection([selected.lng, selected.lat]) : null;

  // ── gestures ──
  const gesture = useRef({ lambda: 0, phi: 0, zoom: 1, pinch: 0, t: 0, moved: false });
  const pinchDistance = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return 0;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };

  const latest = useRef({ projection, pin, onPick, cx, cy, r });
  latest.current = { projection, pin, onPick, cx, cy, r };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          stopAnim();
          gesture.current = { ...view.current, pinch: pinchDistance(e), t: Date.now(), moved: false };
        },
        onPanResponderMove: (e, g) => {
          const d = pinchDistance(e);
          if (d > 0) {
            if (!gesture.current.pinch) gesture.current.pinch = d;
            view.current.zoom = clamp((gesture.current.zoom * d) / gesture.current.pinch, MIN_ZOOM, MAX_ZOOM);
            gesture.current.moved = true;
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
    const { projection: proj, pin: p, onPick: pick, cx: X, cy: Y, r: R } = latest.current;
    if (p && Math.hypot(p[0] - x, p[1] - y) < 26) {
      // "Location is zoomed into upon touch"
      const ll = proj.invert?.([p[0], p[1]]);
      if (ll) flyTo({ lng: ll[0], lat: ll[1] }, clamp(view.current.zoom * 2.5, 2.5, MAX_ZOOM));
      return;
    }
    if (Math.hypot(x - X, y - Y) > R) return; // tapped space
    const ll = proj.invert?.([x, y]);
    if (ll && pick) pick({ lng: ll[0], lat: ll[1] });
  }

  const webWheel =
    Platform.OS === 'web'
      ? {
          onWheel: (e: { deltaY: number; preventDefault?: () => void }) => {
            stopAnim();
            view.current.zoom = clamp(view.current.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
            redraw();
          },
        }
      : {};

  // ── Moon and Mars ──
  const sky = bodyLongitudes(now);
  // orbits are tilted ellipses around the globe; bodies on the far side pass behind it
  const TILT = (-26 * Math.PI) / 180;
  const orbit = (lng: number, rx: number, flat: number, rad: number) => {
    const a = ((lng - center[0]) * Math.PI) / 180; // 0 = straight towards the viewer
    const x = Math.sin(a) * rx;
    const y = Math.cos(a) * rx * flat;
    return {
      x: clamp(cx + x * Math.cos(TILT) - y * Math.sin(TILT), rad + 4, width - rad - 4),
      y: clamp(cy + x * Math.sin(TILT) + y * Math.cos(TILT), rad + 4, height - rad - 4),
      front: Math.cos(a) > 0,
    };
  };
  const moonR = Math.max(10, r * 0.18);
  const marsR = Math.max(6, r * 0.065);
  const moon = orbit(sky.moon, r * 1.32, 0.3, moonR);
  const mars = orbit(sky.mars, Math.max(r * 1.4, width / 2 - marsR - 8), 0.9, marsR);

  const body = (o: { x: number; y: number }, rad: number, fill: string, key: string) => (
    <Circle key={key} cx={o.x} cy={o.y} r={rad} fill={fill} />
  );

  return (
    <View style={[styles.root, { width, height }]} {...responder.panHandlers} {...(webWheel as object)}>
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <RadialGradient id="shade" cx="42%" cy="38%" r="62%">
            <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </RadialGradient>
          <RadialGradient id="moonShade" cx="40%" cy="35%" r="70%">
            <Stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.25" />
          </RadialGradient>
        </Defs>

        {!mars.front && body(mars, marsR * 0.85, colors.mars, 'mars')}
        {!moon.front && body(moon, moonR * 0.85, colors.moon, 'moon')}

        <Circle cx={cx} cy={cy} r={r} fill={colors.ocean} />
        <Path d={landD} fill={colors.land} />
        <Path d={bordersD} fill="none" stroke={colors.landStroke} strokeWidth={0.6} />
        <Circle cx={cx} cy={cy} r={r} fill="url(#shade)" />

        {pin && (
          <G>
            <Ellipse cx={pin[0]} cy={pin[1] + 13} rx={7} ry={2.5} fill="#000" opacity={0.35} />
            <Circle cx={pin[0]} cy={pin[1]} r={11} fill={colors.red} />
            <Circle cx={pin[0]} cy={pin[1]} r={4.6} fill={colors.white} />
          </G>
        )}

        {moon.front && (
          <G>
            {body(moon, moonR, colors.moon, 'moon')}
            <Circle cx={moon.x} cy={moon.y} r={moonR} fill="url(#moonShade)" />
          </G>
        )}
        {mars.front && body(mars, marsR, colors.mars, 'mars')}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
});
