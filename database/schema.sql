-- Sistema de Facturación Interna Megasystems - Esquema Inicial (PostgreSQL)

CREATE TABLE IF NOT EXISTS configuracion_visual (
    id SERIAL PRIMARY KEY,
    fondo_login_url TEXT DEFAULT 'default_bg.jpg',
    logo_url TEXT DEFAULT 'default_logo.png',
    banner_url TEXT DEFAULT 'default_banner.jpg',
    tasa_bcv_manual NUMERIC(10,4) DEFAULT 0.0000,
    fecha_actualizacion_tasa TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(20) DEFAULT 'vendedor'
);

CREATE TABLE IF NOT EXISTS entidades (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,
    nombre_razon VARCHAR(150) NOT NULL,
    rif VARCHAR(20) UNIQUE NOT NULL,
    direccion TEXT,
    telefono VARCHAR(50),
    email VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS catalogo (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_usd NUMERIC(10,2) NOT NULL,
    stock INTEGER DEFAULT NULL,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cotizaciones (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES entidades(id),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nro_cotizacion VARCHAR(50) UNIQUE NOT NULL,
    subtotal_usd NUMERIC(10,2) NOT NULL,
    iva_usd NUMERIC(10,2) NOT NULL,
    total_usd NUMERIC(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS cotizacion_detalles (
    id SERIAL PRIMARY KEY,
    cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id),
    catalogo_id INTEGER NOT NULL REFERENCES catalogo(id),
    cantidad INTEGER NOT NULL,
    precio_unitario_usd NUMERIC(10,2) NOT NULL,
    total_usd NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES entidades(id),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nro_factura VARCHAR(50) UNIQUE NOT NULL,
    nro_control VARCHAR(50) UNIQUE NOT NULL,
    tasa_bcv NUMERIC(10,4) NOT NULL,
    subtotal_usd NUMERIC(10,2) NOT NULL,
    iva_usd NUMERIC(10,2) NOT NULL,
    total_usd NUMERIC(10,2) NOT NULL,
    subtotal_ves NUMERIC(10,3) NOT NULL,
    iva_ves NUMERIC(10,3) NOT NULL,
    total_ves NUMERIC(10,3) NOT NULL,
    cotizacion_asociada_id INTEGER DEFAULT NULL REFERENCES cotizaciones(id),
    estado VARCHAR(20) DEFAULT 'emitida'
);

CREATE TABLE IF NOT EXISTS factura_detalles (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER NOT NULL REFERENCES facturas(id),
    catalogo_id INTEGER NOT NULL REFERENCES catalogo(id),
    cantidad INTEGER NOT NULL,
    precio_unitario_usd NUMERIC(10,2) NOT NULL,
    precio_unitario_ves NUMERIC(10,3) NOT NULL,
    total_usd NUMERIC(10,2) NOT NULL,
    total_ves NUMERIC(10,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS retenciones (
    id SERIAL PRIMARY KEY,
    fecha_retencion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nro_comprobante VARCHAR(50) NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES entidades(id),
    factura_id INTEGER NOT NULL REFERENCES facturas(id),
    monto_retenido_ves NUMERIC(10,3) NOT NULL,
    impuesto_tipo VARCHAR(20) DEFAULT 'IVA'
);

INSERT INTO configuracion_visual (fondo_login_url, logo_url, banner_url) 
VALUES ('images/default/tech_bg.jpg', 'images/default/megasystems_logo.png', 'images/default/banner_cctv_redes.jpg');

CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES entidades(id),
    fecha_credito TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    monto_total_usd NUMERIC(10,2) NOT NULL,
    monto_pendiente_usd NUMERIC(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    notas TEXT
);

CREATE TABLE IF NOT EXISTS abonos (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas_por_cobrar(id),
    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    monto_pagado_usd NUMERIC(10,2) NOT NULL,
    monto_pagado_ves NUMERIC(10,3) NOT NULL,
    tasa_bcv NUMERIC(10,4) NOT NULL,
    metodo_pago VARCHAR(50),
    notas TEXT
);

CREATE TABLE IF NOT EXISTS historial_tasas (
    id SERIAL PRIMARY KEY,
    fecha DATE UNIQUE NOT NULL,
    tasa NUMERIC(10,4) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
