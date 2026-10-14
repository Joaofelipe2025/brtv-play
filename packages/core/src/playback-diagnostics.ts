import { DEMO_STREAMS } from './demo';

export const PLAYBACK_TEST_URL = DEMO_STREAMS.bigBuckBunny;
export const PLAYBACK_TEST_ID = 'brtv-playback-test';
export const VOD_STALL_TIMEOUT_MS = 45_000;

export interface PlaybackFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Classifica o evento nativo sem exibir URLs, credenciais ou stack traces. */
export function describePlaybackFailure(event: unknown): PlaybackFailure {
  const record = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null ? v as Record<string, unknown> : {};
  const error = record(record(event).error);
  const rawCode = typeof error.errorCode === 'string' || typeof error.errorCode === 'number' ? String(error.errorCode) : '';
  // react-native-video prefixa os códigos Media3 com "2" (2004 -> 22004).
  const numeric = /^2\d{4}$/.test(rawCode) ? Number(rawCode.slice(1)) : /^\d{4}$/.test(rawCode) ? Number(rawCode) : 0;
  const text = [error.errorString, error.errorException, error.errorStackTrace]
    .filter((v): v is string => typeof v === 'string').map((s) => s.slice(0, 16_000)).join('\n');
  const http = /(?:Response code|HTTP(?:\/\d(?:\.\d)?)?(?: status(?: code)?)?)\s*[:=]?\s*([45]\d{2})\b/i.exec(text)?.[1];
  const failure = (code: string, message: string, retryable = false): PlaybackFailure => ({ code, message, retryable });
  if (http) {
    if (http === '401' || http === '403') return failure(`HTTP ${http}`, 'A fonte recusou o acesso ao vídeo. Confira a validade da lista e a liberação de acesso com o responsável pela fonte.');
    if (http === '404' || http === '410') return failure(`HTTP ${http}`, 'O vídeo não foi encontrado na fonte. Atualize a lista ou escolha outro título.');
    if (http === '429') return failure('HTTP 429', 'A fonte limitou as solicitações. Aguarde alguns minutos antes de tentar novamente.');
    return failure(`HTTP ${http}`, 'O servidor do vídeo respondeu com erro. Tente novamente mais tarde.', Number(http) >= 500 || http === '408');
  }
  if (numeric === 2007 || /CLEARTEXT|Cleartext.*not permitted/i.test(text)) return failure('HTTP BLOQUEADO', 'Este APK não permite a conexão HTTP da fonte. É necessário instalar um APK com a configuração de rede atualizada.');
  if (/UnknownHostException|Unable to resolve host/i.test(text)) return failure('DNS', 'Não foi possível localizar o servidor do vídeo. Confira a rede ou tente outra fonte.', true);
  if (/SSLHandshakeException|SSLPeerUnverifiedException|CertPathValidatorException/i.test(text)) return failure('TLS', 'Não foi possível validar a conexão segura da fonte. Confira a data do aparelho; o responsável pela fonte pode precisar corrigir o certificado.');
  if (numeric >= 4001 && numeric <= 4005) return failure(`FORMATO ${numeric}`, 'O player não conseguiu decodificar este vídeo. Teste uma versão de menor resolução ou outro formato.');
  if (numeric >= 6000 && numeric <= 6008 || /ERROR_CODE_DRM_/i.test(text)) return failure('DRM', 'Este vídeo exige uma licença de reprodução compatível fornecida pelo serviço de origem.');
  if (numeric === 2003 || numeric >= 3001 && numeric <= 3004) return failure(`CONTEÚDO ${numeric}`, 'A fonte não entregou um arquivo de vídeo compatível. O endereço pode apontar para uma página de erro ou outro formato.');
  if (numeric === 2004) return failure('RESPOSTA HTTP', 'O servidor recusou a solicitação do vídeo. Confira a lista com o responsável pela fonte.', true);
  if (numeric === 2002 || /SocketTimeoutException/i.test(text)) return failure('TEMPO ESGOTADO', 'O servidor demorou demais para responder. Confira a conexão ou tente outro título.', true);
  if (numeric === 2001 || /ConnectException|NoRouteToHostException/i.test(text)) return failure('CONEXÃO', 'Não foi possível conectar ao servidor do vídeo. Confira a rede ou tente outra fonte.', true);
  return failure(numeric ? `PLAYER ${numeric}` : 'REPRODUÇÃO', 'O player não conseguiu abrir este vídeo. Teste o vídeo de demonstração e informe o código exibido.', true);
}

export function stalledPlaybackFailure(isLive: boolean): PlaybackFailure {
  return {
    code: 'SEM AVANÇO',
    message: `O vídeo ficou sem avanço por ${isLive ? 12 : 45} segundos. Isso pode ocorrer por demora da fonte, rede ou falha de reprodução.`,
    retryable: true,
  };
}
