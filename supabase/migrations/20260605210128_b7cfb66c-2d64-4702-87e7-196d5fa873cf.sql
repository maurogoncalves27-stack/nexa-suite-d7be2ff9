-- Afastamento previdenciário (INSS) — 15 dias empregador + suspensão
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS inss_referral boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inss_benefit_type text,
  ADD COLUMN IF NOT EXISTS inss_benefit_number text;

COMMENT ON COLUMN public.medical_certificates.inss_referral IS 'Quando true, o atestado foi encaminhado ao INSS; folha separa rubrica de 15 primeiros dias e suspende salário a partir do 16º.';
COMMENT ON COLUMN public.medical_certificates.inss_benefit_type IS 'B31=auxílio doença comum; B91=acidente de trabalho; B80=maternidade.';
COMMENT ON COLUMN public.medical_certificates.inss_benefit_number IS 'Número do Benefício (NB) emitido pelo INSS após perícia.';

ALTER TABLE public.payroll_calculated
  ADD COLUMN IF NOT EXISTS inss_leave_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inss_leave_pay numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inss_suspension_days integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_calculated.inss_leave_days IS 'Dias dentro dos 15 primeiros de afastamento previdenciário que caem no mês (pagos pelo empregador).';
COMMENT ON COLUMN public.payroll_calculated.inss_leave_pay IS 'Valor pago como afastamento previdenciário 15 primeiros dias (provento, incide INSS/FGTS/IRRF).';
COMMENT ON COLUMN public.payroll_calculated.inss_suspension_days IS 'Dias do mês em que contrato está suspenso (INSS pagando direto, do 16º em diante). Informativo, valor zero.';