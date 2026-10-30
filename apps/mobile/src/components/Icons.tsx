import type { ReactNode } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { SavedLocation } from '@get/shared';

type IconProps = { size?: number; color?: string };

/** the pin with a see-through hole of radius `hole`, so whatever is behind it shows in the middle */
const pinD = (hole: number) =>
  `M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zM12 ${9 - hole}a${hole} ${hole} 0 1 0 0 ${2 * hole}a${hole} ${hole} 0 1 0 0-${2 * hole}z`;
const PIN_D = pinD(2.6);
// the side bar draws the pin at 18px; this hole is the same size on screen as Other's at 15px in the Location strip
const SIDEBAR_PIN_D = pinD(2.15);

export function PinIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={SIDEBAR_PIN_D} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * The shapes of each location's icon in a 24x24 box (Here is the ring, the
 * rest are Home, Work, School and Other), so the strip, the forms and the pin
 * on the globe and street map all draw the same thing.
 */
export function placeShapes(icon: SavedLocation['icon'], color: string): ReactNode {
  switch (icon) {
    case 'here':
      return <Circle cx={12} cy={12} r={8.5} fill={color} />;
    case 'home':
      return <Path d="M12 2.5L1.5 12H5v9.5h5V15h4v6.5h5V12h3.5z" fill={color} />;
    case 'work':
      return (
        <G>
          <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={color} strokeWidth={2.2} fill="none" />
          <Rect x={2} y={7} width={20} height={13} rx={2.5} fill={color} />
        </G>
      );
    case 'school':
      return (
        <G>
          <Path d="M12 3.5L23 9l-11 5.5L1 9z" fill={color} />
          <Path d="M5.5 11.8V16c0 1.9 2.9 3.5 6.5 3.5s6.5-1.6 6.5-3.5v-4.2L12 15.1z" fill={color} />
          <Path d="M20.8 9.6v6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </G>
      );
    default:
      return <Path d={PIN_D} fill={color} fillRule="evenodd" />;
  }
}

export function PlaceIcon({ icon, size = 18, color = '#000' }: IconProps & { icon: SavedLocation['icon'] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {placeShapes(icon, color)}
    </Svg>
  );
}

export function CartIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2 3h3l2.6 11.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6.2" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M5.9 7H21l-1.8 7.2H7.6z" fill={color} />
      <Circle cx={9.5} cy={19.5} r={1.7} fill={color} />
      <Circle cx={17.5} cy={19.5} r={1.7} fill={color} />
    </Svg>
  );
}

export function PersonIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={7} r={4.5} fill={color} />
      <Path d="M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5z" fill={color} />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10} cy={10} r={6.5} stroke={color} strokeWidth={2.4} fill="none" />
      <Path d="M15 15l6 6" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 4v16M4 12h16" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 5l14 14M19 5L5 19" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 4l-8 8 8 8" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 4l8 8-8 8" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function StarIcon({ size = 14, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" fill={color} />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 12.5l5 5L20 6.5" stroke={color} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The assistant button next to the search bar (a small robot face, as sketched). */
export function RobotIcon({ size = 22, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={2.5} r={1.4} fill={color} />
      <Rect x={4} y={6} width={16} height={13} rx={4} fill={color} />
      <Rect x={1.5} y={10.5} width={2.5} height={5} rx={1} fill={color} />
      <Rect x={20} y={10.5} width={2.5} height={5} rx={1} fill={color} />
      <Circle cx={9} cy={12} r={1.8} fill="#fff" />
      <Circle cx={15} cy={12} r={1.8} fill="#fff" />
      <Rect x={9} y={15.5} width={6} height={1.4} rx={0.7} fill="#fff" />
    </Svg>
  );
}
