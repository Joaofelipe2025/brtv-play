import { describe, expect, it } from 'vitest';
import { isBrazilChannel } from '../src/brazil';

describe('isBrazilChannel', () => {
  it('reconhece o grupo Brazil/Brasil em qualquer caixa ou posição', () => {
    expect(isBrazilChannel({ group: 'Brazil' })).toBe(true);
    expect(isBrazilChannel({ group: 'Brasil' })).toBe(true);
    expect(isBrazilChannel({ group: 'Canais Brasil' })).toBe(true);
    expect(isBrazilChannel({ group: 'BRASIL | Abertos' })).toBe(true);
  });

  it('não confunde outros países', () => {
    expect(isBrazilChannel({ group: 'USA' })).toBe(false);
    expect(isBrazilChannel({ group: 'Portugal' })).toBe(false);
  });

  it('reconhece o epgId que termina em .br', () => {
    expect(isBrazilChannel({ group: 'Abertos', epgId: 'globo.br' })).toBe(true);
    expect(isBrazilChannel({ epgId: 'Globo.BR' })).toBe(true);
  });

  it('ignora epgId de outros países ou com .br no meio', () => {
    expect(isBrazilChannel({ group: 'Notícias', epgId: 'cnn.us' })).toBe(false);
    expect(isBrazilChannel({ epgId: 'brasil.pt' })).toBe(false);
    expect(isBrazilChannel({ epgId: 'sbt.br.pt' })).toBe(false);
  });

  it('sem grupo nem epgId (ou vazios) não é brasileiro', () => {
    expect(isBrazilChannel({})).toBe(false);
    expect(isBrazilChannel({ group: undefined, epgId: undefined })).toBe(false);
    expect(isBrazilChannel({ group: '', epgId: '' })).toBe(false);
  });
});
