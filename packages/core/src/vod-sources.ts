import type { CatalogSource } from './paged-catalog';

/** Uma rodada automática visita cada URL uma vez, sem voltar à origem que falhou. */
export function createSourceRound(url: string, alternatives: readonly CatalogSource[] = []) {
  const seen = new Set<string>();
  const sources = (alternatives.length ? alternatives : [{ url, label: 'Padrão' }]).filter((s) => {
    if (!/^https?:\/\/\S+$/i.test(s.url) || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  if (!sources.length) sources.push({ url, label: 'Padrão' });
  let index = 0;
  let generation = 0;
  return {
    sources,
    current: () => ({ index, generation, source: sources[index]! }),
    next(expectedGeneration: number): boolean {
      if (expectedGeneration !== generation || index + 1 >= sources.length) return false;
      index++; generation++;
      return true;
    },
    restart() { index = 0; generation++; },
  };
}
