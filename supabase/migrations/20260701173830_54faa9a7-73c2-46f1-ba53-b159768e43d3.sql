
-- Tuya integration on nutri_equipment
ALTER TABLE public.nutri_equipment
  ADD COLUMN IF NOT EXISTS tuya_device_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS tuya_sensor_type text CHECK (tuya_sensor_type IN ('freezer','chiller','dry','custom')),
  ADD COLUMN IF NOT EXISTS min_temp_c numeric,
  ADD COLUMN IF NOT EXISTS max_temp_c numeric,
  ADD COLUMN IF NOT EXISTS max_humidity_pct numeric,
  ADD COLUMN IF NOT EXISTS alert_delay_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS tuya_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_reading_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_temp_c numeric,
  ADD COLUMN IF NOT EXISTS last_humidity_pct numeric,
  ADD COLUMN IF NOT EXISTS last_online boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS out_of_range_since timestamptz;

-- Readings from Tuya: allow user_id null (system) and tag source
ALTER TABLE public.nutri_temperature_readings
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS humidity numeric,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_nutri_readings_equip_time
  ON public.nutri_temperature_readings (equipment_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutri_equipment_tuya
  ON public.nutri_equipment (tuya_device_id)
  WHERE tuya_device_id IS NOT NULL;

-- Enable pg_cron/pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
