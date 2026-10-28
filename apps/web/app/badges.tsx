import { MODE_LETTER, MODES, type Mode } from '@get/shared';

export function Badges({ available, chosen }: { available: Mode[]; chosen?: Mode }) {
  return (
    <span className="badges">
      {MODES.map((m) => (
        <span key={m} className={m === chosen ? 'on' : available.includes(m) ? '' : 'off'}>
          {MODE_LETTER[m]}
        </span>
      ))}
    </span>
  );
}
