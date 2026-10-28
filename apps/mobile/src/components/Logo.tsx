import Svg, { Rect } from 'react-native-svg';

/**
 * The blocky GET mark from Sketches/Cover.png, redrawn on a 100×100 grid:
 * a full-width top bar, two thin verticals, and the four blocks of G and E.
 */
export function Logo({ size = 96, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={25} fill={color} />
      <Rect x={0} y={25} width={0.9} height={75} fill={color} />
      <Rect x={33} y={25} width={0.9} height={75} fill={color} />
      <Rect x={83} y={25} width={0.9} height={75} fill={color} />
      <Rect x={21.1} y={62} width={0.9} height={14} fill={color} />
      <Rect x={11} y={38} width={11} height={25} fill={color} />
      <Rect x={33} y={38} width={22} height={25} fill={color} />
      <Rect x={0} y={75} width={22} height={25} fill={color} />
      <Rect x={33} y={75} width={22} height={25} fill={color} />
    </Svg>
  );
}
