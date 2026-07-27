
UPDATE public.notification_settings SET label = CASE alert_key
  WHEN 'giana_feedback'     THEN 'Feedback do agente Giana (IA)'
  WHEN 'customer_complaint' THEN 'Reclamação de cliente (WhatsApp SAC)'
  WHEN 'crm_reservation'    THEN 'Nova reserva de mesa (CRM / site)'
  WHEN 'delivery'           THEN 'Entregas — rota ou atraso do motoboy'
  WHEN 'maintenance'        THEN 'Manutenção — nova solicitação da loja'
  WHEN 'occurrence'         THEN 'Ocorrência operacional registrada na loja'
  WHEN 'network'            THEN 'Rede / internet da loja offline (MikroTik)'
  WHEN 'temperature'        THEN 'Temperatura fora do range (câmara / freezer)'
  WHEN 'timeclock'          THEN 'Atraso de ponto (≥ 15 min sem entrada)'
  WHEN 'announcement'       THEN 'Aviso / comunicado interno publicado'
  WHEN 'schedule'           THEN 'Escala e férias — alterações e aprovações'
  WHEN 'payslip'            THEN 'Envio de holerite, férias e rescisão'
  WHEN 'appointment'        THEN 'Lembrete de consulta médica / ASO'
  WHEN 'candidate_message'  THEN 'Mensagem de candidato (recrutamento)'
  WHEN 'hr'                 THEN 'RH geral — solicitações, advertências e cadastros'
  WHEN 'mental_health'      THEN 'Saúde mental — humor coletado com risco'
  WHEN 'whatsapp_health'    THEN 'WhatsApp / Z-API desconectado'
  ELSE label
END
WHERE alert_key IN (
  'giana_feedback','customer_complaint','crm_reservation','delivery','maintenance',
  'occurrence','network','temperature','timeclock','announcement','schedule',
  'payslip','appointment','candidate_message','hr','mental_health','whatsapp_health'
);
