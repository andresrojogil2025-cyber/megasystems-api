const db = require('../db');

const entidadesController = {
    // Obtener todas las entidades
    getAll: async (req, res) => {
        try {
            const { q, tipo } = req.query;
            let query = 'SELECT * FROM entidades WHERE 1=1';
            const params = [];

            if (tipo) {
                query += ' AND tipo = ?';
                params.push(tipo);
            }
            if (q) {
                query += ' AND (nombre_razon ILIKE ? OR rif ILIKE ?)';
                params.push(`%${q}%`, `%${q}%`);
            }

            query += ' ORDER BY nombre_razon ASC';
            const entidades = await db.queryAsync(query, params);
            res.json({ success: true, data: entidades });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener entidades' });
        }
    },

    // Crear Entidad
    create: async (req, res) => {
        try {
            const { tipo, nombre_razon, rif, direccion, telefono, email } = req.body;
            
            if (!tipo || !nombre_razon || !rif) {
                return res.status(400).json({ error: 'Tipo, Razón Social y RIF son obligatorios' });
            }

            const info = await db.runAsync(
                'INSERT INTO entidades (tipo, nombre_razon, rif, direccion, telefono, email) VALUES (?, ?, ?, ?, ?, ?)',
                [tipo, nombre_razon.toUpperCase(), rif.toUpperCase(), direccion, telefono, email]
            );

            res.json({ success: true, message: 'Entidad registrada con éxito', id: info.lastID });
        } catch (error) {
            console.error(error);
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El RIF ingresado ya existe en la base de datos' });
            }
            res.status(500).json({ error: 'Error al crear la entidad' });
        }
    },

    // Actualizar Entidad
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { tipo, nombre_razon, rif, direccion, telefono, email } = req.body;
            
            if (!tipo || !nombre_razon || !rif) {
                return res.status(400).json({ error: 'Tipo, Razón Social y RIF son obligatorios' });
            }

            await db.runAsync(
                'UPDATE entidades SET tipo = ?, nombre_razon = ?, rif = ?, direccion = ?, telefono = ?, email = ? WHERE id = ?',
                [tipo, nombre_razon.toUpperCase(), rif.toUpperCase(), direccion, telefono, email, id]
            );

            res.json({ success: true, message: 'Entidad actualizada con éxito' });
        } catch (error) {
            console.error(error);
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El RIF ingresado ya existe en la base de datos' });
            }
            res.status(500).json({ error: 'Error al actualizar la entidad' });
        }
    },

    // Eliminar Entidad
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await db.runAsync('DELETE FROM entidades WHERE id = ?', [id]);
            res.json({ success: true, message: 'Entidad eliminada' });
        } catch (error) {
            res.status(500).json({ error: 'No se puede eliminar la entidad (Puede que tenga facturas asociadas)' });
        }
    },

    // Obtener facturas de un cliente específico
    getInvoices: async (req, res) => {
        try {
            const { id } = req.params;
            const sql = "SELECT * FROM facturas WHERE cliente_id = ? AND estado = 'emitida' ORDER BY fecha DESC";
            const data = await db.queryAsync(sql, [id]);
            res.json({ success: true, data });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al obtener facturas del cliente' });
        }
    }
};

module.exports = entidadesController;
