// Line icons (2px stroke, 24 grid), drawn for this kit. Decorative next to a
// visible label, so hidden from screen readers.
import Svg, { Circle, Path } from 'react-native-svg';
import type { IconName } from '../site.config.ts';

type Extra = IconName | 'refresh' | 'mail' | 'wifiOff';

const PATHS: Record<Extra, string> = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  cart: 'M3 4h2.5l2.2 11h10.6L20.5 7H6.4M9.5 20h.01M17 20h.01',
  user: 'M4.5 20c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4',
  info: 'M12 11v6M12 7.5h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  search: 'M20 20l-4.5-4.5',
  share: 'M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12v8h14v-8',
  tag: 'M3.5 12.5V4h8.5l8.5 8.5-8 8zM8 8.5h.01',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z',
  refresh: 'M20 12a8 8 0 11-2.4-5.7M20 4v5h-5',
  mail: 'M3.5 6h17v12h-17zM4 6.5l8 6 8-6',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 015.2-2.7M19 12.5a10 10 0 00-2.4-1.7M2 9a14.5 14.5 0 014.3-2.6M22 9a14.5 14.5 0 00-9.6-3.9M12 20h.01',
};

const CIRCLES: Partial<Record<Extra, [number, number, number]>> = {
  user: [12, 8, 4],
  info: [12, 12, 9],
  search: [11, 11, 6.5],
  pin: [12, 10, 2.5],
};

export function Icon({ name, size = 24, color }: { name: Extra; size?: number; color: string }) {
  const c = CIRCLES[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {c ? <Circle cx={c[0]} cy={c[1]} r={c[2]} stroke={color} strokeWidth={2} fill="none" /> : null}
      <Path d={PATHS[name]} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
