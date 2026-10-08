/**
 * Parser XMLTV com leitura incremental. Aceita um AsyncIterable de chunks de texto,
 * então listas grandes não precisam caber em memória de uma vez.
 */

export interface EpgProgramme {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  description?: string;
}

export type EpgIndex = Map<string, EpgProgramme[]>;

const XMLTV_DATE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?$/;

/** Converte data XMLTV ("20260108120000 +0000") em epoch ms. */
export function parseXmltvDate(value: string): number | null {
  const match = XMLTV_DATE.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? '0'),
  );
  const offsetMinutes =
    sign && oh !== undefined && om !== undefined
      ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om))
      : 0;
  return utc - offsetMinutes * 60_000;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return match?.[1] !== undefined ? decodeEntities(match[1]) : undefined;
}

function tagText(block: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return match?.[1] !== undefined ? decodeEntities(match[1].trim()) : undefined;
}

/** Converte um bloco <programme>...</programme> em EpgProgramme, ou null se inválido. */
export function parseProgrammeBlock(block: string): EpgProgramme | null {
  const open = /<programme\b[^>]*>/.exec(block);
  if (!open) return null;
  const channelId = attr(open[0], 'channel');
  const start = attr(open[0], 'start');
  const stop = attr(open[0], 'stop');
  if (!channelId || !start || !stop) return null;

  const startMs = parseXmltvDate(start);
  const stopMs = parseXmltvDate(stop);
  if (startMs === null || stopMs === null || stopMs <= startMs) return null;

  const title = tagText(block, 'title') ?? '';
  const description = tagText(block, 'desc');
  return {
    channelId,
    start: startMs,
    stop: stopMs,
    title,
    ...(description !== undefined ? { description } : {}),
  };
}

/**
 * Lê o XMLTV em chunks e indexa a programação por channel id (tvg-id).
 * Cada lista é ordenada por horário de início.
 */
export async function parseXmltvStream(chunks: AsyncIterable<string>): Promise<EpgIndex> {
  const index: EpgIndex = new Map();
  let buffer = '';

  const consumeBlocks = (): void => {
    for (;;) {
      const startIdx = buffer.indexOf('<programme');
      if (startIdx === -1) {
        // Mantém só o final que pode ser início de uma tag
        buffer = buffer.slice(-20);
        return;
      }
      const endTag = '</programme>';
      const endIdx = buffer.indexOf(endTag, startIdx);
      if (endIdx === -1) {
        buffer = buffer.slice(startIdx);
        return;
      }
      const block = buffer.slice(startIdx, endIdx + endTag.length);
      buffer = buffer.slice(endIdx + endTag.length);
      const programme = parseProgrammeBlock(block);
      if (programme) {
        const list = index.get(programme.channelId) ?? [];
        list.push(programme);
        index.set(programme.channelId, list);
      }
    }
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    consumeBlocks();
  }

  for (const list of index.values()) {
    list.sort((a, b) => a.start - b.start);
  }
  return index;
}

/** Retorna programa atual e próximo para um canal no instante `now` (epoch ms). */
export function currentAndNext(
  index: EpgIndex,
  channelId: string,
  now: number,
): { current: EpgProgramme | null; next: EpgProgramme | null } {
  const list = index.get(channelId) ?? [];
  const current = list.find((p) => p.start <= now && now < p.stop) ?? null;
  const next = list.find((p) => p.start > now) ?? null;
  return { current, next };
}
