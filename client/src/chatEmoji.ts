import data from 'emojibase-data/es/data.json';
import messages from 'emojibase-data/es/messages.json';

// Emojibase/CLDR Unicode 17 data is bundled locally, including real ZWJ/skin sequences.
export const skinTones = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
export const toneNames = [
  'Predeterminado',
  'Claro',
  'Medio claro',
  'Medio',
  'Medio oscuro',
  'Oscuro',
];
const normalize = (value: string) => value.replaceAll('\uFE0F', '');
const lookup = new Map(
  data
    .flatMap((item) => [item, ...(item.skins || [])])
    .map((item) => [normalize(item.emoji), item]),
);
export const emojiCount = data.reduce((count, item) => count + 1 + (item.skins?.length || 0), 0);
export const emojiGroups = messages.groups.map((group) => ({
  name: group.message[0]!.toLocaleUpperCase('es') + group.message.slice(1),
  items: data
    .filter((item) => (item.group ?? 2) === group.order)
    .map(
      (item) =>
        [
          item.emoji,
          item.label,
          !!item.skins?.length,
          [item.label, ...(item.tags || [])].join(' '),
        ] as const,
    ),
}));
export const emojiVariants = data.flatMap((item) =>
  (item.skins || []).map(
    (skin) =>
      [skin.emoji, skin.label, false, [skin.label, ...(item.tags || [])].join(' ')] as const,
  ),
);
export function emojiWithTone(emoji: string, supported: boolean, tone: number) {
  if (!supported || tone === 0) return emoji;
  const item = lookup.get(normalize(emoji));
  return (
    item?.skins?.find((skin) =>
      Array.isArray(skin.tone) ? skin.tone.every((t) => t === tone) : skin.tone === tone,
    )?.emoji || emoji
  );
}
export function emojiSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}
export function emojiDescription(value: string) {
  return lookup.get(normalize(value))?.label || value;
}
export function isKnownEmoji(value: string) {
  return lookup.has(normalize(value));
}
