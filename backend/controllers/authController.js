const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

// Función para encriptar claves rápidamente sin dependencias externas pesadas
const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

const authController = {
    // 1. Manejar el Inicio de Sesión
    login: async (req, res) => {
        try {
            const usernameInput = (req.body.username || '').trim().toLowerCase();
            const passwordInput = (req.body.password || '').trim();
            const hashedPwd = hashPassword(passwordInput);
            
            const user = await db.queryAsync('SELECT * FROM usuarios WHERE username = ? AND password_hash = ?', [usernameInput, hashedPwd]);
            
            if (!user || user.length === 0) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            const userData = user[0];

            // Generar Token JWT
            const token = jwt.sign(
                { id: userData.id, role: userData.rol, nombre: userData.nombre }, 
                process.env.JWT_SECRET || 'megasystems_secreto_777',
                { expiresIn: '8h' }
            );

            res.json({
                success: true,
                message: `Bienvenido, ${userData.nombre}`,
                token,
                user: {
                    id: userData.id,
                    username: userData.username,
                    role: userData.rol,
                    nombre: userData.nombre
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error del servidor en AuthController' });
        }
    },

    // 2. Obtener imágenes dinámicas para el Login
    getVisualConfig: async (req, res) => {
        try {
            const config = await db.queryAsync('SELECT fondo_login_url, logo_url, banner_url FROM configuracion_visual ORDER BY id DESC LIMIT 1');
            
            if (config && config.length > 0) {
                res.json(config[0]);
            } else {
                res.json({
                    fondo_login_url: 'images/default/tech_bg.jpg',
                    logo_url: 'images/default/megasystems_logo.png',
                    banner_url: 'images/default/banner_cctv_redes.jpg'
                });
            }
        } catch (error) {
            res.status(500).json({ error: 'Error obteniendo configuración visual' });
        }
    },

    // 3. Subida de imagen (Base64)
    uploadImage: async (req, res) => {
        const fs = require('fs');
        const path = require('path');
        try {
            const { fileName, base64 } = req.body;
            if(!fileName || !base64) return res.status(400).json({ error: 'Datos incompletos' });

            // Quitar el prefijo data:image/...;base64,
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');

            const uploadDir = path.resolve(__dirname, '../../frontend/images/uploads');
            if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const fullPath = path.join(uploadDir, fileName);
            fs.writeFileSync(fullPath, buffer);

            const publicUrl = `images/uploads/${fileName}`;
            res.json({ success: true, url: publicUrl });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al subir la imagen' });
        }
    },

    // 4. Actualizar imágenes dinámicas (Panel de Configuración)
    updateVisualConfig: async (req, res) => {
        try {
            const { fondo_login_url, logo_url, banner_url } = req.body;
            
            // Insertar una nueva fila de configuración (historial) o actualizar. En SQLite auto-id:
            await db.runAsync(
                'INSERT INTO configuracion_visual (fondo_login_url, logo_url, banner_url, tasa_bcv_manual) SELECT ?, ?, ?, tasa_bcv_manual FROM configuracion_visual ORDER BY id DESC LIMIT 1',
                [fondo_login_url, logo_url, banner_url]
            );

            res.json({ success: true, message: 'Configuración de imágenes actualizada.' });
        } catch (error) {
            console.error('Error actualizando configuración visual:', error);
            res.status(500).json({ error: 'Error del servidor guardando configuración' });
        }
    },

    // 4. Crear usuario (Utilidad interna / Seed)
    seedAdmin: async (req, res) => {
        try {
            const hashed = hashPassword('admin123');
            await db.runAsync('INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?) ON CONFLICT (username) DO NOTHING', ['admin', hashed, 'Administrador Principal', 'admin']);
            res.json({ success: true, message: 'Usuario admin creado (si no existía)' });
        } catch (error) {
            res.status(500).json({ error: 'Error creando admin' });
        }
    }
};

module.exports = authController;
