const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno ANTES de cualquier uso
dotenv.config({ override: true });

const cron = require('node-cron');

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3050;

process.on('uncaughtException', (err) => {
    console.error('💥 CRASH EXCEPCIÓN NO CAPTURADA:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 RECHAZO DE PROMESA NO CAPTURADO en:', promise, 'razón:', reason);
});

// Configuración de Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Servir el frontend como archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// --- RUTAS DE LA API (Endpoints) ---
const authController = require('./controllers/authController');
const billerController = require('./controllers/billerController');
const seniatController = require('./controllers/seniatController');
const sectoresController = require('./controllers/sectoresController');
const bcvController = require('./controllers/bcvController');
const entidadesController = require('./controllers/entidadesController');
const catalogoController = require('./controllers/catalogoController');
const usuariosController = require('./controllers/usuariosController');
const retencionesController = require('./controllers/retencionesController');
const cuentasController = require('./controllers/cuentasController');
const mikrotikController = require('./controllers/mikrotikController');
const { enviarCobranzaAutomatica } = require('./controllers/whatsappController');
const whatsappController = require('./controllers/whatsappController');
const notaEntregaController = require('./controllers/notaEntregaController');
const recibosController = require('./controllers/recibosController');
const proveedoresController = require('./controllers/proveedoresController');
const comprasController = require('./controllers/comprasController');

// Rutas de Configuración Visual, Tasa BCV y Login
app.get('/api/config/visual', authController.getVisualConfig);
app.post('/api/config/visual', authController.updateVisualConfig);
app.post('/api/config/upload', authController.uploadImage);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/seed', authController.seedAdmin);
app.get('/api/bcv/rate', bcvController.getBcvRate);
app.post('/api/bcv/rate-manual', bcvController.setManualRate);
app.get('/api/bcv/rate/:fecha', bcvController.getRateByDate);

// Rutas CRUD Básicas
app.get('/api/entidades', entidadesController.getAll);
app.post('/api/entidades', entidadesController.create);
app.put('/api/entidades/:id', entidadesController.update);
app.delete('/api/entidades/:id', entidadesController.delete);
app.get('/api/entidades/:id/facturas', entidadesController.getInvoices);

app.get('/api/catalogo', catalogoController.getAll);
app.post('/api/catalogo', catalogoController.create);
app.put('/api/catalogo/:id', catalogoController.update);
app.delete('/api/catalogo/:id', catalogoController.delete);

app.get('/api/usuarios', usuariosController.getAll);
app.post('/api/usuarios', usuariosController.create);
app.put('/api/usuarios/:id', usuariosController.update);
app.delete('/api/usuarios/:id', usuariosController.delete);

// Rutas de Cotizaciones y Facturación
app.get('/api/billing/quotes', billerController.getQuotes);
app.get('/api/billing/quote/:id', billerController.getQuoteDetails);
app.post('/api/billing/quote', billerController.createQuote);
app.post('/api/billing/invoice', billerController.createInvoice);

// Rutas de Notas de Entrega
app.get('/api/notas-entrega', notaEntregaController.getAll);
app.get('/api/notas-entrega/:id', notaEntregaController.getDetails);
app.post('/api/notas-entrega', notaEntregaController.create);

// Rutas de Recibos de Pago
app.get('/api/recibos', recibosController.getAll);
app.get('/api/recibos/:id', recibosController.getDetails);
app.post('/api/recibos', recibosController.create);

// Rutas de Proveedores y Compras
app.get('/api/proveedores', proveedoresController.getAll);
app.post('/api/proveedores', proveedoresController.create);
app.put('/api/proveedores/:id', proveedoresController.update);
app.delete('/api/proveedores/:id', proveedoresController.delete);

app.get('/api/compras', comprasController.getAll);
app.post('/api/compras', comprasController.upload, comprasController.create);
app.post('/api/compras/parse-factura', comprasController.uploadMemoryMiddleware, comprasController.parseFactura);
app.post('/api/compras/:id/factura', comprasController.upload, comprasController.uploadFactura);
app.post('/api/compras/items/:itemId/al-catalogo', comprasController.addItemToCatalogo);

// Rutas de Retenciones
app.get('/api/retenciones', retencionesController.getAll);
app.post('/api/retenciones', retencionesController.create);
app.delete('/api/retenciones/:id', retencionesController.delete);

// Rutas de Cuentas por Cobrar
app.get('/api/cuentas', cuentasController.getAll);
app.post('/api/cuentas', cuentasController.create);
app.put('/api/cuentas/:id', cuentasController.update);
app.post('/api/cuentas/:id/abonos', cuentasController.createAbono);
app.get('/api/cuentas/:id/abonos', cuentasController.getAbonos);
app.get('/api/abonos/:id', cuentasController.getAbonoDetail);

// Rutas Integración ISP MikroTik
app.get('/api/mikrotik/clientes', mikrotikController.getClientes);
app.get('/api/mikrotik/test', mikrotikController.testConnection);
app.get('/api/mikrotik/importar', mikrotikController.importarClientes);
app.post('/api/mikrotik/suspender', mikrotikController.suspenderCliente);
app.post('/api/mikrotik/reactivar', mikrotikController.reactivarCliente);
app.post('/api/mikrotik/eliminar', mikrotikController.eliminarCliente);
app.post('/api/mikrotik/promesa-pago', mikrotikController.promesaPago);

// Estado de Cuenta
app.get('/api/mikrotik/clientes/:id/deudas', mikrotikController.obtenerDeudas);
app.post('/api/mikrotik/deudas', mikrotikController.crearDeuda);

// Configuración de cliente
app.put('/api/mikrotik/clientes/:id/corte-automatico', mikrotikController.toggleCorteAutomatico);

// Control Libre de Mikrotik
app.post('/api/mikrotik/activar-libre', mikrotikController.activarLibre);
app.post('/api/mikrotik/suspender-libre', mikrotikController.suspenderLibre);

// Sectores
app.get('/api/mikrotik/sectores', sectoresController.getSectores);
app.post('/api/mikrotik/sectores', sectoresController.createSector);

// Pago manual del mes
app.post('/api/mikrotik/clientes/:id/pago-mes', mikrotikController.marcarPagoMes);

// Rutas Fiscales
app.get('/api/seniat/sales-book', seniatController.generateSalesBook);

// Rutas Integración WhatsApp
app.get('/api/whatsapp/status', whatsappController.getStatus);
app.post('/api/whatsapp/send-reminders', whatsappController.sendReminders);

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Megasystems API en ejecución.' });
});

// Fallback: cualquier ruta no capturada antes (como rutas de la SPA) sirve el index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`Servidor de Megasystems escuchando en http://localhost:${PORT}`);
    
    // Cron: verificar prórrogas vencidas (diario 00:01)
    cron.schedule('1 0 * * *', () => {
        console.log('[CRON] Verificando prórrogas vencidas...');
        mikrotikController.procesarPromesasVencidas();
    });

    // Cron: resetear estado_pago_mes el día 1 de cada mes a las 00:05
    cron.schedule('5 0 1 * *', () => {
        console.log('[CRON] Reseteando pagos del mes...');
        mikrotikController.resetearPagosMes();
    });

    // ── GRUPO MENSUAL (paga del 1 al 5) ──
    // Recordatorio diario días 1 al 5 a las 09:00
    cron.schedule('0 9 1-5 * *', () => {
        console.log('[CRON] Recordatorio cobranza grupo mensual (días 1-5)...');
        enviarCobranzaAutomatica('mensual', 'recordatorio');
    });
    // Aviso suspensión día 6 a las 09:00
    cron.schedule('0 9 6 * *', () => {
        console.log('[CRON] Aviso suspensión grupo mensual (día 6)...');
        enviarCobranzaAutomatica('mensual', 'suspension');
    });

    // ── GRUPO QUINCENAL (paga del 15 al 20) ──
    // Recordatorio diario días 15 al 20 a las 09:00
    cron.schedule('0 9 15-20 * *', () => {
        console.log('[CRON] Recordatorio cobranza grupo quincenal (días 15-20)...');
        enviarCobranzaAutomatica('quincenal', 'recordatorio');
    });
    // Aviso suspensión día 21 a las 09:00
    cron.schedule('0 9 21 * *', () => {
        console.log('[CRON] Aviso suspensión grupo quincenal (día 21)...');
        enviarCobranzaAutomatica('quincenal', 'suspension');
    });
});

process.on('uncaughtException', (err) => {
    console.error('ERROR NO CONTROLADO:', err);
});

process.on('exit', (code) => {
    console.log(`PROCESO TERMINADO CON CODIGO: ${code}`);
});

setInterval(() => {
    if (process.env.DEBUG_HEARTBEAT) console.log('Servidor Megasystems: Heartbeat OK');
}, 60000);
