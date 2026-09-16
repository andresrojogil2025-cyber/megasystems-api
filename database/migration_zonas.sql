-- Migración: Soporte multi-zona ISP (Escuque, Carvajal, Beatriz)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE clientes_internet
    ADD COLUMN IF NOT EXISTS zona VARCHAR(50) DEFAULT 'escuque';
