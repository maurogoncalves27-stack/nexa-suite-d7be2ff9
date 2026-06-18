## Diagnóstico encontrado

O problema não parece ser apenas visual. Há uma inconsistência real entre frontend e permissões do backend:

1. **Manutenção do NutriControle**
   - A tela permite qualquer usuário autenticado criar uma solicitação de manutenção e anexar foto.
   - O registro em `nutri_maintenance_requests` permite criação por usuário autenticado.
   - Porém o bucket `nutri-maintenance-photos` só permite upload para `admin`, `manager`, `hr` e `nutritionist`.
   - Resultado provável: colaborador consegue preencher a solicitação, mas ao anexar foto recebe falha no upload antes de salvar.

2. **Buckets misturados no NutriControle**
   - Manutenção usa `nutri-maintenance-photos`.
   - Dedetização e caixa d’água usam o bucket genérico `nutricontrol`, embora existam buckets específicos `nutri-pest-certificates` e `nutri-water-reports`.
   - Isso aumenta chance de erro de leitura/upload e dificulta rastrear permissões.

3. **Fluxo mobile/câmera**
   - O componente de foto tenta abrir câmera via `getUserMedia` e, se falhar, aciona o seletor de arquivo programaticamente.
   - Em alguns celulares/navegadores, esse clique programático pode ser bloqueado por segurança.
   - Já existe um input manual logo abaixo em Manutenção, mas o botão “Tirar foto” pode continuar parecendo quebrado em mobile.

4. **Evidência do backend**
   - Buckets existem.
   - As políticas existem.
   - Não há logs recentes de upload para buckets `nutri*`, o que combina com falha antes ou durante a tentativa de envio.

## Plano de correção

### 1. Corrigir permissão real do upload de foto de manutenção
- Criar uma migration ajustando a política de `storage.objects` para `nutri-maintenance-photos`.
- Permitir upload para usuário autenticado quando o primeiro segmento do caminho for uma loja que ele pode acessar **ou** quando ele for o próprio solicitante autorizado pelo fluxo.
- Manter leitura controlada para usuários autorizados e/ou pública apenas se necessário para as URLs atuais.
- Evitar liberar todos os buckets do NutriControle para qualquer usuário.

### 2. Separar políticas por bucket em vez de uma política genérica
- Substituir a política ampla `nutricontrol_all_buckets_*` por regras mais específicas:
  - `nutri-maintenance-photos`: colaboradores autorizados podem enviar; staff/nutricionista podem ler/gerenciar.
  - `nutricontrol` / laudos gerais: manter restrito a staff/nutricionista, ou migrar o frontend para buckets específicos.
  - `nutri-pest-certificates`, `nutri-water-reports`, `nutri-oil-disposal-receipts`: manter por loja/staff conforme o uso.

### 3. Padronizar frontend do NutriControle
- Em `NutriMaintenanceControl`, manter o bucket de manutenção e melhorar a mensagem de erro para exibir o motivo real (`403`, RLS, tamanho, tipo inválido).
- Em `NutriPestControl`, trocar upload/leitura para `nutri-pest-certificates` em vez de `nutricontrol`.
- Em `NutriWaterTankControl`, trocar upload/leitura para `nutri-water-reports` em vez de `nutricontrol`.
- Padronizar nome seguro de arquivo nos três fluxos.

### 4. Corrigir experiência mobile de foto
- Ajustar `MaintenancePhotoCaptureButton` para ter fallback nativo visível/confiável, sem depender de clique programático após falha de câmera.
- Adicionar `capture="environment"` no input nativo quando fizer sentido.
- Manter compressão antes do upload para evitar travamento por imagens grandes.

### 5. Validar sem mexer em outras áreas
- Testar pelo menos estes cenários:
  - Colaborador comum cria solicitação de manutenção com foto.
  - Gestor/nutricionista visualiza a foto anexada.
  - Nutricionista envia certificado de pragas.
  - Nutricionista envia laudo de caixa d’água.
- Conferir logs de storage após teste para confirmar upload `200/201` e ausência de `403`.

## Arquivos prováveis a alterar

- `src/components/nutricontrol/NutriMaintenanceControl.tsx`
- `src/components/nutricontrol/NutriPestControl.tsx`
- `src/components/nutricontrol/NutriWaterTankControl.tsx`
- `src/components/nutricontrol/MaintenancePhotoCaptureButton.tsx`
- Nova migration de políticas de storage para buckets do NutriControle

## Observação importante

A correção principal deve ser feita no backend/políticas de Storage, não só no botão. O botão pode estar funcionando, mas o backend está recusando o arquivo para alguns perfis.