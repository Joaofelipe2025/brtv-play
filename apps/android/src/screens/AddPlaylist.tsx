import { useEffect, useRef, useState, type RefObject } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import {
  XtreamClient,
  XtreamError,
  colors,
  createUserPlaylist,
  type Playlist,
  type XtreamPlaylist,
} from '@brtv/core';
import { Body, FocusCard, Logo, Text, Title, font, styles } from '../ui';
import { Clock } from '../components/TopBar';
import { useApp } from '../navigation';
import { store } from '../platform';

type Kind = 'xtream' | 'm3u';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'xtream', label: 'Xtream Codes' },
  { value: 'm3u', label: 'Link M3U' },
];

const LOGIN_FAILED = 'Não foi possível entrar. Confira o servidor, o usuário e a senha.';
const NO_RESPONSE = 'O servidor não respondeu. Confira o endereço e a conexão.';
const CREATE_FAILED = 'Não foi possível adicionar a lista. Confira os dados.';

/** Sem isto um servidor que não responde deixaria "Verificando…" para sempre. */
const VERIFY_TIMEOUT_MS = 15_000;

type LoginResult = 'ok' | 'denied' | 'unreachable';

/**
 * Testa o login numa conta Xtream. O servidor que respondeu mas recusou (credenciais, HTTP de erro)
 * é `denied`; qualquer outra falha (rede, tempo esgotado, resposta que não é da API) é `unreachable`.
 * Nunca devolve nem registra a senha.
 */
async function checkLogin(playlist: XtreamPlaylist, signal: AbortSignal): Promise<LoginResult> {
  try {
    await new XtreamClient(playlist, (url) => fetch(url, { signal })).authenticate();
    return 'ok';
  } catch (error) {
    return error instanceof XtreamError ? 'denied' : 'unreachable';
  }
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <FocusCard selected={active} style={{ paddingVertical: 10, paddingHorizontal: 22 }} onPress={onPress}>
      <Text style={{ color: active ? colors.accent : colors.textPrimary, fontSize: 26, fontFamily: font.medium }}>
        {label}
      </Text>
    </FocusCard>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText(text: string): void;
  inputRef: RefObject<TextInput>;
  /** Foca o próximo campo ao confirmar no teclado; sem isto o campo é o último e só fecha o teclado. */
  onNext?: () => void;
  placeholder?: string;
  secure?: boolean;
  url?: boolean;
  autoFocus?: boolean;
}

/** Campo de texto com rótulo e borda visível no foco (o controle remoto não tem cursor). */
function Field({ label, value, onChangeText, inputRef, onNext, placeholder, secure, url, autoFocus }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 24 }}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secure}
        keyboardType={url ? 'url' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType={onNext ? 'next' : 'done'}
        submitBehavior={onNext ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={onNext}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={{
          color: colors.textPrimary,
          fontSize: 30,
          fontFamily: font.medium,
          backgroundColor: focused ? colors.surfaceElevated : colors.surface,
          borderRadius: 16,
          borderWidth: 3,
          borderColor: focused ? colors.white : colors.surfaceElevated,
          paddingHorizontal: 24,
          paddingVertical: 12,
        }}
      />
    </View>
  );
}

/** Cadastro de uma lista no próprio aparelho: conta Xtream Codes ou link M3U. Fica salva só aqui. */
export function AddPlaylist() {
  const { update, reset, back } = useApp();
  const [kind, setKind] = useState<Kind>('xtream');
  // O foco inicial vai ao primeiro campo; depois que a pessoa troca o tipo ele não pula do seletor.
  const [switched, setSwitched] = useState(false);
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const serverRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const linkRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // `busy` bloqueia um segundo "Salvar e abrir" no mesmo instante; `alive`/`pending` evitam salvar depois de sair da tela.
  const busy = useRef(false);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, []);

  /** Ao editar um campo, a mensagem de erro anterior deixa de valer. */
  const edit = (set: (text: string) => void) => (text: string) => {
    set(text);
    setError(null);
  };

  const chooseKind = (next: Kind) => {
    if (busy.current) return;
    setKind(next);
    setSwitched(true);
    setError(null);
  };

  const submit = async () => {
    if (busy.current) return;
    setError(null);

    let playlist: Playlist;
    try {
      playlist = createUserPlaylist(
        kind === 'xtream' ? { kind: 'xtream', name, server, username, password } : { kind: 'm3u', name, url: link },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : CREATE_FAILED);
      return;
    }

    // Uma conta Xtream só é salva depois de entrar (inclui o link M3U que na verdade é uma conta Xtream).
    if (playlist.kind === 'xtream') {
      busy.current = true;
      setChecking(true);
      const controller = new AbortController();
      pending.current = controller;
      const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
      const result = await checkLogin(playlist, controller.signal);
      clearTimeout(timer);
      pending.current = null;
      if (!alive.current) return;
      busy.current = false;
      setChecking(false);
      if (result !== 'ok') {
        setError(result === 'denied' ? LOGIN_FAILED : NO_RESPONSE);
        return;
      }
    }

    store.getState().addUserPlaylist(playlist);
    update({ playlist });
    reset({ name: 'home' });
  };

  return (
    <View style={styles.screen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Logo height={56} />
        <Clock />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 64 }}>
        <View style={{ width: 560 }}>
          <Title>Adicionar lista</Title>
          <Body muted>Use os dados que o seu provedor enviou. A lista fica salva só neste aparelho.</Body>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 32 }}>
            {KINDS.map((k) => (
              <Segment key={k.value} label={k.label} active={kind === k.value} onPress={() => chooseKind(k.value)} />
            ))}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 20, paddingVertical: 12, paddingLeft: 24, paddingRight: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {kind === 'xtream' ? (
            <>
              <Field
                label="Servidor"
                placeholder="http://exemplo.com:8080"
                url
                autoFocus={!switched}
                value={server}
                onChangeText={edit(setServer)}
                inputRef={serverRef}
                onNext={() => usernameRef.current?.focus()}
              />
              <Field
                label="Usuário"
                value={username}
                onChangeText={edit(setUsername)}
                inputRef={usernameRef}
                onNext={() => passwordRef.current?.focus()}
              />
              <Field
                label="Senha"
                secure
                value={password}
                onChangeText={edit(setPassword)}
                inputRef={passwordRef}
                onNext={() => nameRef.current?.focus()}
              />
            </>
          ) : (
            <Field
              label="Link"
              placeholder="http://exemplo.com/lista.m3u"
              url
              value={link}
              onChangeText={edit(setLink)}
              inputRef={linkRef}
              onNext={() => nameRef.current?.focus()}
            />
          )}
          <Field label="Nome (opcional)" value={name} onChangeText={edit(setName)} inputRef={nameRef} />

          {error && <Text style={{ color: colors.danger, fontSize: 26 }}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
            {/* Sem `disabled`: durante a verificação o botão continua focável, só ignora o toque. */}
            <FocusCard onPress={() => void submit()} style={{ opacity: checking ? 0.6 : 1 }}>
              <Text style={{ color: colors.accent, fontSize: 28, fontFamily: font.semibold }}>
                {checking ? 'Verificando…' : 'Salvar e abrir'}
              </Text>
            </FocusCard>
            <FocusCard onPress={back}>
              <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: font.medium }}>Cancelar</Text>
            </FocusCard>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
