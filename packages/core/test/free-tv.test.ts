import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockBackendService, type BackendService } from '../src/api';
import { MemoryAdapter } from '../src/storage';
import {
  FREE_TV_CACHE_KEY, FREE_TV_TIMEOUT_MS, FREE_TV_URL,
  FreeTvBackendService, freeTvPlaybackIssue, parseFreeTvChannels,
  type PlaylistFetch,
} from '../src/free-tv';

const content = '#EXTM3U\n#EXTINF:-1 tvg-id="tv.br" group-title="Brazil",TV Brasil\nhttps://example.com/live.m3u8\n';
const response = (body = content, ok = true) => ({ ok, headers: { get: () => null }, text: async () => body });

afterEach(() => vi.useRealTimers());

describe('Free-TV', () => {
  it('carrega a fonte oficial, preserva trial e salva cache', async () => {
    const storage = new MemoryAdapter();
    const fetcher = vi.fn(async () => response());
    const backend = new FreeTvBackendService(new MockBackendService(() => 0), storage, fetcher);
    const result = await backend.getDeviceStatus('mac', 'key');
    expect(result.status).toBe('trial');
    expect(result.playlists[0]).toMatchObject({ id: 'free-tv', kind: 'm3u', content });
    expect(fetcher).toHaveBeenCalledWith(FREE_TV_URL, { signal: expect.any(AbortSignal) });
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(content);
  });

  it('atualiza no reload, mas compartilha downloads simultâneos', async () => {
    const fetcher = vi.fn(async () => response());
    const backend = new FreeTvBackendService(new MockBackendService(), new MemoryAdapter(), fetcher);
    await Promise.all([backend.getDeviceStatus('mac', 'key'), backend.getDeviceStatus('mac', 'key')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await backend.getDeviceStatus('mac', 'key');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('usa cache persistido em falha de rede e informa o usuário', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, content);
    const backend = new FreeTvBackendService(new MockBackendService(), storage, async () => { throw new Error('offline'); });
    expect((await backend.getDeviceStatus('mac', 'key')).playlists[0]).toMatchObject({ content });
    expect(backend.notice).toContain('último catálogo salvo');
  });

  it.each(['<html>erro</html>', '#EXTM3U\n', 'x'.repeat(5_000_001)])('rejeita resposta inválida sem sobrescrever cache válido (%#)', async (invalid) => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, content);
    const backend = new FreeTvBackendService(new MockBackendService(), storage, async () => response(invalid));
    expect((await backend.getDeviceStatus('mac', 'key')).playlists[0]).toMatchObject({ content });
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(content);
  });

  it('mostra falha quando HTTP falha e não existe cache válido', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, 'corrompido');
    const backend = new FreeTvBackendService(new MockBackendService(), storage, async () => response('', false));
    await expect(backend.getDeviceStatus('mac', 'key')).rejects.toThrow('Verifique a internet');
  });

  it('interrompe requisição lenta após 15 segundos', async () => {
    vi.useFakeTimers();
    const fetcher: PlaylistFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const backend = new FreeTvBackendService(new MockBackendService(), new MemoryAdapter(), fetcher);
    const assertion = expect(backend.getDeviceStatus('mac', 'key')).rejects.toThrow('Verifique a internet');
    await vi.advanceTimersByTimeAsync(FREE_TV_TIMEOUT_MS);
    await assertion;
  });

  it('não substitui listas reais nem libera aparelhos expirados', async () => {
    const fetcher = vi.fn(async () => response());
    for (const status of [
      { status: 'expired' as const, expiresAt: '', playlists: [] },
      { status: 'active' as const, expiresAt: '', playlists: [{ id: 'personal', kind: 'm3u' as const, name: 'Pessoal', content }] },
    ]) {
      const delegate: BackendService = { getDeviceStatus: async () => status };
      expect(await new FreeTvBackendService(delegate, new MemoryAdapter(), fetcher).getDeviceStatus('mac', 'key')).toEqual(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falha de armazenamento não impede catálogo baixado', async () => {
    const storage = new MemoryAdapter();
    vi.spyOn(storage, 'set').mockRejectedValue(new Error('full'));
    const backend = new FreeTvBackendService(new MockBackendService(), storage, async () => response());
    expect((await backend.getDeviceStatus('mac', 'key')).playlists[0]?.id).toBe('free-tv');
  });

  it('preserva EPG e gera IDs únicos e estáveis quando a ordem muda', () => {
    const a = content.slice(content.indexOf('#EXTINF'));
    const b = a.replace('live.m3u8', 'other.m3u8');
    const first = parseFreeTvChannels('#EXTM3U\n' + a + b + a);
    const reordered = parseFreeTvChannels('#EXTM3U\n' + b + a);
    expect(new Set(first.map((c) => c.id)).size).toBe(3);
    expect(first[0]?.tvgId).toBe('tv.br');
    expect(first[0]?.id).toBe(reordered[1]?.id);
    expect(first[1]?.id).toBe(reordered[0]?.id);
  });

  it('distingue páginas externas de streams e domínios parecidos', () => {
    expect(freeTvPlaybackIssue('https://www.youtube.com/watch?v=test')).toContain('página');
    expect(freeTvPlaybackIssue('https://twitch.tv/channel')).toContain('página');
    expect(freeTvPlaybackIssue('https://example.com/live.m3u8')).toBeNull();
    expect(freeTvPlaybackIssue('https://youtube.com.example.org/live.m3u8')).toBeNull();
  });
});
