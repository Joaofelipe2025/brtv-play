import { View } from 'react-native';
import { Body, FocusCard, Title, styles } from '../ui';
import { TopBar, type Tab } from '../components/TopBar';

/** Tela provisória: as Tasks 3 e 4 a substituem. Mantém um item focável para o D-pad não se perder. */
export function Placeholder({ title, active }: { title: string; active?: Tab }) {
  return (
    <View style={styles.screen}>
      <TopBar active={active} />
      <Title>{title}</Title>
      <FocusCard autoFocus style={{ alignSelf: 'flex-start' }}>
        <Body>Em construção</Body>
      </FocusCard>
    </View>
  );
}
