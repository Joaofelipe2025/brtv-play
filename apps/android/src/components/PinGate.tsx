import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { colors } from '@brtv/core';
import { store } from '../platform';
import { FocusCard, Text, font } from '../ui';

/** Pede o PIN parental de 4 dígitos para liberar uma categoria bloqueada. */
export function PinGate({ category, onUnlock, onCancel }: { category: string; onUnlock(): void; onCancel(): void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (pin.length !== 4) return;
    if (store.getState().verifyPin(pin)) {
      onUnlock();
    } else {
      setError('PIN incorreto. Tente de novo.');
      setPin('');
    }
  };

  return (
    <View style={{ alignSelf: 'center', width: '100%', maxWidth: 640, marginTop: 40, gap: 20 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 36, fontFamily: font.semibold }}>Categoria bloqueada</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 26 }}>Digite o PIN parental para abrir “{category}”.</Text>
      <TextInput
        autoFocus
        secureTextEntry
        keyboardType="number-pad"
        maxLength={4}
        value={pin}
        onChangeText={(t) => {
          setPin(t.replace(/\D/g, '').slice(0, 4));
          setError(null);
        }}
        onSubmitEditing={submit}
        accessibilityLabel="PIN parental"
        style={{
          color: colors.textPrimary,
          fontSize: 36,
          fontFamily: font.medium,
          letterSpacing: 12,
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderWidth: 3,
          borderColor: colors.surfaceElevated,
          paddingHorizontal: 24,
          paddingVertical: 14,
        }}
      />
      {error && <Text style={{ color: colors.danger, fontSize: 26 }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <FocusCard onPress={submit} style={{ opacity: pin.length === 4 ? 1 : 0.5 }}>
          <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.semibold }}>Desbloquear</Text>
        </FocusCard>
        <FocusCard onPress={onCancel}>
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Cancelar</Text>
        </FocusCard>
      </View>
    </View>
  );
}
