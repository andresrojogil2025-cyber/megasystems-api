const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno ANTES de cualquier uso
dotenv.config();

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3050;

// Configuración de Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Servir el frontend como archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));

// --- RUTAS DE LA API (Endpoints) ---
const authController = require('./controllers/authController');
const billerController = require('./controllers/billerController');
const seniatController = require('./controllers/seniatController');
const bcvController = require('./controllers/bcvController');
const entidadesController = require('./controllers/entidadesController');
const catalogoController = require('./controllers/catalogoController');
const usuariosController = require('./controllers/usuariosController');
const retencionesController = require('./controllers/retencionesController');
const cuentasController = require('./controllers/cuentasController');

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
app.delete('/api/catalogo/:id', catalogoController.delete);

app.get('/api/usuarios', usuariosController.getAll);
app.post('/api/usuarios', usuariosController.create);
app.delete('/api/usuarios/:id', usuariosController.delete);

// Rutas de Cotizaciones y Facturación
app.get('/api/billing/quotes', billerController.getQuotes);
app.get('/api/billing/quote/:id', billerController.getQuoteDetails);
app.post('/api/billing/quote', billerController.createQuote);
app.post('/api/billing/invoice', billerController.createInvoice);

// Rutas de Retenciones
app.get('/api/retenciones', retencionesController.getAll);
app.post('/api/retenciones', retencionesController.create);
app.delete('/api/retenciones/:id', retencionesController.delete);

// Rutas de Cuentas por Cobrar
app.get('/api/cuentas', cuentasController.getAll);
app.post('/api/cuentas', cuentasController.create);
app.post('/api/cuentas/:id/abonos', cuentasController.createAbono);
app.get('/api/cuentas/:id/abonos', cuentasController.getAbonos);

// Rutas Fiscales
app.get('/api/seniat/sales-book', seniatController.generateSalesBook);

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Megasystems API en ejecución.' });
});

// Fallback: cualquier ruta no-API sirve el index.html (SPA-like)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Levantar el servidor
app.listen(PORT, () => {
    console.log(`Servidor de Megasystems escuchando en http://localhost:${PORT}`);
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
