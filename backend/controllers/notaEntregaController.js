const db = require('../db');

const notaEntregaController = {
    // 1. Crear Nota de Entrega (descuenta stock, sin impacto fiscal)
    create: async (req, res) => {
        try {
            const { client_id, items, observaciones, fecha_documento, tasa_bcv_hoy, descuento_monto, descuento_moneda } = req.body;

            if (!client_id) return res.status(400).json({ error: 'Debe seleccionar un cliente.' });
            if (!items || items.length === 0) return res.status(400).json({ error: 'Debe agregar al menos un ítem.' });

            const tasa_bcv_final = tasa_bcv_hoy && tasa_bcv_hoy > 0 ? Math.round(tasa_bcv_hoy * 100) / 100 : null;

            let subtotal_usd = 0;
            const itemsProcessed = [];

            for (let item of items) {
                // Solo consultar tipo y stock del catálogo; el precio lo define el usuario
                const row = await db.queryAsync('SELECT tipo, stock FROM catalogo WHERE id = ?', [item.catalogo_id]);
                if (row.length > 0) {
                    const precio_usd = parseFloat(item.precio_usd) || 0;
                    subtotal_usd += item.cantidad * precio_usd;
                    itemsProcessed.push({ ...item, precio_usd, tipo: row[0].tipo, currentStock: row[0].stock });
                }
            }

            // El descuento se convierte a USD (moneda canónica interna) sin importar en cuál se ingresó
            const montoIngresado = parseFloat(descuento_monto) || 0;
            let descuento_usd = descuento_moneda === 'VES'
                ? (tasa_bcv_final ? montoIngresado / tasa_bcv_final : 0)
                : montoIngresado;
            if (descuento_usd < 0) descuento_usd = 0;
            if (descuento_usd > subtotal_usd) descuento_usd = subtotal_usd;

            const total_usd = subtotal_usd - descuento_usd;

            // Calcular totales en Bs usando precio_ves exacto por ítem si el usuario lo definió
            const subtotal_ves = tasa_bcv_final ? itemsProcessed.reduce((sum, it) => {
                const pVes = it.precio_ves != null ? parseFloat(it.precio_ves) : it.precio_usd * tasa_bcv_final;
                return sum + pVes * it.cantidad;
            }, 0) : null;

            const descuento_ves = descuento_moneda === 'VES'
                ? montoIngresado
                : (tasa_bcv_final ? descuento_usd * tasa_bcv_final : null);
            const total_ves = subtotal_ves !== null ? Math.max(0, subtotal_ves - (descuento_ves || 0)) : null;

            // Generar número correlativo (Nota de Entrega)
            const countRow = await db.queryAsync('SELECT COUNT(*) as count FROM notas_entrega');
            const newNro = `NE-${(countRow[0].count + 1).toString().padStart(5, '0')}`;

            const info = await db.runAsync(
                'INSERT INTO notas_entrega (cliente_id, fecha, nro_nota_entrega, subtotal_usd, total_usd, tasa_bcv, subtotal_ves, total_ves, descuento_usd, descuento_ves, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [client_id, fecha_documento || new Date().toISOString(), newNro, subtotal_usd, total_usd, tasa_bcv_final, subtotal_ves, total_ves, descuento_usd, descuento_ves, observaciones || null]
            );
            const nota_entrega_id = info.lastID;

            for (let item of itemsProcessed) {
                const itemTotalUsd = item.cantidad * item.precio_usd;
                // Usar precio_ves exacto si el usuario lo ingresó, si no calcular desde USD
                const precioVes = item.precio_ves != null
                    ? parseFloat(item.precio_ves)
                    : (tasa_bcv_final ? item.precio_usd * tasa_bcv_final : null);
                const itemTotalVes = precioVes !== null ? precioVes * item.cantidad : null;

                await db.runAsync(
                    'INSERT INTO nota_entrega_detalles (nota_entrega_id, catalogo_id, cantidad, precio_unitario_usd, precio_unitario_ves, total_usd, total_ves) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [nota_entrega_id, item.catalogo_id, item.cantidad, item.precio_usd, precioVes, itemTotalUsd, itemTotalVes]
                );

                // Descontar stock si es "producto" (los bienes ya salieron físicamente)
                if (item.tipo === 'producto' && item.currentStock !== null) {
                    const newStock = item.currentStock - item.cantidad;
                    await db.runAsync('UPDATE catalogo SET stock = ? WHERE id = ?', [newStock, item.catalogo_id]);
                }
            }

            res.json({
                success: true,
                message: 'Nota de entrega generada correctamente.',
                data: { subtotal_usd, total_usd, subtotal_ves, total_ves, descuento_usd, descuento_ves, tasa_bcv: tasa_bcv_final, nro_nota_entrega: newNro, id: nota_entrega_id }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al generar la nota de entrega' });
        }
    },

    // 2. Listar notas de entrega
    getAll: async (req, res) => {
        try {
            const sql = `
                SELECT n.*, e.nombre_razon as cliente_nombre, e.rif as cliente_rif
                FROM notas_entrega n
                JOIN entidades e ON n.cliente_id = e.id
                ORDER BY n.fecha DESC
            `;
            const notas = await db.queryAsync(sql);
            res.json({ success: true, data: notas });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener las notas de entrega' });
        }
    },

    // 3. Detalle de una nota de entrega
    getDetails: async (req, res) => {
        try {
            const { id } = req.params;
            const nota = await db.queryAsync('SELECT * FROM notas_entrega WHERE id = ?', [id]);

            if (nota.length === 0) {
                return res.status(404).json({ error: 'Nota de entrega no encontrada' });
            }

            const details = await db.queryAsync(`
                SELECT nd.*, c.nombre as item_nombre, c.tipo as item_tipo
                FROM nota_entrega_detalles nd
                JOIN catalogo c ON nd.catalogo_id = c.id
                WHERE nd.nota_entrega_id = ?
            `, [id]);

            const cliente = await db.queryAsync('SELECT * FROM entidades WHERE id = ?', [nota[0].cliente_id]);

            res.json({
                success: true,
                data: {
                    ...nota[0],
                    cliente: cliente[0],
                    items: details
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener detalles de la nota de entrega' });
        }
    }
};

module.exports = notaEntregaController;
