const db = require('../db');

const cuentasController = {
    // Obtener todas las cuentas por cobrar (pendientes por defecto)
    getAll: async (req, res) => {
        try {
            const { estado, cliente_id } = req.query;
            let sql = `
                SELECT c.*, e.nombre_razon as cliente_nombre, e.rif as cliente_rif, e.telefono as cliente_telefono, e.email as cliente_email
                FROM cuentas_por_cobrar c
                JOIN entidades e ON c.cliente_id = e.id
                WHERE 1=1
            `;
            const params = [];

            if (estado) {
                sql += " AND c.estado = ?";
                params.push(estado);
            }
            if (cliente_id) {
                sql += " AND c.cliente_id = ?";
                params.push(cliente_id);
            }

            sql += " ORDER BY c.fecha_credito DESC";
            
            const deudas = await db.queryAsync(sql, params);
            res.json({ success: true, data: deudas });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener cuentas por cobrar' });
        }
    },

    // Registrar una nueva deuda
    create: async (req, res) => {
        try {
            const { cliente_id, monto_total_usd, fecha_credito, notas } = req.body;
            
            if (!cliente_id || !monto_total_usd) {
                return res.status(400).json({ error: 'Cliente y Monto son obligatorios' });
            }

            const info = await db.runAsync(
                `INSERT INTO cuentas_por_cobrar (cliente_id, monto_total_usd, monto_pendiente_usd, fecha_credito, notas) 
                 VALUES (?, ?, ?, ?, ?)`,
                [cliente_id, monto_total_usd, monto_total_usd, fecha_credito || new Date(), notas]
            );

            res.json({ success: true, message: 'Deuda registrada con éxito', id: info.lastID });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al registrar la deuda' });
        }
    },

    // Registrar un abono
    createAbono: async (req, res) => {
        try {
            const { id } = req.params; // ID de la cuenta por cobrar
            const { monto_pagado_usd, monto_pagado_ves, tasa_bcv, metodo_pago, notas } = req.body;

            if (!monto_pagado_usd || !tasa_bcv) {
                return res.status(400).json({ error: 'Monto en USD y Tasa BCV son obligatorios' });
            }

            // 1. Obtener la cuenta actual
            const cuenta = await db.queryAsync("SELECT * FROM cuentas_por_cobrar WHERE id = ?", [id]);
            if (cuenta.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });

            const monto_pendiente_anterior = cuenta[0].monto_pendiente_usd;
            const nuevo_pendiente = Math.max(0, monto_pendiente_anterior - monto_pagado_usd);
            const nuevo_estado = nuevo_pendiente <= 0 ? 'pagado' : 'pendiente';

            // 2. Insertar el abono
            await db.runAsync(
                `INSERT INTO abonos (cuenta_id, monto_pagado_usd, monto_pagado_ves, tasa_bcv, metodo_pago, notas) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, monto_pagado_usd, monto_pagado_ves, tasa_bcv, metodo_pago, notas]
            );

            // 3. Actualizar la cuenta por cobrar
            await db.runAsync(
                "UPDATE cuentas_por_cobrar SET monto_pendiente_usd = ?, estado = ? WHERE id = ?",
                [nuevo_pendiente, nuevo_estado, id]
            );

            res.json({ 
                success: true, 
                message: nuevo_estado === 'pagado' ? 'Deuda cancelada totalmente' : 'Abono registrado con éxito',
                nuevo_pendiente
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al registrar el abono' });
        }
    },

    // Obtener historial de abonos de una cuenta
    getAbonos: async (req, res) => {
        try {
            const { id } = req.params;
            const abonos = await db.queryAsync("SELECT * FROM abonos WHERE cuenta_id = ? ORDER BY fecha_pago DESC", [id]);
            res.json({ success: true, data: abonos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener historial de abonos' });
        }
    }
};

module.exports = cuentasController;
