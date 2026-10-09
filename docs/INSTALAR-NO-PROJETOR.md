# Instalar no projetor ou TV Android (sem a Play Store)

Serve para projetores como o Magcubic, TV boxes e TVs com Android. O APK é gerado na nuvem pela Expo (EAS Build), então não precisa de Android Studio nem de SDK no computador.

## 1. Gerar o APK (na nuvem)

1. Crie uma conta gratuita em [expo.dev](https://expo.dev).
2. Na raiz do projeto:

   ```bash
   pnpm android:apk
   ```

   Na primeira vez, o comando pede login na conta Expo e oferece criar o projeto lá. Aceite, porque isso grava o `projectId` em `apps/android/app.json`. O build leva cerca de 15 a 20 minutos e termina com um link e um QR code para baixar o `.apk`.

## 2. Instalar no projetor

Escolha o jeito mais fácil para o seu aparelho:

- **Pendrive:** copie o `.apk` para um pendrive, conecte no projetor e abra pelo gerenciador de arquivos.
- **App Downloader:** instale o "Downloader" no projetor e digite o link do build.
- **ADB pelo Wi-Fi** (avançado): ative a depuração nas opções de desenvolvedor do projetor e rode `adb connect <ip>` e depois `adb install <arquivo>.apk`.

Na primeira instalação, o Android pede para permitir "instalar apps de fontes desconhecidas" para o app que está instalando (gerenciador de arquivos ou Downloader). Permita só para ele.

## 3. Abrir

O BRTV PLAY aparece na lista de apps do projetor, com o banner na tela inicial em aparelhos Android TV. A navegação é toda pelo controle remoto.

## O que esperar hoje

Enquanto o backend real não existe, o app ativa sozinho no modo de teste e mostra só a **lista de demonstração** (streams públicos de teste). Para assistir às suas próprias listas, é preciso o banco de dados e o portal (veja "Backend" no README).

## Quando der errado

- **O app não aparece depois de instalar:** procure em Configurações → Apps. Alguns launchers de projetor só mostram apps fixados.
- **O build falhou na Expo:** abra o link do build e copie o log da etapa que falhou. Esse foi o primeiro build nativo do app, então ajustes ainda podem ser necessários.
