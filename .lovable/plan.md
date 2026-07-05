# Corrigir 404 em aquelaparme.com.br/surpresa

## Causa
`public/surpresa.html` existe e o servidor responde 200, mas o SPA intercepta a URL:

1. Usuário abre `aquelaparme.com.br/surpresa`.
2. Servidor faz fallback pro `index.html` (comportamento normal de SPA).
3. React Router não tem rota `/surpresa` (só `/parme/surpresa`) → renderiza `NotFound` ("404 Oops!").
4. Só depois o `useEffect` do `HostnameGuard` roda e tenta `navigate("/parme/surpresa")`, que por sua vez carrega `pages/parme/Surpresa.tsx` e faz `window.location.replace("/surpresa.html")`.

Resultado: o usuário vê o 404 do React antes do redirect — e em navegações client-side o arquivo estático `surpresa.html` nem sempre é buscado.

## Correção (mínima, só apresentação/roteamento)

1. **`src/components/parme-site/HostnameGuard.tsx`**
   - Tratar `/surpresa` (e futuros arquivos estáticos) como caso especial: em vez de `navigate("/parme/surpresa")`, fazer `window.location.replace("/surpresa.html")` direto. Assim o browser busca o arquivo estático real e nunca cai no SPA.
   - Fazer isso de forma síncrona antes do primeiro render (já dentro do `useEffect`, mas com early-return), evitando o flash do NotFound.

2. **`src/App.tsx`**
   - Adicionar rota client-side `/surpresa` que renderiza um componente que apenas faz `window.location.replace("/surpresa.html")` (mesmo padrão do `pages/parme/Surpresa.tsx` já existente). Isso cobre acessos por outros hosts (nexa.*, lovable.app, localhost) sem depender do HostnameGuard.

3. **Opcional (evita flash em qualquer rota "estática" futura)**
   - Extrair a lista de paths que devem escapar do SPA (`/surpresa`, e outros HTML soltos em `public/` se houver) numa constante única em `HostnameGuard` para reuso.

## O que NÃO muda
- `public/surpresa.html` fica como está.
- Nenhuma rota nova é criada no servidor; apenas o comportamento client-side é corrigido.
- Zero mudança em backend, banco, edge functions ou nos demais fluxos do site Parmê / app NEXA.

## Validação
- Abrir `https://aquelaparme.com.br/surpresa` → deve carregar direto `surpresa.html` sem passar pelo 404.
- Abrir `https://nexa.aquelaparme.com.br/surpresa` → deve continuar indo pro `/auth` (comportamento atual preservado).
- Abrir `/parme/surpresa` diretamente → continua funcionando (redireciona pro HTML).
