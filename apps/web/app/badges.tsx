import { MODE_LETTER, MODES, type Mode } from '@get/shared';

/** S/P/D strip: dark = offered, light grey = not offered. */
export function Badges({ available }: { available: Mode[] }) {
  return (
    <span className="badges">
      {MODES.map((m) => (
        <span key={m} className={available.includes(m) ? undefined : 'off'}>
          {MODE_LETTER[m]}
        </span>
      ))}
    </span>
  );
}
