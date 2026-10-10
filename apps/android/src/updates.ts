import { useEffect } from 'react';
import * as Updates from 'expo-updates';

/**
 * Atualização automática (EAS Update): ao abrir o app, procura uma versão nova do código,
 * baixa e reinicia já com ela. Só roda no APK/AAB (no modo de desenvolvimento não há updates).
 * Mudanças nativas (novas bibliotecas, permissões, versão do app) ainda exigem um APK novo.
 */
export function useAutoUpdate(): void {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || cancelled) return;
        const result = await Updates.fetchUpdateAsync();
        if (result.isNew && !cancelled) await Updates.reloadAsync();
      } catch {
        // Sem rede ou servidor indisponível: segue com a versão instalada
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
