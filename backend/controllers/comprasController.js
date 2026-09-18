const { queryAsync, runAsync } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Multer: imágenes y PDFs de facturas ──────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'frontend', 'uploads', 'facturas');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `factura-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (!allowed.includes(file.mimetype)) return cb(new Error('Solo imágenes o PDF.'));
        cb(null, true);
    }
});

const genCodigo = async () => {
    const year = new Date().getFullYear();
    const rows = await queryAsync("SELECT COUNT(*) as total FROM compras WHERE EXTRACT(YEAR FROM created_at) = ?", [year]);
    const next = (parseInt(rows[0].total) || 0) + 1;
    return `COMP-${year}-${String(next).padStart(4, '0')}`;
};

const comprasController = {
    upload: upload.single('factura'),

    getAll: async (req, res) => {
        try {
            const compras = await queryAsync(`
                SELECT c.*, p.nombre as proveedor_nombre, p.rif as proveedor_rif
                FROM compras c
                LEFT JOIN proveedores p ON c.proveedor_id = p.id
                ORDER BY c.created_at DESC
            `);
            for (const c of compras) {
                c.items = await queryAsync("SELECT * FROM compras_items WHERE compra_id = ?", [c.id]);
            }
            res.json({ success: true, data: compras });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    },

    create: async (req, res) => {
        try {
            const { proveedor_id, fecha_compra, factura_proveedor, notas, items } = req.body;
            const itemsParsed = typeof items === 'string' ? JSON.parse(items) : (items || []);

            if (!itemsParsed.length) return res.status(400).json({ success: false, error: 'Agrega al menos un ítem' });

            const total_usd = itemsParsed.reduce((s, i) => s + (parseFloat(i.costo_usd) * parseInt(i.cantidad)), 0);
            const codigo = await genCodigo();
            const facturaImagen = req.file ? `/uploads/facturas/${req.file.filename}` : null;

            const r = await runAsync(
                "INSERT INTO compras (codigo, proveedor_id, fecha_compra, factura_proveedor, total_usd, notas, factura_imagen) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [codigo, proveedor_id || null, fecha_compra || null, factura_proveedor || null, total_usd, notas || null, facturaImagen]
            );
            const compraId = r.lastID;

            for (const item of itemsParsed) {
                const subtotal = parseFloat(item.costo_usd) * parseInt(item.cantidad);
                await runAsync(
                    "INSERT INTO compras_items (compra_id, catalogo_id, nombre_item, cantidad, costo_usd, subtotal_usd) VALUES (?, ?, ?, ?, ?, ?)",
                    [compraId, item.catalogo_id || null, item.nombre_item, parseInt(item.cantidad), parseFloat(item.costo_usd) || 0, subtotal]
                );
                // Actualizar stock si el ítem está vinculado al catálogo
                if (item.catalogo_id) {
                    await runAsync(
                        "UPDATE catalogo SET stock = COALESCE(stock, 0) + ? WHERE id = ?",
                        [parseInt(item.cantidad), item.catalogo_id]
                    );
                }
            }

            res.json({ success: true, codigo, id: compraId });
        } catch (e) {
            console.error('[Compras POST]', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    },

    uploadFactura: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió archivo' });
            const url = `/uploads/facturas/${req.file.filename}`;
            await runAsync("UPDATE compras SET factura_imagen = ? WHERE id = ?", [url, req.params.id]);
            res.json({ success: true, url });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    }
};

module.exports = comprasController;
