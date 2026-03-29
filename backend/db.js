const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Convierte placeholders '?' a '$1', '$2', etc. (compatibilidad SQLite → PostgreSQL)
function convertPlaceholders(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

// Ejecuta una consulta que devuelve filas (SELECT)
async function queryAsync(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const res = await pool.query(pgSql, params);
    return res.rows;
}

// Ejecuta INSERT/UPDATE/DELETE. Si es INSERT, añade RETURNING id automáticamente.
async function runAsync(sql, params = []) {
    let pgSql = convertPlaceholders(sql);

    // Si es un INSERT y no tiene RETURNING, añadirlo para obtener el ID generado
    if (/^\s*INSERT\s+/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
        pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
    }

    const res = await pool.query(pgSql, params);

    // Compatibilidad: devolver lastID como lo hacía SQLite
    return {
        lastID: res.rows && res.rows.length > 0 ? res.rows[0].id : null,
        changes: res.rowCount,
        rowCount: res.rowCount
    };
}

module.exports = { queryAsync, runAsync, pool };
