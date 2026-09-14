-- Migración: Sistema de cobranza WhatsApp con grupos de pago
-- Ejecutar en Supabase SQL Editor

ALTER TABLE clientes_internet
    ADD COLUMN IF NOT EXISTS grupo_pago VARCHAR(20) DEFAULT 'mensual',
    ADD COLUMN IF NOT EXISTS estado_pago_mes VARCHAR(20) DEFAULT 'pendiente',
    ADD COLUMN IF NOT EXISTS fecha_ultimo_pago DATE,
    ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10,2) DEFAULT 0;
