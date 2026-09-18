const { queryAsync, runAsync } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (e) {}

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

// Multer en memoria para parse (no guarda archivo)
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') return cb(new Error('Solo PDFs'));
        cb(null, true);
    }
});

function extraerItemsDeTexto(text) {
    const items = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 8);
    const skipWords = /^(descripci|codigo|cant|precio|total|sub.total|iva|base|fecha|cliente|rif|nit|pag|factura|presupuesto|nota|condici|vendedor|dire|telef|forma|cuota|observa|firma|recib|moneda|tasa|bolivar|usd|dolar)/i;

    for (const line of lines) {
        if (skipWords.test(line)) continue;
        if (/^[\d\s.,\-\+%$€\/]+$/.test(line)) continue;
        if (line.split(' ').filter(t => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(t)).length < 2) continue;

        const tokens = line.split(/\s+/);

        // Buscar primer token con formato precio: dígitos + coma/punto + 2 decimales
        let priceIdx = -1;
        for (let i = 1; i < tokens.length; i++) {
            if (/^\d[\d.]*,\d{2}$/.test(tokens[i]) || /^\d+\.\d{2}$/.test(tokens[i])) {
                priceIdx = i;
                break;
            }
        }
        if (priceIdx < 2) continue;

        // Token anterior al precio debe ser cantidad (entero 1-10000)
        const qtyToken = tokens[priceIdx - 1];
        if (!/^\d{1,5}$/.test(qtyToken)) continue;
        const qty = parseInt(qtyToken);
        if (qty < 1 || qty > 10000) continue;

        const priceStr = tokens[priceIdx].replace(/\./g, '').replace(',', '.');
        const precio = parseFloat(priceStr);
        if (isNaN(precio) || precio <= 0) continue;

        // Descripción = todo antes de la cantidad
        const descTokens = tokens.slice(0, priceIdx - 1);
        const descStart = /^\d{3,8}$/.test(descTokens[0]) ? 1 : 0;
        const desc = descTokens.slice(descStart).join(' ').trim();
        if (desc.length < 3) continue;

        items.push({ descripcion: desc, cantidad: qty, costo_usd: precio });
    }
    return items.slice(0, 60);
}

const genCodigo = async () => {
    const year = new Date().getFullYear();
    const rows = await queryAsync("SELECT COUNT(*) as total FROM compras WHERE EXTRACT(YEAR FROM created_at) = ?", [year]);
    const next = (parseInt(rows[0].total) || 0) + 1;
    return `COMP-${year}-${String(next).padStart(4, '0')}`;
};

const comprasController = {
    upload: upload.single('factura'),
    uploadMemoryMiddleware: uploadMemory.single('factura'),

    parseFactura: async (req, res) => {
        try {
            if (!req.file || !pdfParse) return res.json({ success: true, items: [] });
            const data = await pdfParse(req.file.buffer);
            const items = extraerItemsDeTexto(data.text);
            res.json({ success: true, items });
        } catch (e) {
            console.error('[parseFactura]', e.message);
            res.json({ success: true, items: [] });
        }
    },

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
