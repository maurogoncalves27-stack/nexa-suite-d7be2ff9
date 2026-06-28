# Módulo Payer (Checkout API Localhost)

Integração **isolada** do Payer Checkout. Não importa nem altera `acbr-tefd.cjs` (PayGo).

## Arquivos

| Arquivo | Função |
|---------|--------|
| `localhost.cjs` | Cliente HTTP para Checkout em `http://127.0.0.1:6060` |
| `routes.cjs` | Rotas `/payer/*` registradas pelo `server.cjs` |

## Variáveis de ambiente

```env
PAYER_BASE_URL=http://127.0.0.1:6060
PAYER_EMAIL=seu@email.com
PAYER_PASSWORD=***
```

## Pré-requisitos

1. **Payer Checkout** instalado e aberto (modo Localhost).
2. **NEXA ACBr Agent** rodando (HTTPS `3031`).
3. Credenciais configuradas antes de subir o agente.

## Documentação

- https://docs.payer.com.br/docs/integrations/api-localhost.html
- Setup completo: `../SETUP-PAYER.md`
