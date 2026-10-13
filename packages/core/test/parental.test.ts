import { describe, expect, it } from 'vitest';
import { firstUnlockedGroup, isGroupLocked, unlockedItems } from '../src/parental';

const items = [
  { id: '1', group: 'Notícias' },
  { id: '2', group: 'Adultos' },
  { id: '3', group: 'Esportes' },
  { id: '4', group: 'Adultos' },
];

describe('isGroupLocked', () => {
  it('não bloqueia grupo fora da lista de bloqueados', () => {
    expect(isGroupLocked('Notícias', ['Adultos'], [])).toBe(false);
  });

  it('bloqueia grupo bloqueado e ainda não liberado', () => {
    expect(isGroupLocked('Adultos', ['Adultos'], [])).toBe(true);
  });

  it('libera grupo bloqueado que já recebeu o PIN nesta sessão', () => {
    expect(isGroupLocked('Adultos', ['Adultos'], ['Adultos'])).toBe(false);
  });
});

describe('unlockedItems', () => {
  it('remove itens de grupos bloqueados', () => {
    expect(unlockedItems(items, ['Adultos'], []).map((i) => i.id)).toEqual(['1', '3']);
  });

  it('mantém itens de grupos liberados com PIN', () => {
    expect(unlockedItems(items, ['Adultos'], ['Adultos']).map((i) => i.id)).toEqual(['1', '2', '3', '4']);
  });

  it('sem bloqueios devolve a mesma lista', () => {
    expect(unlockedItems(items, [], [])).toBe(items);
  });
});

describe('firstUnlockedGroup', () => {
  it('pula grupos bloqueados', () => {
    expect(firstUnlockedGroup(['Adultos', 'Notícias'], ['Adultos'], [])).toBe('Notícias');
  });

  it('aceita grupo bloqueado já liberado', () => {
    expect(firstUnlockedGroup(['Adultos', 'Notícias'], ['Adultos'], ['Adultos'])).toBe('Adultos');
  });

  it('devolve null quando todos estão bloqueados ou a lista está vazia', () => {
    expect(firstUnlockedGroup(['Adultos'], ['Adultos'], [])).toBeNull();
    expect(firstUnlockedGroup([], [], [])).toBeNull();
  });
});
