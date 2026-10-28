/** The blocky GET mark from Sketches/Cover.png (same geometry as the mobile Logo). */
export function Logo({ size = 48, color = '#000' }: { size?: number; color?: string }) {
  const r = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} fill={color} />;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="GET">
      {r(0, 0, 100, 25)}
      {r(0, 25, 0.9, 75)}
      {r(33, 25, 0.9, 75)}
      {r(83, 25, 0.9, 75)}
      {r(21.1, 62, 0.9, 14)}
      {r(11, 38, 11, 25)}
      {r(33, 38, 22, 25)}
      {r(0, 75, 22, 25)}
      {r(33, 75, 22, 25)}
    </svg>
  );
}
