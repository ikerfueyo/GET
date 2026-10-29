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

export function MessageIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.5 3.4 6L4.5 21l4.3-2.4c1 .3 2.1.4 3.2.4 5.5 0 10-3.6 10-8s-4.5-8-10-8z" fill={color} />
    </Svg>
  );
}

export function WhatsAppIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5z" stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M8.6 7.4c.3-.3.8-.3 1 .1l1 2c.1.3 0 .6-.2.8l-.6.6c.6 1.3 1.7 2.4 3 3l.6-.6c.2-.2.5-.3.8-.2l2 1c.4.2.4.7.1 1l-.8.8c-.6.6-1.5.7-2.3.4-2.6-1-4.6-3-5.6-5.6-.3-.8-.2-1.7.4-2.3z" fill={color} />
    </Svg>
  );
}

export function MailIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2.5} y={5} width={19} height={14} rx={2} stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M3.5 6.5l8.5 6.5 8.5-6.5" stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

export function MoreIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2.2} fill={color} />
      <Circle cx={12} cy={12} r={2.2} fill={color} />
      <Circle cx={19} cy={12} r={2.2} fill={color} />
    </Svg>
  );
}

export function CopyIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={8} y={8} width={12} height={13} rx={2} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M16 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h.5" stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export function MapIcon({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6l6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z" stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      <Path d="M9 3.5V18M15 6v14.5" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
