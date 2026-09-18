-- Migración: Módulo de Compras y Proveedores
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rif VARCHAR(50),
    empresa VARCHAR(150),
    telefono VARCHAR(50),
    email VARCHAR(100),
    notas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compras (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE,
    proveedor_id INTEGER REFERENCES proveedores(id),
    fecha_compra DATE,
    factura_proveedor VARCHAR(100),
    total_usd DECIMAL(12,2) DEFAULT 0,
    notas TEXT,
    factura_imagen VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compras_items (
    id SERIAL PRIMARY KEY,
    compra_id INTEGER REFERENCES compras(id) ON DELETE CASCADE,
    catalogo_id INTEGER REFERENCES catalogo(id),
    nombre_item VARCHAR(200) NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    costo_usd DECIMAL(12,2) DEFAULT 0,
    subtotal_usd DECIMAL(12,2) DEFAULT 0
);
