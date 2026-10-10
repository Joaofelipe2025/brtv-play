import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useStore } from 'zustand';
import { ACTIVATION_URL, colors, daysLeft } from '@brtv/core';
import { Body, FocusCard, Logo, Text, Title, font, styles } from '../ui';
import { Clock } from '../components/TopBar';
import { useApp } from '../navigation';
import { availablePlaylists } from '../playlists';
import { store } from '../platform';
import { backend } from '../backend';

const POLL_MS = 10_000;

export function Activation() {
  const { session, update, reset } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { device, status } = session;
  // As listas do aparelho carregam do armazenamento depois da primeira tela: quando chegam, verifica de novo.
  const userPlaylists = useStore(store, (s) => s.userPlaylists);

  const check = useCallback(async () => {
    if (!device) return;
    setChecking(true);
    try {
      const s = await backend.getDeviceStatus(device.mac, device.key);
      update({ status: s });
      setError(null);
      // Servidor + listas cadastradas neste aparelho (lidas agora, não de uma verificação anterior)
      const available = availablePlaylists(s, store.getState().userPlaylists);
      const [first] = available;
      if (available.length === 1 && first) {
        update({ playlist: first });
        reset({ name: 'home' });
      } else if (available.length > 1) {
        reset({ name: 'playlists' });
      }
    } catch {
      setError('Sem conexão com o servidor. Nova tentativa em 10 segundos.');
    } finally {
      setChecking(false);
    }
  }, [device, update, reset]);

  // Polling a cada 10s até existir playlist
  useEffect(() => {
    if (!device) return;
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(id);
  }, [device, check, userPlaylists]);

  const expired = status?.status === 'expired';
  const statusText = !status
    ? 'Verificando…'
    : status.status === 'trial'
      ? `Teste grátis: ${daysLeft(status.expiresAt)} dias restantes`
      : status.status === 'active'
        ? 'Ativo'
        : 'Teste expirado';

  const code = { color: colors.textPrimary, fontSize: 48, fontFamily: font.bold } as const;

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo height={72} />
        <Clock />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'row', gap: 64, alignItems: 'center', paddingVertical: 24 }}
      >
        <View style={{ flex: 1 }}>
          <Title>Ative este aparelho</Title>
          <Body>
            1. No celular ou computador, abra <Text style={styles.brand}>{ACTIVATION_URL.replace('https://', '')}</Text>
          </Body>
          <Body>2. Digite o MAC e a chave que aparecem abaixo</Body>
          <Body>3. Cadastre sua lista. Esta tela atualiza sozinha.</Body>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 24 }}>
            <View style={[styles.card, { flex: 1.4 }]}>
              <Body muted>MAC</Body>
              <Text style={code}>{device?.mac ?? '—'}</Text>
            </View>
            <View style={[styles.card, { flex: 1 }]}>
              <Body muted>Chave</Body>
              <Text style={code}>{device?.key ?? '—'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center', marginTop: 24 }}>
            <Text style={{ color: expired ? colors.danger : colors.accent, fontSize: 28, fontFamily: font.semibold }}>
              {statusText}
            </Text>
            <FocusCard autoFocus onPress={() => !checking && void check()}>
              <Body>{checking ? 'Verificando…' : 'Verificar agora'}</Body>
            </FocusCard>
          </View>
          {error && <Text style={{ color: colors.danger, fontSize: 24, marginTop: 16 }}>{error}</Text>}
        </View>
        <View style={{ alignItems: 'center', gap: 16, width: 360 }}>
          {device && (
            <View style={{ backgroundColor: colors.white, padding: 16, borderRadius: 12 }}>
              <QRCode value={`${ACTIVATION_URL}?mac=${encodeURIComponent(device.mac)}`} size={300} />
            </View>
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 24, textAlign: 'center' }}>
            Aponte a câmera do celular para abrir o portal com o MAC já preenchido
          </Text>
        </View>
      </ScrollView>
      <Text style={{ color: colors.textSecondary, fontSize: 24, textAlign: 'center' }}>
        O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que adiciona.
      </Text>
    </View>
  );
}
