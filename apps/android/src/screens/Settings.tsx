import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useStore } from 'zustand';
import { FREE_TV_PLAYLIST, FREE_TV_PLAYLIST_ID, colors, type Playlist, type StreamFormat } from '@brtv/core';
import { savePreferences, store } from '../platform';
import { useApp } from '../navigation';
import { FREE_TV_LABEL, availablePlaylists, useAvailablePlaylists } from '../playlists';
import { FocusCard, Logo, Text, font, styles } from '../ui';
import { TopBar } from '../components/TopBar';

const FORMATS: { value: StreamFormat; label: string }[] = [
  { value: 'hls', label: 'HLS' },
  { value: 'ts', label: 'MPEG-TS' },
];

const muted = { color: colors.textSecondary, fontSize: 24 } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.semibold }}>{title}</Text>
      {children}
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress(): void }) {
  return (
    <FocusCard selected={active} style={{ paddingVertical: 10, paddingHorizontal: 22 }} onPress={onPress}>
      <Text style={{ color: active ? colors.accent : colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>
        {label}
      </Text>
    </FocusCard>
  );
}

export function Settings() {
  const { session, update, go, reset } = useApp();
  const { available, user } = useAvailablePlaylists();
  const blocked = useStore(store, (s) => s.blockedCategories);
  const hasPin = useStore(store, (s) => s.parentalPin !== null);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listMsg, setListMsg] = useState<string | null>(null);
  // Ao remover uma lista o botão focado some; este contador devolve o foco ao "Adicionar lista" (nunca às abas).
  const [removedCount, setRemovedCount] = useState(0);

  const groups = useMemo(() => {
    const set = new Set<string>();
    const lib = session.library;
    for (const c of lib?.live ?? []) set.add(c.group);
    for (const m of lib?.movies ?? []) set.add(m.group);
    for (const s of lib?.series ?? []) set.add(s.group);
    return Array.from(set);
  }, [session.library]);

  const setFormat = async (streamFormat: StreamFormat) => {
    const prefs = { ...session.prefs, streamFormat };
    update({ prefs });
    await savePreferences(prefs);
  };

  const savePin = () => {
    if (pin.length !== 4) {
      setPinMsg('O PIN precisa ter 4 dígitos.');
      return;
    }
    store.getState().setParentalPin(pin);
    setPinMsg('PIN salvo. Categorias bloqueadas pedirão este PIN.');
    setPin('');
  };

  const removeUserList = (target: Playlist) => {
    store.getState().removeUserPlaylist(target.id);
    if (session.playlist?.id === target.id) {
      // Era a lista aberta: vai para a primeira que sobrar (a biblioteca recarrega sozinha) ou volta à ativação.
      const [next] = availablePlaylists(session.status, user.filter((p) => p.id !== target.id));
      update({ playlist: next ?? null, library: null, epg: new Map() });
      if (!next) {
        reset({ name: 'activation' });
        return;
      }
    }
    setListMsg('Lista removida.');
    setRemovedCount((n) => n + 1);
  };

  const toggleBlock = (group: string) => {
    if (!hasPin) {
      setPinMsg('Defina um PIN antes de bloquear categorias.');
      return;
    }
    store.getState().setCategoryBlocked(group, !blocked.includes(group));
  };

  return (
    <View style={styles.screen}>
      <TopBar active="settings" />
      <View style={{ flex: 1, flexDirection: 'row', gap: 24 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 24, padding: 12 }}>
          <Section title="Este aparelho">
            <View style={{ flexDirection: 'row', gap: 48, marginTop: 8 }}>
              <View>
                <Text style={muted}>MAC</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.semibold }}>
                  {session.device?.mac ?? '—'}
                </Text>
              </View>
              <View>
                <Text style={muted}>Chave</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.semibold }}>
                  {session.device?.key ?? '—'}
                </Text>
              </View>
            </View>
          </Section>

          <Section title="Reprodução">
            <Text style={muted}>Formato pedido às contas Xtream. Troque para MPEG-TS se os canais travarem.</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              {FORMATS.map((f) => (
                <Pill
                  key={f.value}
                  label={f.label}
                  active={session.prefs.streamFormat === f.value}
                  onPress={() => void setFormat(f.value)}
                />
              ))}
            </View>
          </Section>

          <Section title="Lista">
            <Text style={muted}>{session.playlist?.name ?? 'Nenhuma lista carregada'}</Text>
            {session.playlist?.id === FREE_TV_PLAYLIST_ID && <Text style={muted}>{FREE_TV_LABEL}</Text>}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <FocusCard
                autoFocus
                onPress={() => {
                  update({ reloadToken: session.reloadToken + 1 });
                  setNotice('Recarregando a lista…');
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.semibold }}>Recarregar lista</Text>
              </FocusCard>
              <FocusCard
                onPress={() => {
                  store.setState({ history: [], continueWatching: {} });
                  setNotice('Histórico e posições apagados.');
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Limpar histórico</Text>
              </FocusCard>
            </View>
            {notice && <Text style={{ ...muted, marginTop: 8 }}>{notice}</Text>}
          </Section>

          <Section title="Minhas listas">
            <Text style={muted}>Lista atual: {session.playlist?.name ?? 'nenhuma'}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <FocusCard
                key={`add-${removedCount}`}
                autoFocus={removedCount > 0}
                onPress={() => go({ name: 'addPlaylist' })}
              >
                <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.semibold }}>Adicionar lista</Text>
              </FocusCard>
              {available.length > 1 && (
                <FocusCard onPress={() => go({ name: 'playlists' })}>
                  <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Trocar de lista</Text>
                </FocusCard>
              )}
            </View>
            {user.map((p) => (
              <View
                key={p.id}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}
              >
                <View style={{ flexShrink: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>
                    {p.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 24 }}>
                    {p.kind === 'xtream' ? 'Conta Xtream Codes' : 'Lista M3U'}
                  </Text>
                </View>
                <FocusCard onPress={() => removeUserList(p)}>
                  <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Remover</Text>
                </FocusCard>
              </View>
            ))}
            {/* Sempre oferecido, não pode ser removido: só mostra de onde vem */}
            <View style={{ marginTop: 8 }}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>
                {FREE_TV_PLAYLIST.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 24 }}>{FREE_TV_LABEL}</Text>
            </View>
            {listMsg && <Text style={{ ...muted, marginTop: 8 }}>{listMsg}</Text>}
          </Section>

          <FocusCard onPress={() => go({ name: 'about' })}>
            <Text style={{ color: colors.textPrimary, fontSize: 32, fontFamily: font.semibold }}>Sobre e termos</Text>
            <Text style={{ ...muted, marginTop: 6 }}>Versão, aviso de uso e responsabilidade</Text>
          </FocusCard>
        </ScrollView>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 24, padding: 12 }}>
          <Section title="Controle parental">
            <Text style={muted}>
              {hasPin ? 'PIN ativo. Digite um novo para trocar.' : 'Defina um PIN de 4 dígitos para bloquear categorias.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <TextInput
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={colors.textSecondary}
                value={pin}
                onChangeText={(t) => {
                  setPin(t.replace(/\D/g, '').slice(0, 4));
                  setPinMsg(null);
                }}
                accessibilityLabel="Novo PIN"
                style={{
                  width: 180,
                  color: colors.textPrimary,
                  fontSize: 32,
                  fontFamily: font.medium,
                  letterSpacing: 8,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              />
              <FocusCard onPress={savePin}>
                <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.semibold }}>Salvar PIN</Text>
              </FocusCard>
              {hasPin && (
                <FocusCard
                  onPress={() => {
                    store.getState().setParentalPin(null);
                    setPinMsg('PIN removido.');
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Remover</Text>
                </FocusCard>
              )}
            </View>
            {pinMsg && <Text style={{ ...muted, marginTop: 8 }}>{pinMsg}</Text>}
          </Section>

          <Section title="Categorias bloqueadas">
            {groups.length === 0 && <Text style={muted}>Nenhuma categoria carregada.</Text>}
            {groups.map((g) => (
              <FocusCard
                key={g}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}
                onPress={() => toggleBlock(g)}
              >
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 1, color: colors.textPrimary, fontSize: 26, fontFamily: font.medium }}
                >
                  {g}
                </Text>
                <Text style={{ color: blocked.includes(g) ? colors.accent : colors.textSecondary, fontSize: 24 }}>
                  {blocked.includes(g) ? 'Bloqueada' : 'Liberada'}
                </Text>
              </FocusCard>
            ))}
          </Section>
        </ScrollView>
      </View>
    </View>
  );
}

export function About() {
  const { back } = useApp();
  return (
    <View style={styles.screen}>
      <TopBar />
      <View style={{ flex: 1, justifyContent: 'center', maxWidth: 1200, gap: 28 }}>
        <Logo height={140} />
        <Text style={{ color: colors.textSecondary, fontSize: 26 }}>Versão 0.1.0</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 34, fontFamily: font.medium, lineHeight: 46 }}>
          O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que
          adiciona.
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 26 }}>
          O aplicativo reproduz somente as listas e contas cadastradas pelo próprio usuário no portal. Os vídeos de
          demonstração são streams públicos de teste.
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <FocusCard autoFocus onPress={back}>
            <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Voltar</Text>
          </FocusCard>
        </View>
      </View>
    </View>
  );
}
