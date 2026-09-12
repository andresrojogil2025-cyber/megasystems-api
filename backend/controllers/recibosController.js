const db = require('../db');

const recibosController = {
    // 1. Crear Recibo de Pago (cobro recibido, sin ligarlo necesariamente a una cuenta por cobrar)
    create: async (req, res) => {
        try {
            const { client_id, monto, moneda, tasa_bcv_hoy, metodo_pago, concepto, observaciones, fecha_documento } = req.body;

            if (!client_id) return res.status(400).json({ error: 'Debe seleccionar un cliente.' });

            const montoIngresado = parseFloat(monto);
            if (!montoIngresado || montoIngresado <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero.' });

            const tasa_bcv_final = tasa_bcv_hoy && tasa_bcv_hoy > 0 ? Math.round(tasa_bcv_hoy * 100) / 100 : null;

            // El monto se guarda en USD (moneda canónica interna), sin importar en cuál se ingresó
            const monto_usd = moneda === 'VES'
                ? (tasa_bcv_final ? montoIngresado / tasa_bcv_final : 0)
                : montoIngresado;

            const monto_ves = tasa_bcv_final ? monto_usd * tasa_bcv_final : null;

            // Generar número correlativo (Recibo)
            const countRow = await db.queryAsync('SELECT COUNT(*) as count FROM recibos_pago');
            const newNro = `REC-${(countRow[0].count + 1).toString().padStart(5, '0')}`;

            const info = await db.runAsync(
                'INSERT INTO recibos_pago (cliente_id, fecha, nro_recibo, monto_usd, tasa_bcv, monto_ves, metodo_pago, concepto, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [client_id, fecha_documento || new Date().toISOString(), newNro, monto_usd, tasa_bcv_final, monto_ves, metodo_pago || 'efectivo', concepto || null, observaciones || null]
            );

            res.json({
                success: true,
                message: 'Recibo de pago generado correctamente.',
                data: { monto_usd, monto_ves, tasa_bcv: tasa_bcv_final, nro_recibo: newNro, id: info.lastID }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al generar el recibo de pago' });
        }
    },

    // 2. Listar recibos de pago
    getAll: async (req, res) => {
        try {
            const sql = `
                SELECT r.*, e.nombre_razon as cliente_nombre, e.rif as cliente_rif
                FROM recibos_pago r
                JOIN entidades e ON r.cliente_id = e.id
                ORDER BY r.fecha DESC
            `;
            const recibos = await db.queryAsync(sql);
            res.json({ success: true, data: recibos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener los recibos de pago' });
        }
    },

    // 3. Detalle de un recibo de pago
    getDetails: async (req, res) => {
        try {
            const { id } = req.params;
            const recibo = await db.queryAsync('SELECT * FROM recibos_pago WHERE id = ?', [id]);

            if (recibo.length === 0) {
                return res.status(404).json({ error: 'Recibo no encontrado' });
            }

            const cliente = await db.queryAsync('SELECT * FROM entidades WHERE id = ?', [recibo[0].cliente_id]);

            res.json({
                success: true,
                data: { ...recibo[0], cliente: cliente[0] }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener detalles del recibo' });
        }
    }
};

module.exports = recibosController;
