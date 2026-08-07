# APK NEXA SmartPOS / Garçom (Gertec GPOS780)

A GPOS780 é um terminal de pagamento e **não permite instalar navegador**, então
o PWA não pode ser usado. A solução é este wrapper **Capacitor (WebView)** que
carrega o app publicado dentro de um APK.

## O que o APK faz

- Abre `https://nexasuite.aquelaparme.com.br/garcom` em tela cheia.
- Permite navegação para o domínio NEXA e para `127.0.0.1` (Checkout Payer, porta 6060).
- Sem dados offline: o terminal precisa de internet.

## Gerar o APK (na sua máquina, não no Lovable)

Pré-requisitos: Node 20+, Android Studio + SDK, JDK 17.

```bash
# 1. Exportar o projeto para o GitHub e clonar
git clone <seu-repo> && cd <seu-repo>
npm install

# 2. Adicionar a plataforma Android (só na primeira vez)
npx cap add android
npx cap update android

# 3. Build web + sync
npm run build
npx cap sync

# 4. Gerar APK de debug (para teste via OTG)
cd android
./gradlew assembleDebug
# saída: android/app/build/outputs/apk/debug/app-debug.apk

# 5. Gerar APK de release assinado (para MDM / Gertec Box)
./gradlew assembleRelease
```

### Assinatura (release)

Crie uma keystore e configure em `android/app/build.gradle`:

```bash
keytool -genkey -v -keystore nexa-smartpos.keystore \
  -alias nexa -keyalg RSA -keysize 2048 -validity 10000
```

```gradle
android {
  signingConfigs {
    release {
      storeFile file("../../nexa-smartpos.keystore")
      storePassword System.getenv("NEXA_KS_PASS")
      keyAlias "nexa"
      keyPassword System.getenv("NEXA_KEY_PASS")
    }
  }
  buildTypes { release { signingConfig signingConfigs.release } }
}
```

Guarde a keystore — sem ela não é possível publicar atualizações do mesmo APK.

## Instalação no terminal

**Via OTG/pendrive:** copie o APK para o pendrive, conecte no terminal com cabo OTG,
abra o gerenciador de arquivos e instale (pode exigir liberar "fontes desconhecidas"
junto ao suporte Gertec).

**Via MDM (Gertec Box):** envie o APK **release assinado** para o suporte Gertec
distribuir no parque. É o caminho recomendado em terminais de produção e permite
travar o aparelho em modo quiosque.

## TEF

Continua **API Localhost** da Payer: o Checkout Payer precisa estar instalado e
logado no próprio terminal, escutando em `http://127.0.0.1:6060`.
Terminal alvo: Gertec GPOS780, NS 6001072502003427.

### Como o app fala com o Payer

Existem dois modos de transporte:

| Modo | Onde | Endpoint |
|------|------|----------|
| `agent` | PC Windows (totem / PDV) | agente NEXA em `https://127.0.0.1:3031` → proxy `/payer/*` |
| `direct` | APK Android na GPOS780 | Checkout Payer direto em `http://127.0.0.1:6060/Client/*` |

Dentro do APK o modo `direct` é detectado automaticamente (Capacitor). Em
**Configurações → Terminal SmartPOS** é possível forçar o modo e ajustar o
endereço do serviço local, com botão de **Testar conexão**.

No modo direto o login fica no próprio app Checkout Payer do terminal — o NEXA
não armazena e-mail/senha da Payer no aparelho.

## Depois de instalar

1. Abrir o app NEXA Garçom no terminal.
2. Fazer login (o app já abre em `/garcom`).
3. Configurar loja/terminal em **Configurações → Terminal SmartPOS**.
4. Venda de teste de R$ 0,01 pelo Payer.

## APK de RELEASE assinado (obrigatório para o MDM Gertec)

Rode na raiz do repo, no PowerShell:

```powershell
.\scripts\build-apk-release.ps1
```

O script faz tudo: valida Java/SDK, cria a keystore (só na primeira vez),
grava `android\keystore.properties`, injeta a `signingConfig release` no
`android\app\build.gradle`, roda `vite build` + `cap sync` e por fim
`gradlew assembleRelease`.

Saída: `android\app\build\outputs\apk\release\app-release.apk`

Parâmetros opcionais:

```powershell
.\scripts\build-apk-release.ps1 -KeystorePassword "SenhaForte" -KeyAlias nexa `
  -SdkDir "C:\Users\Mauro\AppData\Local\Android\Sdk" `
  -JavaHome "C:\Program Files\Android\Android Studio\jbr"
```

### Guardar a keystore

`android\keystore\nexa-release.jks` + senha = identidade do app.
Sem eles não é possível publicar **nenhuma atualização** do mesmo APK
(o Android recusa instalar por cima com assinatura diferente).
A keystore e o `keystore.properties` estão no `.gitignore` — faça backup
manual em local seguro (cofre/drive privado).

### Conferir a assinatura

```powershell
& "$env:JAVA_HOME\bin\jarsigner" -verify -verbose -certs `
  android\app\build\outputs\apk\release\app-release.apk
```

## Tela branca na maquininha (GPOS720/780)

Causa: o WebView dessas POS é antigo (Chrome ~60) e o bundle era gerado em
ES2020 (optional chaining / nullish). O WebView aborta o script e fica em branco.

Correções aplicadas:

- `vite.config.ts`: `build.target = ["es2015","chrome60","safari12"]`.
- `capacitor.config.ts`: `appId = com.aquelaparme.nexa`, `androidScheme: "https"`,
  `webContentsDebuggingEnabled: true` (permite ver o erro via logcat / chrome://inspect).

Depois de qualquer correção:

1. **Publicar** o NEXA Suite (o APK carrega o site publicado, não o bundle local).
2. `npx cap sync android` e gerar o APK de novo (`.\scripts\build-apk-release.ps1`).
3. Como o `appId` mudou, **desinstale** o APK antigo antes de instalar o novo.

### Dados técnicos para a Payer

- Package name: `com.aquelaparme.nexa`
- minSdkVersion: 23 (Android 6.0) — padrão do Capacitor 7; targetSdk 35
- App é WebView; TEF via **API Localhost** `http://127.0.0.1:6060` (Checkout Payer)
