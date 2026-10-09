import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { colors, formatHour } from '@brtv/core';
import { FocusCard, Logo, Text, font } from '../ui';
import { FAVORITES, useApp, type Route } from '../navigation';

export type Tab = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'settings';

const TABS: { key: Tab; label: string; route: Route }[] = [
  { key: 'home', label: 'Início', route: { name: 'home' } },
  { key: 'live', label: 'TV ao vivo', route: { name: 'live' } },
  { key: 'movies', label: 'Filmes', route: { name: 'movies' } },
  { key: 'series', label: 'Séries', route: { name: 'series' } },
  { key: 'favorites', label: 'Favoritos', route: { name: 'live', category: FAVORITES } },
];

const compact = { paddingVertical: 10, paddingHorizontal: 20 } as const;

export function Clock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>{formatHour(now)}</Text>;
}

function TabLabel({ label, active }: { label: string; active: boolean }) {
  return (
    <>
      <Text style={{ color: active ? colors.accent : colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>{label}</Text>
      <View
        pointerEvents="none"
        style={{ height: 4, marginTop: 4, borderRadius: 2, backgroundColor: active ? colors.accent : 'transparent' }}
      />
    </>
  );
}

/**
 * Barra superior com abas. A partir da Início, abrir uma aba empilha a tela
 * (Voltar retorna à Início); entre abas, a tela é trocada para não acumular histórico.
 */
export function TopBar({ active }: { active?: Tab }) {
  const { go, replace, reset } = useApp();
  const open = (route: Route) => {
    if (route.name === 'home') reset(route);
    else if (active === 'home') go(route);
    else replace(route);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 24 }}>
      <Logo height={56} />
      <View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {TABS.map((t) => (
          <FocusCard key={t.key} style={compact} onPress={() => active !== t.key && open(t.route)}>
            <TabLabel label={t.label} active={active === t.key} />
          </FocusCard>
        ))}
      </View>
      <FocusCard style={compact} onPress={() => active !== 'settings' && open({ name: 'settings' })}>
        <TabLabel label="Configurações" active={active === 'settings'} />
      </FocusCard>
      <Clock />
    </View>
  );
}
