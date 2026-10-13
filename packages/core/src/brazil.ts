/**
 * Canais brasileiros: o grupo cita Brasil/Brazil, ou o id do guia (EPG) termina em `.br`
 * (convenção das listas públicas, ex.: `globo.br`).
 */

const BRAZIL_GROUP = /bras|brazil/i;
const BRAZIL_EPG = /\.br$/i;

export function isBrazilChannel(channel: { group?: string | undefined; epgId?: string | undefined }): boolean {
  const { group, epgId } = channel;
  if (group !== undefined && BRAZIL_GROUP.test(group)) return true;
  return epgId !== undefined && BRAZIL_EPG.test(epgId);
}
