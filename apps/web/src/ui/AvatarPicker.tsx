import { AVATAR_COUNT } from '@pixels/shared';
import { AvatarPreview } from './AvatarPreview.js';

export function AvatarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="avatars">
      <legend>Avatar</legend>
      {Array.from({ length: AVATAR_COUNT }, (_, i) => (
        <label key={i} className={`avatar-option${value === i ? ' selected' : ''}`}>
          <input
            type="radio"
            name="avatar"
            value={i}
            checked={value === i}
            onChange={() => onChange(i)}
            aria-label={`Avatar ${i + 1}`}
          />
          <AvatarPreview avatar={i} />
        </label>
      ))}
    </fieldset>
  );
}
