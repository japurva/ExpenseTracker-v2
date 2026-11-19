export interface CategoryColorOption {
  name: string;
  value: string;
}

export interface CategoryIconOption {
  name: string;
  glyph: string;
  label: string;
}

export const CATEGORY_COLORS: readonly CategoryColorOption[] = [
  { name: 'Orange', value: '#F97316' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Slate', value: '#64748B' },
];

export const CATEGORY_ICONS: readonly CategoryIconOption[] = [
  { name: 'utensils', glyph: '🍽️', label: 'Food' },
  { name: 'coffee', glyph: '☕', label: 'Coffee' },
  { name: 'home', glyph: '🏠', label: 'Home' },
  { name: 'receipt', glyph: '🧾', label: 'Bills' },
  { name: 'shopping-bag', glyph: '🛍️', label: 'Shopping' },
  { name: 'car', glyph: '🚗', label: 'Transport' },
  { name: 'wallet', glyph: '👛', label: 'Wallet' },
  { name: 'heart', glyph: '❤️', label: 'Health' },
  { name: 'book', glyph: '📚', label: 'Education' },
  { name: 'gift', glyph: '🎁', label: 'Gifts' },
  { name: 'plane', glyph: '✈️', label: 'Travel' },
  { name: 'dumbbell', glyph: '🏋️', label: 'Fitness' },
  { name: 'paw', glyph: '🐾', label: 'Pets' },
  { name: 'briefcase', glyph: '💼', label: 'Work' },
];

const GLYPH_BY_NAME = new Map(CATEGORY_ICONS.map((icon) => [icon.name, icon.glyph]));

/** Emoji stand-in for an icon name; null when the name is unknown (render a dot instead). */
export function iconGlyph(name: string | null | undefined): string | null {
  return name ? (GLYPH_BY_NAME.get(name) ?? null) : null;
}
