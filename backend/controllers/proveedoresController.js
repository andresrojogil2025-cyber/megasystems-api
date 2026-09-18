const { queryAsync, runAsync } = require('../db');

const proveedoresController = {
    getAll: async (req, res) => {
        try {
            const rows = await queryAsync("SELECT * FROM proveedores WHERE activo = TRUE ORDER BY nombre ASC");
            res.json({ success: true, data: rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    },

    create: async (req, res) => {
        try {
            const { nombre, rif, empresa, telefono, email, notas } = req.body;
            if (!nombre) return res.status(400).json({ success: false, error: 'Nombre es obligatorio' });
            const r = await runAsync(
                "INSERT INTO proveedores (nombre, rif, empresa, telefono, email, notas) VALUES (?, ?, ?, ?, ?, ?)",
                [nombre, rif || null, empresa || null, telefono || null, email || null, notas || null]
            );
            res.json({ success: true, id: r.lastID });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { nombre, rif, empresa, telefono, email, notas } = req.body;
            await runAsync(
                "UPDATE proveedores SET nombre=?, rif=?, empresa=?, telefono=?, email=?, notas=? WHERE id=?",
                [nombre, rif || null, empresa || null, telefono || null, email || null, notas || null, id]
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    },

    delete: async (req, res) => {
        try {
            await runAsync("UPDATE proveedores SET activo = FALSE WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    }
};

module.exports = proveedoresController;
