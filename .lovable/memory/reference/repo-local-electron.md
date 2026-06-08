---
name: Repo local Electron
description: Repositório local do usuário para builds dos agentes Electron (NEXA ACBr, Totem, PDV)
type: reference
---
Repositório oficial conectado ao Lovable: **`maurogoncalves27-stack/nexa-suite-d7be2ff9`** (branch `main`).

Clone local do usuário: **`C:\Users\Mauro\Documents\GitHub\nexa-suite`**

Sempre buildar a partir daí:
```powershell
cd C:\Users\Mauro\Documents\GitHub\nexa-suite
git pull
cd electron-acbr   # ou electron-totem / electron-pdv
npm install
npm run dist:win
```

Saída: `electron-*/release/NEXA <Modulo> Setup <versao>.exe`.

O antigo `C:\Users\Mauro\Documents\GitHub\rhplus` está DESCONTINUADO (não recebe mais sync do Lovable) — pode ser apagado.
