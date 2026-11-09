import {
  AVATAR_COUNT,
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_COLORS,
  decodeAvatar,
  encodeAvatar,
  type AvatarLook,
  type PaletteColor,
} from '@pixels/shared';
import { hasHair } from '../game/characters.js';
import { AvatarPreview } from './AvatarPreview.js';

/** Personaje y colores. `value` es el número que guarda el perfil (ver encodeAvatar). */
export function AvatarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const look = decodeAvatar(value) ?? { base: 0, shirt: 0, hair: 0, skin: 0 };
  const set = (change: Partial<AvatarLook>) => onChange(encodeAvatar({ ...look, ...change }));

  return (
    <div className="avatar-picker">
      <fieldset className="avatars">
        <legend>Avatar</legend>
        {Array.from({ length: AVATAR_COUNT }, (_, base) => (
          <label key={base} className={`avatar-option${look.base === base ? ' selected' : ''}`}>
            <input
              type="radio"
              name="avatar"
              value={base}
              checked={look.base === base}
              onChange={() => set({ base })}
              aria-label={`Avatar ${base + 1}`}
            />
            {/* Cada personaje se ve con los colores elegidos. */}
            <AvatarPreview avatar={encodeAvatar({ ...look, base })} />
          </label>
        ))}
      </fieldset>
      <Swatches
        legend="Camiseta"
        colors={SHIRT_COLORS}
        value={look.shirt}
        onChange={(shirt) => set({ shirt })}
      />
      {hasHair(look.base) && (
        <Swatches
          legend="Pelo"
          colors={HAIR_COLORS}
          value={look.hair}
          onChange={(hair) => set({ hair })}
        />
      )}
      <Swatches
        legend="Piel"
        colors={SKIN_COLORS}
        value={look.skin}
        onChange={(skin) => set({ skin })}
      />
    </div>
  );
}

/** Fila de colores. El primero (0) deja el color original del dibujo. */
function Swatches({
  legend,
  colors,
  value,
  onChange,
}: {
  legend: string;
  colors: readonly PaletteColor[];
  value: number;
  onChange: (index: number) => void;
}) {
  const options = [{ name: 'Original', main: '' }, ...colors];
  return (
    <fieldset className="swatches">
      <legend>{legend}</legend>
      {options.map((color, i) => (
        <label
          key={color.name}
          className={`swatch${value === i ? ' selected' : ''}${i === 0 ? ' original' : ''}`}
          style={i === 0 ? undefined : { background: color.main }}
          title={color.name}
        >
          <input
            type="radio"
            name={legend}
            checked={value === i}
            onChange={() => onChange(i)}
            aria-label={`${legend}: ${color.name}`}
          />
        </label>
      ))}
    </fieldset>
  );
}
