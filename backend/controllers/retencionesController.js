const db = require('../db');

const retencionesController = {
    // 1. Registrar nueva retención
    create: async (req, res) => {
        try {
            const { fecha_retencion, nro_comprobante, cliente_id, factura_id, monto_retenido_ves, impuesto_tipo } = req.body;
            
            if (!nro_comprobante || !cliente_id || !factura_id || !monto_retenido_ves) {
                return res.status(400).json({ error: 'Todos los campos son obligatorios' });
            }

            const sql = `
                INSERT INTO retenciones (fecha_retencion, nro_comprobante, cliente_id, factura_id, monto_retenido_ves, impuesto_tipo)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            const result = await db.runAsync(sql, [
                fecha_retencion || new Date().toISOString().slice(0, 19).replace('T', ' '),
                nro_comprobante,
                cliente_id,
                factura_id,
                monto_retenido_ves,
                impuesto_tipo || 'IVA'
            ]);

            res.json({ success: true, id: result.lastID, message: 'Retención registrada correctamente' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al registrar la retención' });
        }
    },

    // 2. Obtener todas las retenciones
    getAll: async (req, res) => {
        try {
            const sql = `
                SELECT r.*, e.nombre_razon as cliente_nombre, e.rif as cliente_rif, f.nro_factura, f.nro_control
                FROM retenciones r
                JOIN entidades e ON r.cliente_id = e.id
                JOIN facturas f ON r.factura_id = f.id
                ORDER BY r.fecha_retencion DESC
            `;
            const data = await db.queryAsync(sql);
            res.json({ success: true, data });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener las retenciones' });
        }
    },

    // 3. Eliminar retención
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await db.runAsync('DELETE FROM retenciones WHERE id = ?', [id]);
            res.json({ success: true, message: 'Retención eliminada' });
        } catch (error) {
            res.status(500).json({ error: 'Error al eliminar la retención' });
        }
    }
};

module.exports = retencionesController;
