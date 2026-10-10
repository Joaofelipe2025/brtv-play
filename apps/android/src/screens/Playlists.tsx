import { ScrollView, View } from 'react-native';
import { FREE_TV_PLAYLIST_ID } from '@brtv/core';
import { Body, FocusCard, Logo, Title, styles } from '../ui';
import { Clock } from '../components/TopBar';
import { useApp } from '../navigation';
import { FREE_TV_LABEL, useAvailablePlaylists } from '../playlists';

/** Antes de escolher a lista não há abas: ainda não existe conteúdo para navegar. */
export function Playlists() {
  const { update, reset } = useApp();
  const { available, user } = useAvailablePlaylists();

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Logo height={56} />
        <Clock />
      </View>
      <Title>Qual lista você quer abrir?</Title>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 24 }}>
        {available.map((p, i) => (
          <FocusCard
            key={p.id}
            autoFocus={i === 0}
            style={{ width: 420, minHeight: 200, justifyContent: 'flex-end' }}
            onPress={() => {
              update({ playlist: p });
              reset({ name: 'home' });
            }}
          >
            <Title>{p.name}</Title>
            <Body muted>{p.kind === 'xtream' ? 'Conta Xtream Codes' : 'Lista M3U'}</Body>
            {user.some((u) => u.id === p.id) && <Body muted>Adicionada neste aparelho</Body>}
            {p.id === FREE_TV_PLAYLIST_ID && <Body muted>{FREE_TV_LABEL}</Body>}
          </FocusCard>
        ))}
      </ScrollView>
    </View>
  );
}
