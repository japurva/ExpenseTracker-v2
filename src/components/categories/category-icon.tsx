import { Text, View } from 'react-native';

import { iconGlyph } from '@/constants/category-options';

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: number;
}

/** Tinted circle with the category glyph; falls back to a colour dot. */
export function CategoryIcon({ icon, color, size = 36 }: CategoryIconProps) {
  const glyph = iconGlyph(icon);
  const tint = color ?? '#64748b';

  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `${tint}22` }}
    >
      {glyph ? (
        <Text style={{ fontSize: Math.round(size * 0.5) }}>{glyph}</Text>
      ) : (
        <View
          className="rounded-full"
          style={{ width: size * 0.28, height: size * 0.28, backgroundColor: tint }}
        />
      )}
    </View>
  );
}
