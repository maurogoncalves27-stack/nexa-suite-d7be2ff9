# Instalação do NEXA Garçom / SmartPOS na Gertec GPOS780

Este guia aplica-se às maquininhas SmartPOS Gertec GPOS780 usadas no balcão (SmartPOS) e no atendimento de mesas (NEXA Garçom).

## Pré-requisitos

- Maquininha Gertec GPOS780 com Android e acesso à internet (Wi-Fi ou 4G).
- Terminal cadastrado em **Configurações → Terminal SmartPOS** (`/configuracoes/smartpos`).
- Provider TEF configurado (Payer API Localhost é o padrão em produção).
- URL publicada do NEXA Suite (ex.: `https://nexasuite.aquelaparme.com.br`).

## Passo a passo

1. **Abra o navegador da GPOS780**
   - Use o Chrome ou o navegador padrão do aparelho.
   - Acesse a URL publicada do NEXA Suite.

2. **Faça login**
   - SmartPOS (balcão): entre com o operador de caixa autorizado.
   - Garçom: entre com o usuário de role `waiter`.
   - As telas são `/smartpos/login` e `/garcom`.

3. **Adicione à tela inicial**
   - No Chrome, toque no menu (⋮) e selecione **"Adicionar à tela inicial"**.
   - Confirme o nome "NEXA Garçom".
   - O ícone da NEXA será criado na home do Android.

4. **Abra o app instalado**
   - A partir do ícone, o app abre em modo "standalone" (sem barra de endereço).
   - A tela inicial será `/garcom` (Garçom) ou `/smartpos` (balcão), conforme o atalho criado.

5. **Configure o TEF no primeiro uso**
   - Acesse **Configurações → Terminal SmartPOS**.
   - Selecione a loja.
   - Provider: **Payer (API Localhost)**.
   - Endereço do serviço local: `http://127.0.0.1:6060` (padrão da Payer dentro do aparelho).
   - Terminal / número lógico: código fornecido pela Payer.
   - Toque em **Testar conexão** e depois **Salvar**.

6. **Teste uma venda real de valor baixo**
   - No SmartPOS ou Garçom, adicione um item ao carrinho.
   - Escolha a forma de pagamento (crédito, débito ou PIX).
   - Siga as instruções do pinpad.
   - Verifique se o comprovante saiu na bobina.

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Sem resposta" no teste de conexão | Payer não está rodando no aparelho | Reinicie a GPOS780 ou reinstale o app da Payer |
| Pagamento aprovado, pedido pendente | Falha ao gravar no banco | Anote NSU e avise o gestor; o pedido pode ser concluído manualmente |
| Comprovante não imprime | Sem bridge nativa e sem URL de impressão | Configure a URL do serviço de impressão em `/configuracoes/smartpos` |
| Cardápio vazio | Loja sem itens disponíveis | Verifique em Configurações → Cardápio → "Itens por loja" |

## Observações

- O app web fala com o TEF pelo `localhost` do próprio aparelho. Não é necessário PC ou agente Windows.
- Para trocar de provedor TEF (Payer ⇄ PayGo), altere apenas em `/configuracoes/smartpos`. Não mexa nos arquivos `electron-totem/**` nem `electron-acbr/**`.
- NFC-e no SmartPOS/Garçom ainda não está ativa; o comprovante TEF não é documento fiscal.
