const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { queryAsync } = require('../db');

// Estado global de WhatsApp
let wpClient = null;
let qrCodeBase64 = null;
let isConnected = false;

// Inicializa el cliente una sola vez al cargar el módulo
const initializeWPClient = () => {
    if (wpClient) return;
    
    console.log('[WhatsApp] Inicializando sesión de Node...');
    wpClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
        }
    });

    wpClient.on('qr', async (qr) => {
        console.log('[WhatsApp] QR Generado, esperando escaneo...');
        isConnected = false;
        try {
            qrCodeBase64 = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
        } catch (err) {
            console.error('[WhatsApp] Error convirtiendo QR a Base64:', err);
        }
    });

    wpClient.on('ready', () => {
        console.log('[WhatsApp] ¡Cliente listo y conectado exitosamente!');
        isConnected = true;
        qrCodeBase64 = null; // Limpiar QR
    });

    wpClient.on('authenticated', () => {
        console.log('[WhatsApp] Sesión autenticada.');
    });

    wpClient.on('auth_failure', msg => {
        console.error('[WhatsApp] Fallo en la autenticación:', msg);
        isConnected = false;
    });

    wpClient.on('disconnected', (reason) => {
        console.log('[WhatsApp] Cliente desconectado. Razón:', reason);
        isConnected = false;
        qrCodeBase64 = null;
        wpClient.destroy();
        wpClient = null;
        // Iniciar de nuevo en 5 seg
        setTimeout(initializeWPClient, 5000);
    });

    wpClient.initialize().catch(err => {
        console.error('[WhatsApp] Error FATAL iniciando el navegador:', err.message);
        // Marcamos error en el QR guardando el texto, el frontend luego podría interpretarlo si se adapta, 
        // pero principalmente lo dejamos en log para que el usuario avise.
    });
};

// Iniciar de inmediato al requirir el archivo
initializeWPClient();

/**
 * 1. Obtener estado de conexión y código QR
 */
const getStatus = (req, res) => {
    if (isConnected) {
        return res.json({ success: true, status: 'CONNECTED' });
    }
    
    if (qrCodeBase64) {
        return res.json({ success: true, status: 'QR_READY', qrBase64: qrCodeBase64 });
    }
    
    return res.json({ success: true, status: 'CONNECTING' });
};

/**
 * Función auxiliar para formatear número al estándar de WhatsApp (Ej: 58414XXXXXXX@c.us)
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let clean = phone.replace(/[\s\-\+]/g, ''); // Quitar espacios, +, -
    
    if (clean.startsWith('04')) {
        // 04141234567 -> 584141234567
        clean = '58' + clean.substring(1);
    } else if (clean.length === 10 && clean.startsWith('4')) {
        // 4141234567 -> 584141234567
        clean = '58' + clean;
    }
    
    // Si no tiene el largo aproximado de ve, rechazar
    // Normalmente miden 12 con el 58.
    if (clean.length < 10) return null;
    
    return `${clean}@c.us`;
};

/**
 * Retraso asíncrono para evitar spam
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * 2. Enviar Recordatorios Masivos del Mes Actual
 */
const sendReminders = async (req, res) => {
    if (!isConnected || !wpClient) {
        return res.status(400).json({ success: false, error: 'El WhatsApp no está conectado. Por favor, escanea el QR en el panel primero.' });
    }

    try {
        const sql = `
            SELECT id, celular, nombre 
            FROM clientes_internet 
            WHERE estado = 'activo' 
              AND celular IS NOT NULL 
              AND length(celular) >= 10
              AND (fecha_promesa_pago IS NULL OR fecha_promesa_pago <= CURRENT_DATE) 
              AND id NOT IN (
                SELECT cliente_id 
                FROM pagos_internet 
                WHERE EXTRACT(MONTH FROM fecha_pago) = EXTRACT(MONTH FROM CURRENT_DATE)
                  AND EXTRACT(YEAR FROM fecha_pago) = EXTRACT(YEAR FROM CURRENT_DATE)
              )
        `;
        
        const deudores = await queryAsync(sql);
        
        if (!deudores || deudores.length === 0) {
            return res.status(200).json({ success: true, message: 'No hay clientes activos que deban este mes. Todos están al día.' });
        }

        // Dejar que se ejecute en el background devolviendo la respuesta rápida al usuario para que no se tranque el frontend
        res.status(200).json({ 
            success: true, 
            message: `Verificación finalizada. Se comenzará a enviar WhatsApp progresivo a ${deudores.length} cliente(s).` 
        });

        console.log(`[WhatsApp] Iniciando envío de recordatorios masivos a ${deudores.length} personas...`);
        let enviados = 0;
        let omitidos = 0;

        for (const cliente of deudores) {
            const numFormateado = formatPhoneNumber(cliente.celular);
            if (!numFormateado) {
                console.log(`[WhatsApp] Número omitido por formato inválido: ${cliente.nombre} (${cliente.celular})`);
                omitidos++;
                continue;
            }

            let mensajeBase = req.body.mensaje || `*Megasystems - Recordatorio de Pago* 🔔

Hola *[Nombre]*, esperamos que tengas un maravilloso día.

Te escribimos para recordarte amablemente tu pago del servicio de internet por el mes en curso. ¡Gracias por tu preferencia!`;

            // Remplazar "[Nombre]" independientemente si se escribió en mayúsculas o minúsculas
            const mensajeFinal = mensajeBase.replace(/\[[Nn]ombre\]/g, cliente.nombre);

            try {
                // Verificar si está registrado en wp (opcional, pero ayuda)
                // const isRegistered = await wpClient.isRegisteredUser(numFormateado);
                
                await wpClient.sendMessage(numFormateado, mensajeFinal);
                console.log(`✅ MSG Enviado a: ${cliente.nombre} (${numFormateado})`);
                enviados++;
                
                // Delay aleatorio entre 3.0s y 5.5s para no parecer robot masivo
                const waitTime = Math.floor(Math.random() * (5500 - 3000 + 1)) + 3000;
                await delay(waitTime);

            } catch (errSend) {
                console.error(`❌ Error enviando a ${cliente.nombre} (${numFormateado}):`, errSend.message);
                omitidos++;
            }
        }

        console.log(`[WhatsApp] Ciclo de envíos finalizado. Exitosos: ${enviados}. Omitidos/Errados: ${omitidos}.`);

    } catch (error) {
        console.error('[WhatsApp] Error consultando y enviando los recordatorios:', error);
    }
};

module.exports = {
    getStatus,
    sendReminders
};
