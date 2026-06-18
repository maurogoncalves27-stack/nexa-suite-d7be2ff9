# Acesso remoto — RustDesk no totem

O instalador **Nexa Totem** instala o [RustDesk](https://rustdesk.com/) automaticamente para suporte remoto (visão e controle da tela do totem).

## O que é instalado

1. **Nexa Totem** (kiosk)
2. **RustDesk** (serviço Windows, ID fixo por máquina)
3. Arquivo `%ProgramData%\ViteSuite\remote-access.json` com o ID

## Tela do totem

- **23,8" vertical** (touch)
- Teclado virtual integrado no app (`/totem`)

## PDV da loja (outro instalador)

- **21,5" horizontal** (touch)
- Teclado virtual em `/loja`

## Ver o ID RustDesk no totem

PowerShell:

```powershell
Get-Content "$env:ProgramData\ViteSuite\remote-access.json"
```

Ou no app: **Configurações → Totem** (painel Terminais remotos), após o totem enviar heartbeat.

## Conectar pelo RustDesk

1. Instale RustDesk no seu PC de suporte
2. Use o **ID** do totem + senha definida no RustDesk do totem (configure na 1ª abertura ou via política)
3. Recomendado: servidor RustDesk próprio (self-host) para a rede Vite Suite

## Reinstalar só o RustDesk

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\Nexa Totem\resources\scripts\install-rustdesk.ps1"
```

## Próximo passo (opcional)

- Servidor RustDesk self-hosted
- Senha padrão por loja via script de deploy
- Painel Vite Suite com link “Abrir remoto” (fase 2)
