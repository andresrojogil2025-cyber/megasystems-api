const { queryAsync, runAsync } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (e) {}

let Tesseract;
try { Tesseract = require('tesseract.js'); } catch (e) {}

let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {}

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

// Multer en memoria para parse — acepta PDF e imágenes
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) return cb(new Error('Solo PDF o imagen'));
        cb(null, true);
    }
});

function parseNum(str) {
    if (!str) return NaN;
    // Maneja "1.200,50" y "1,200.50" y "1200.50" y "1200,50"
    str = str.trim();
    const hasComa = str.includes(',');
    const hasPunto = str.includes('.');
    if (hasComa && hasPunto) {
        // Quien viene último es el decimal
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else if (hasComa) {
        str = str.replace(',', '.');
    }
    return parseFloat(str);
}

function extraerItemsDeTexto(text) {
    const items = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const skipLine = /^(descripci|c[oó]dig|cant\.?$|precio|total|sub[\s-]?total|iva|base\s*imp|fecha|cliente|rif|nit|p[aá]g|factura\s*n|presupuesto\s*n|nota\s*de|condici|vendedor|direcci|tel[eé]f|forma\s*de\s*pago|cuota|observa|firma|recib|moneda|tasa|bol[ií]var|descuento|tipo\s*de|precios\s*sujeto)/i;

    for (const line of lines) {
        if (skipLine.test(line)) continue;
        // Línea solo de números/símbolos → saltar
        if (/^[\d\s.,\-\+%$€\/:()]+$/.test(line)) continue;
        // Menos de 2 palabras con letras → probablemente no es un producto
        const palabras = line.split(/\s+/).filter(t => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,}/.test(t));
        if (palabras.length < 2) continue;

        const tokens = line.split(/\s+/);
        // Encontrar todos los tokens numéricos (precios o cantidades)
        const numTokens = [];
        for (let i = 0; i < tokens.length; i++) {
            if (/^\d[\d.,]*$/.test(tokens[i]) && tokens[i].length >= 1) {
                numTokens.push({ idx: i, val: parseNum(tokens[i]), raw: tokens[i] });
            }
        }
        if (numTokens.length < 2) continue;

        // Estrategia: la cantidad suele ser un entero pequeño (1-999)
        // y el precio viene justo después como número decimal
        let qty = null, precio = null, qtyIdx = -1;

        for (let k = 0; k < numTokens.length - 1; k++) {
            const t = numTokens[k];
            const next = numTokens[k + 1];
            // Qty: entero sin decimales, entre 1 y 9999
            if (/^\d{1,4}$/.test(t.raw) && t.val >= 1 && t.val <= 9999) {
                // Siguiente debe ser precio (tiene decimales o es mayor)
                if (!isNaN(next.val) && next.val > 0) {
                    qty = t.val;
                    precio = next.val;
                    qtyIdx = t.idx;
                    break;
                }
            }
        }
        if (!qty || !precio) continue;

        // Descripción = tokens antes de la cantidad (saltando código numérico inicial)
        const descTokens = tokens.slice(0, qtyIdx);
        const descStart = /^\d{2,8}$/.test(descTokens[0]) ? 1 : 0;
        const desc = descTokens.slice(descStart).join(' ').trim();
        if (desc.length < 3 || !/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(desc)) continue;

        items.push({ descripcion: desc, cantidad: qty, costo_usd: precio });
    }
    return items.slice(0, 80);
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
        if (!req.file) return res.json({ success: true, items: [], metodo: 'ninguno' });
        const mime = req.file.mimetype;
        try {
            // ── Opción 1: Google Gemini Vision (mejor precisión para imágenes) ──
            const geminiKey = process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_CLOUD_VISION_KEY;
            if (geminiKey && mime.startsWith('image/')) {
                // Intentar primero gemini-2.0-flash (vision nativo), luego gemini-3.6-flash
                const geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.6-flash'];
                for (const model of geminiModels) {
                    try {
                        const base64 = req.file.buffer.toString('base64');
                        console.log(`[Gemini] Probando modelo ${model}, mime=${mime}, size=${req.file.buffer.length}`);
                        const gRes = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [
                                        { inline_data: { mime_type: mime, data: base64 } },
                                        { text: 'Extrae TODOS los productos/ítems de esta factura o presupuesto. Devuelve ÚNICAMENTE un JSON array sin texto adicional antes ni después:\n[{"descripcion":"nombre exacto del producto","cantidad":1,"costo_usd":0.00}]\nSi el precio está en bolívares, ponlo en costo_usd como si fueran USD. Si no hay precio usa 0. Incluye TODOS los ítems, uno por elemento del array.' }
                                    ]}],
                                    generationConfig: { temperature: 0, maxOutputTokens: 2048 }
                                })
                            }
                        );
                        const gData = await gRes.json();
                        console.log(`[Gemini] status=${gRes.status} candidates=${gData.candidates?.length ?? 0} error=${gData.error?.message ?? 'none'}`);
                        if (gData.error) { console.error(`[Gemini ${model}] API error:`, gData.error.message); continue; }
                        const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        console.log(`[Gemini] rawText length=${rawText.length} preview=${rawText.substring(0, 120)}`);
                        if (rawText) {
                            const jsonStr = rawText.trim().replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (Array.isArray(parsed) && parsed.length) {
                                    console.log(`[Gemini] OK con ${model}: ${parsed.length} items`);
                                    return res.json({ success: true, items: parsed, metodo: 'gemini' });
                                }
                            } catch (parseErr) {
                                console.error(`[Gemini ${model}] JSON.parse error:`, parseErr.message, '| preview:', jsonStr.substring(0, 150));
                            }
                        }
                    } catch (eg) {
                        console.error(`[Gemini ${model}]`, eg.message);
                    }
                }
            }

            // ── Opción 2: Google Cloud Vision (imágenes) ──────────────────────
            if (process.env.GOOGLE_CLOUD_VISION_KEY && mime.startsWith('image/')) {
                try {
                    const base64 = req.file.buffer.toString('base64');
                    const visionRes = await fetch(
                        `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                requests: [{
                                    image: { content: base64 },
                                    features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
                                }]
                            })
                        }
                    );
                    const visionData = await visionRes.json();
                    const text = visionData.responses?.[0]?.fullTextAnnotation?.text || '';
                    if (text.length > 20) {
                        const items = extraerItemsDeTexto(text);
                        return res.json({ success: true, items, metodo: 'vision' });
                    }
                } catch (e2) {
                    console.error('[Google Vision]', e2.message);
                }
            }

            // ── Opción 3: pdf-parse para PDFs con texto ───────────────────────
            if (mime === 'application/pdf' && pdfParse) {
                const data = await pdfParse(req.file.buffer);
                const items = extraerItemsDeTexto(data.text);
                return res.json({ success: true, items, metodo: 'pdf' });
            }

            // ── Opción 4: Tesseract OCR (fallback sin API key) ────────────────
            if (mime.startsWith('image/') && Tesseract) {
                const result = await Tesseract.recognize(req.file.buffer, 'spa+eng', { logger: () => {} });
                const items = extraerItemsDeTexto(result.data.text);
                return res.json({ success: true, items, metodo: 'ocr' });
            }

            res.json({ success: true, items: [], metodo: 'ninguno' });
        } catch (e) {
            console.error('[parseFactura]', e.message);
            res.json({ success: true, items: [], metodo: 'error' });
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
                // Actualizar stock y recalcular precio si el ítem está vinculado al catálogo
                if (item.catalogo_id) {
                    await runAsync(
                        "UPDATE catalogo SET stock = COALESCE(stock, 0) + ? WHERE id = ?",
                        [parseInt(item.cantidad), item.catalogo_id]
                    );
                    // Si viene costo de la factura y el producto tiene margen, recalcular precio
                    const nuevoCosto = parseFloat(item.costo_usd) || 0;
                    if (nuevoCosto > 0) {
                        const catRows = await queryAsync("SELECT margen_ganancia FROM catalogo WHERE id = ?", [item.catalogo_id]);
                        if (catRows.length && parseFloat(catRows[0].margen_ganancia) > 0) {
                            const margen = parseFloat(catRows[0].margen_ganancia);
                            const nuevoPrecio = +(nuevoCosto * (1 + margen / 100)).toFixed(2);
                            await runAsync(
                                "UPDATE catalogo SET costo_usd = ?, precio_usd = ? WHERE id = ?",
                                [nuevoCosto, nuevoPrecio, item.catalogo_id]
                            );
                        }
                    }
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
    },

    addItemToCatalogo: async (req, res) => {
        try {
            const { itemId } = req.params;
            const { nombre, tipo, precio_usd, costo_usd, margen_ganancia, stock } = req.body;
            const items = await queryAsync('SELECT * FROM compras_items WHERE id = ?', [itemId]);
            if (!items.length) return res.status(404).json({ success: false, error: 'Ítem no encontrado' });
            const item = items[0];
            if (item.catalogo_id) return res.json({ success: true, catalogo_id: item.catalogo_id, message: 'Ya está en catálogo' });
            const finalStock = tipo === 'servicio' ? null : (parseInt(stock) || 0);
            const costo = parseFloat(costo_usd) || parseFloat(item.costo_usd) || 0;
            const margen = parseFloat(margen_ganancia) || 0;
            const precio = parseFloat(precio_usd) || (costo > 0 ? +(costo * (1 + margen / 100)).toFixed(2) : 0);
            const r = await runAsync(
                'INSERT INTO catalogo (tipo, nombre, precio_usd, costo_usd, margen_ganancia, stock) VALUES (?, ?, ?, ?, ?, ?)',
                [tipo || 'producto', nombre, precio, costo, margen, finalStock]
            );
            const catalogoId = r.lastID;
            await runAsync('UPDATE compras_items SET catalogo_id = ? WHERE id = ?', [catalogoId, itemId]);
            res.json({ success: true, catalogo_id: catalogoId });
        } catch (e) {
            console.error('[addItemToCatalogo]', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    }
};

module.exports = comprasController;
