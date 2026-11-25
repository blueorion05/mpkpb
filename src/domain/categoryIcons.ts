export const CATEGORY_ICONS = [
  'tag', 'food', 'groceries', 'transport', 'home', 'bills', 'health', 'shopping',
  'work', 'gift', 'school', 'savings',
] as const

export type CategoryIcon = typeof CATEGORY_ICONS[number]

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return CATEGORY_ICONS.some((icon) => icon === value)
}
