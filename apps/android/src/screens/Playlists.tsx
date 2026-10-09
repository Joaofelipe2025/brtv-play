import { ScrollView, View } from 'react-native';
import { Body, FocusCard, Logo, Title, styles } from '../ui';
import { Clock } from '../components/TopBar';
import { useApp } from '../navigation';

/** Antes de escolher a lista não há abas: ainda não existe conteúdo para navegar. */
export function Playlists() {
  const { session, update, reset } = useApp();
  const list = session.status?.playlists ?? [];

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Logo height={56} />
        <Clock />
      </View>
      <Title>Qual lista você quer abrir?</Title>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 24 }}>
        {list.map((p, i) => (
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
          </FocusCard>
        ))}
      </ScrollView>
    </View>
  );
}
