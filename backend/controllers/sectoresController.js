const { runAsync, queryAsync } = require('../db');

const getSectores = async (req, res) => {
    try {
        const sectores = await queryAsync('SELECT * FROM sectores ORDER BY nombre ASC');
        res.status(200).json({ success: true, data: sectores });
    } catch (error) {
        console.error('Error obteniendo sectores:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
};

const createSector = async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido.' });

    try {
        const result = await runAsync('INSERT INTO sectores (nombre) VALUES (?)', [nombre]);
        res.status(201).json({ success: true, message: 'Sector creado.', data: { id: result.lastID, nombre } });
    } catch (error) {
        if (error.code === '23505' || (error.message && error.message.includes('unique constraint'))) {
            return res.status(400).json({ success: false, error: 'El sector ya existe.' });
        }
        console.error('Error creando sector:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
};

module.exports = {
    getSectores,
    createSector
};
