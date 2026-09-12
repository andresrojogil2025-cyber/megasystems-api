const db = require('../db');

const billerController = {
    // 1. Crear Cotización (Sin impacto fiscal)
    createQuote: async (req, res) => {
        try {
            const { client_id, items, tasa_bcv_hoy } = req.body;
            let subtotal_usd = 0;
            
            if(!tasa_bcv_hoy || tasa_bcv_hoy <= 0) {
                return res.status(400).json({error: "La Tasa BCV es obligatoria para guardar la cotización."});
            }

            const tasa_bcv_final = Math.round(tasa_bcv_hoy * 100) / 100;

            // Validar items
            for (let item of items) {
                const row = await db.queryAsync('SELECT precio_usd FROM catalogo WHERE id = ?', [item.catalogo_id]);
                if(row.length > 0) {
                    const precio = row[0].precio_usd;
                    subtotal_usd += (item.cantidad * precio);
                }
            }

            const iva_usd = subtotal_usd * 0.16; // IVA Venezuela 16%
            const total_usd = subtotal_usd + iva_usd;

            // Generar número de cotización correlativo
            const countRow = await db.queryAsync('SELECT COUNT(*) as count FROM cotizaciones');
            const newNro = `COT-${(countRow[0].count + 1).toString().padStart(5, '0')}`;

            // Inserción cotización
            const info = await db.runAsync(
                'INSERT INTO cotizaciones (cliente_id, nro_cotizacion, subtotal_usd, iva_usd, total_usd, tasa_bcv) VALUES (?, ?, ?, ?, ?, ?)',
                [client_id, newNro, subtotal_usd, iva_usd, total_usd, tasa_bcv_final]
            );
            const cotizacion_id = info.lastID;

            // Inserción detalles
            for (let item of items) {
                const row = await db.queryAsync('SELECT precio_usd FROM catalogo WHERE id = ?', [item.catalogo_id]);
                if (row.length > 0) {
                    const precio = row[0].precio_usd;
                    
                    await db.runAsync(
                        'INSERT INTO cotizacion_detalles (cotizacion_id, catalogo_id, cantidad, precio_unitario_usd, total_usd) VALUES (?, ?, ?, ?, ?)',
                        [cotizacion_id, item.catalogo_id, item.cantidad, precio, item.cantidad * precio]
                    );
                }
            }

            res.json({
                success: true,
                message: 'Cotización generada correctamente.',
                data: { subtotal_usd, iva_usd, total_usd, nro_cotizacion: newNro, id: cotizacion_id }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al generar la cotización' });
        }
    },

    // 2. Facturación e Impacto Fiscal
    createInvoice: async (req, res) => {
        try {
            const { client_id, items, tasa_bcv_hoy, cotizacion_id, fecha_documento } = req.body;
            
            if(!tasa_bcv_hoy || tasa_bcv_hoy <= 0) {
                return res.status(400).json({error: "La Tasa BCV es obligatoria"});
            }

            // Exigencia SENIAT: Forzar a 2 decimales la tasa recibida
            const tasa_bcv_final = Math.round(tasa_bcv_hoy * 100) / 100;

            let subtotal_usd = 0;
            const itemsProcessed = [];

            // Obtener precios reales y calcular subtotales
            for (let item of items) {
                const row = await db.queryAsync('SELECT precio_usd, tipo, stock FROM catalogo WHERE id = ?', [item.catalogo_id]);
                if(row.length > 0) {
                    const precio = row[0].precio_usd;
                    subtotal_usd += (item.cantidad * precio);
                    itemsProcessed.push({ ...item, precio_usd: precio, tipo: row[0].tipo, currentStock: row[0].stock });
                }
            }

            const iva_usd = subtotal_usd * 0.16;
            const total_usd = subtotal_usd + iva_usd;

            const subtotal_ves = subtotal_usd * tasa_bcv_final;
            const iva_ves = iva_usd * tasa_bcv_final;
            const total_ves = total_usd * tasa_bcv_final;

            // Generación de Números (Control Interno Megasystems)
            const countRow = await db.queryAsync('SELECT COUNT(*) as count FROM facturas');
            const facturaNumber = countRow[0].count + 1;
            const nro_factura = facturaNumber.toString().padStart(8, '0');
            const nro_control = `00-${facturaNumber.toString().padStart(8, '0')}`;

            // Insertar Factura (Soportando fecha retroactiva)
            const queryFactura = `INSERT INTO facturas 
                (cliente_id, fecha, nro_factura, nro_control, tasa_bcv, subtotal_usd, iva_usd, total_usd, subtotal_ves, iva_ves, total_ves, cotizacion_asociada_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const info = await db.runAsync(queryFactura, [
                client_id, 
                fecha_documento || new Date().toISOString(), 
                nro_factura, 
                nro_control, 
                tasa_bcv_final, 
                subtotal_usd, 
                iva_usd, 
                total_usd, 
                subtotal_ves, 
                iva_ves, 
                total_ves, 
                cotizacion_id || null
            ]);
            const factura_id = info.lastID;

            // Inserción Detalles y Control de Stock
            for (let item of itemsProcessed) {
                const itemTotalUsd = item.cantidad * item.precio_usd;
                const itemTotalVes = itemTotalUsd * tasa_bcv_final;
                const precioVes = item.precio_usd * tasa_bcv_final;

                await db.runAsync(
                    'INSERT INTO factura_detalles (factura_id, catalogo_id, cantidad, precio_unitario_usd, precio_unitario_ves, total_usd, total_ves) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [factura_id, item.catalogo_id, item.cantidad, item.precio_usd, precioVes, itemTotalUsd, itemTotalVes]
                );

                // Disminuir Stock si es "producto"
                if (item.tipo === 'producto' && item.currentStock !== null) {
                    const newStock = item.currentStock - item.cantidad;
                    await db.runAsync('UPDATE catalogo SET stock = ? WHERE id = ?', [newStock, item.catalogo_id]);
                }
            }

            // Marcar cotización como pagada si aplica
            if (cotizacion_id) {
                await db.runAsync("UPDATE cotizaciones SET estado = 'convertida_a_factura' WHERE id = ?", [cotizacion_id]);
            }

            res.json({
                success: true,
                message: 'Factura fiscal emitida exitosamente.',
                nro_factura,
                nro_control,
                montos: {
                    usd: { subtotal: subtotal_usd, iva: iva_usd, total: total_usd },
                    ves: { subtotal: subtotal_ves, iva: iva_ves, total: total_ves, tasa_aplicada: tasa_bcv_final }
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al emitir factura fiscal' });
        }
    },

    // 3. Obtener todas las cotizaciones pendientes
    getQuotes: async (req, res) => {
        try {
            const sql = `
                SELECT c.*, e.nombre_razon as cliente_nombre, e.rif as cliente_rif 
                FROM cotizaciones c
                JOIN entidades e ON c.cliente_id = e.id
                WHERE c.estado = 'pendiente'
                ORDER BY c.fecha DESC
            `;
            const quotes = await db.queryAsync(sql);
            res.json({ success: true, data: quotes });
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener cotizaciones' });
        }
    },

    // 4. Obtener detalle de una cotización específica
    getQuoteDetails: async (req, res) => {
        try {
            const { id } = req.params;
            const quote = await db.queryAsync('SELECT * FROM cotizaciones WHERE id = ?', [id]);
            
            if (quote.length === 0) {
                return res.status(404).json({ error: 'Cotización no encontrada' });
            }

            const details = await db.queryAsync(`
                SELECT cd.*, c.nombre as item_nombre, c.tipo as item_tipo
                FROM cotizacion_detalles cd
                JOIN catalogo c ON cd.catalogo_id = c.id
                WHERE cd.cotizacion_id = ?
            `, [id]);

            const cliente = await db.queryAsync('SELECT * FROM entidades WHERE id = ?', [quote[0].cliente_id]);

            res.json({
                success: true,
                data: {
                    ...quote[0],
                    cliente: cliente[0],
                    items: details
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener detalles de la cotización' });
        }
    }
};

module.exports = billerController;
