const db = require('../db');
const crypto = require('crypto');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

const usuariosController = {
    // Obtener todos los usuarios
    getAll: async (req, res) => {
        try {
            const usuarios = await db.queryAsync('SELECT id, username, nombre, rol FROM usuarios ORDER BY nombre ASC');
            res.json({ success: true, data: usuarios });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error obteniendo los usuarios.' });
        }
    },

    // Crear un nuevo usuario
    create: async (req, res) => {
        try {
            const { username, password, nombre, rol } = req.body;

            if (!username || !password || !nombre || !rol) {
                return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
            }

            const hashed = hashPassword(password);

            const info = await db.runAsync(
                'INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?)',
                [username.toLowerCase(), hashed, nombre, rol]
            );

            res.json({ success: true, message: 'Usuario creado exitosamente.', id: info.lastID });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El nombre de usuario (login) ya está en uso.' });
            }
            res.status(500).json({ error: 'Error interno guardando al usuario.' });
        }
    },

    // Eliminar usuario
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            
            // Protección básica: Evitar que borren al Admin Principal (id = 1) si lo desean
            if(parseInt(id) === 1) {
                return res.status(400).json({ error: 'No se puede eliminar la cuenta de administrador principal del sistema.' });
            }

            await db.runAsync('DELETE FROM usuarios WHERE id = ?', [id]);
            res.json({ success: true, message: 'Usuario eliminado del sistema.' });
        } catch (error) {
            res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
        }
    }
};

module.exports = usuariosController;
