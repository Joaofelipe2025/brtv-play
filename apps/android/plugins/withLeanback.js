const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const LEANBACK_FEATURE = 'android.software.leanback';

/** Copia assets/tv_banner.png (gerado por `pnpm brand:assets`) para res/drawable. */
function withTvBanner(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'tv_banner.png');
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      if (!fs.existsSync(source)) {
        throw new Error('assets/tv_banner.png não encontrado. Rode `pnpm brand:assets` na raiz do repositório.');
      }
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, path.join(targetDir, 'tv_banner.png'));
      return cfg;
    },
  ]);
}

/**
 * Android TV: declara leanback como NÃO obrigatório (o app também roda em celular),
 * adiciona o banner da TV e o intent LEANBACK_LAUNCHER na atividade principal.
 * O banner (320x180) é copiado para res/drawable por withTvBanner.
 */
module.exports = function withLeanback(config) {
  config = withTvBanner(config);
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    const features = (manifest['uses-feature'] ?? []).filter(
      (f) => f.$?.['android:name'] !== LEANBACK_FEATURE,
    );
    features.push({ $: { 'android:name': LEANBACK_FEATURE, 'android:required': 'false' } });
    manifest['uses-feature'] = features;

    const application = manifest.application?.[0];
    if (!application) return cfg;
    application.$['android:banner'] = '@drawable/tv_banner';

    const activity = (application.activity ?? []).find(
      (a) => a.$?.['android:name'] === '.MainActivity',
    );
    if (activity) {
      const filters = activity['intent-filter'] ?? [];
      const hasLeanback = filters.some((f) =>
        (f.category ?? []).some((c) => c.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER'),
      );
      if (!hasLeanback) {
        filters.push({
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } }],
        });
      }
      activity['intent-filter'] = filters;
    }

    return cfg;
  });
};
