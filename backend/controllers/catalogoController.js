const db = require('../db');

const catalogoController = {
    // Obtener catálogo
    getAll: async (req, res) => {
        try {
            const { q, tipo } = req.query;
            let query = 'SELECT * FROM catalogo WHERE activo = TRUE';
            const params = [];

            if (tipo) {
                query += ' AND tipo = ?';
                params.push(tipo);
            }
            if (q) {
                query += ' AND (nombre ILIKE ? OR descripcion ILIKE ?)';
                params.push(`%${q}%`, `%${q}%`);
            }

            query += ' ORDER BY nombre ASC';
            const items = await db.queryAsync(query, params);
            res.json({ success: true, data: items });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error obteniendo catálogo' });
        }
    },

    // Registrar Producto o Servicio
    create: async (req, res) => {
        try {
            const { tipo, nombre, descripcion, precio_usd, stock } = req.body;
            
            if (!tipo || !nombre || isNaN(precio_usd)) {
                return res.status(400).json({ error: 'Faltan datos obligatorios (Tipo, Nombre, Precio)' });
            }

            // Si es servicio, el stock debe ser null
            const finalStock = tipo === 'servicio' ? null : (parseInt(stock) || 0);

            const info = await db.runAsync(
                'INSERT INTO catalogo (tipo, nombre, descripcion, precio_usd, stock) VALUES (?, ?, ?, ?, ?)',
                [tipo, nombre, descripcion, parseFloat(precio_usd), finalStock]
            );

            res.json({ success: true, message: `${tipo === 'producto' ? 'Producto' : 'Servicio'} registrado en catálogo`, id: info.lastID });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al registrar el item' });
        }
    },

    // Eliminar Lógico
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            await db.runAsync('UPDATE catalogo SET activo = FALSE WHERE id = ?', [id]);
            res.json({ success: true, message: 'Ítem inhabilitado del catálogo' });
        } catch (error) {
            res.status(500).json({ error: 'Error al eliminar el item' });
        }
    }
};

module.exports = catalogoController;
