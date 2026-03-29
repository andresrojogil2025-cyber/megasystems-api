const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');

const bcvController = {
    // Obtener tasa oficial del dólar desde la página web del Banco Central de Venezuela
    getBcvRate: async (req, res) => {
        try {
            // Intentar extraer la tasa actual directamente de la DB si es reciente (ej. menos de 4 horas) para evitar bloqueos
            const savedRate = await db.queryAsync("SELECT tasa_bcv_manual, fecha_actualizacion_tasa FROM configuracion_visual ORDER BY id DESC LIMIT 1");
            
            // Hacer scraping a la página del BCV (evitando TLS error)
            const response = await axios.get('https://www.bcv.org.ve', {
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }), // A veces el certificado del BCV falla
                timeout: 5000 // 5 segundos max
            });
            
            const $ = cheerio.load(response.data);
            
            // CSS selector para la caja del dólar (clase '.centrado strong' dentro del div del dolar '#dolar')
            const rateText = $('#dolar .centrado strong').text().trim();
            let rateValue = parseFloat(rateText.replace(',', '.'));
            
            if (rateValue && !isNaN(rateValue)) {
                // Redondear a 2 decimales para los cálculos fiscales requeridos
                rateValue = Math.round(rateValue * 100) / 100;
                
                // Guardarlo en DB para tener un backup en caso de caída
                await db.runAsync("UPDATE configuracion_visual SET tasa_bcv_manual = ?, fecha_actualizacion_tasa = CURRENT_TIMESTAMP WHERE id = (SELECT MAX(id) FROM configuracion_visual)", [rateValue]);
                
                // --- NUEVO: Guardar en Historial Diario ---
                const hoy = new Date().toISOString().split('T')[0];
                await db.runAsync("INSERT INTO historial_tasas (fecha, tasa) VALUES (?, ?) ON CONFLICT (fecha) DO UPDATE SET tasa = EXCLUDED.tasa", [hoy, rateValue]);

                return res.json({
                    success: true,
                    rate: rateValue,
                    source: "Scraping Oficial (BCV Web)",
                    time: new Date()
                });
            } else {
                throw new Error("Formato de tasa BCV inesperado extraído de la web.");
            }

        } catch (error) {
            console.error("Error obteniendo tasa BCV (Fallback a base de datos manual):", error.message);
            // Recuperar respaldo manual si falla el scraping
            const fallback = await db.queryAsync("SELECT tasa_bcv_manual, fecha_actualizacion_tasa FROM configuracion_visual ORDER BY id DESC LIMIT 1");
            
            if(fallback.length > 0 && fallback[0].tasa_bcv_manual > 0) {
                res.json({
                    success: true,
                    rate: fallback[0].tasa_bcv_manual,
                    source: "Copia Manual Local (Fallback)",
                    time: fallback[0].fecha_actualizacion_tasa
                });
            } else {
                res.status(500).json({ error: "No se pudo obtener la tasa BCV y no hay respaldo manual definido." });
            }
        }
    },

    // Permite al Administrador asignar una tasa manualmente si el sistema cae
    setManualRate: async (req, res) => {
        try {
            const { rate, fecha } = req.body; // 'fecha' es opcional (YYYY-MM-DD)
            if(!rate || isNaN(rate)) return res.status(400).json({error: "Tasa inválida"});

            const rateRounded = Math.round(parseFloat(rate) * 100) / 100;
            
            // Si no hay fecha, asumimos que es para la configuración general (última tasa)
            if (!fecha || fecha === new Date().toISOString().split('T')[0]) {
                await db.runAsync("UPDATE configuracion_visual SET tasa_bcv_manual = ?, fecha_actualizacion_tasa = CURRENT_TIMESTAMP WHERE id = (SELECT MAX(id) FROM configuracion_visual)", [rateRounded]);
            }
            
            // Guardar o actualizar en el historial para la fecha indicada (o hoy por defecto)
            const fechaFinal = fecha || new Date().toISOString().split('T')[0];
            await db.runAsync("INSERT INTO historial_tasas (fecha, tasa) VALUES (?, ?) ON CONFLICT (fecha) DO UPDATE SET tasa = EXCLUDED.tasa", [fechaFinal, rateRounded]);

            res.json({ success: true, message: `Tasa registrada para el ${fechaFinal}: ${rateRounded} VES/USD`});
        } catch (error) {
            console.error("Error en setManualRate:", error);
            res.status(500).json({error: "Error actualizando tasa."});
        }
    },

    // NUEVO: Obtener tasa de una fecha específica
    getRateByDate: async (req, res) => {
        try {
            const { fecha } = req.params; // Formato YYYY-MM-DD
            if(!fecha) return res.status(400).json({error: "Fecha requerida"});

            const rows = await db.queryAsync("SELECT tasa FROM historial_tasas WHERE fecha = ?", [fecha]);
            
            if(rows.length > 0) {
                res.json({ success: true, rate: rows[0].tasa, source: "Historial DB" });
            } else {
                // Si no existe, intentar devolver la tasa manual actual como fallback o 0
                const current = await db.queryAsync("SELECT tasa_bcv_manual FROM configuracion_visual ORDER BY id DESC LIMIT 1");
                res.json({ 
                    success: false, 
                    message: "No hay tasa registrada para esta fecha.",
                    fallbackRate: current.length > 0 ? current[0].tasa_bcv_manual : 0
                });
            }
        } catch (error) {
            res.status(500).json({error: "Error al consultar historial de tasas."});
        }
    }
};

module.exports = bcvController;
