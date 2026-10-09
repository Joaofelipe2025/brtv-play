/**
 * Controle parental: categorias bloqueadas exigem o PIN uma vez por sessão.
 * `unlocked` são as categorias já liberadas com o PIN nesta sessão.
 */

export function isGroupLocked(group: string, blocked: readonly string[], unlocked: readonly string[]): boolean {
  return blocked.includes(group) && !unlocked.includes(group);
}

/** Só os itens cujas categorias estão livres (ou já liberadas). Sem bloqueios, devolve a própria lista. */
export function unlockedItems<T extends { group: string }>(
  items: T[],
  blocked: readonly string[],
  unlocked: readonly string[],
): T[] {
  if (blocked.length === 0) return items;
  return items.filter((item) => !isGroupLocked(item.group, blocked, unlocked));
}

/** Primeira categoria que pode ser mostrada sem pedir o PIN, ou null. */
export function firstUnlockedGroup(
  groups: readonly string[],
  blocked: readonly string[],
  unlocked: readonly string[],
): string | null {
  return groups.find((g) => !isGroupLocked(g, blocked, unlocked)) ?? null;
}
