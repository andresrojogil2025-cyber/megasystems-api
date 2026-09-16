const { RouterOSClient } = require('routeros-client');
const axios = require('axios');
const { runAsync, queryAsync } = require('../db');

// ─── CONFIGURACIÓN POR ZONA ────────────────────────────────────────────────
const ZONA_CONFIGS = {
    escuque: {
        host: process.env.MIKROTIK_HOST,
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        useRestApi: true  // RouterOS 7+
    },
    carvajal: {
        host: process.env.MIKROTIK_CARVAJAL_HOST,
        port: 8728,
        user: process.env.MIKROTIK_CARVAJAL_USER,
        password: process.env.MIKROTIK_CARVAJAL_PASSWORD,
        useRestApi: true  // RouterOS 7.12.1
    },
    beatriz: {
        host: process.env.MIKROTIK_BEATRIZ_HOST || '192.168.88.1',
        port: 8728,
        user: process.env.MIKROTIK_BEATRIZ_USER,
        password: process.env.MIKROTIK_BEATRIZ_PASSWORD,
        useRestApi: false  // RouterOS 6.49 — solo socket API
    }
};

const getCfg = (zona) => ZONA_CONFIGS[zona] || ZONA_CONFIGS.escuque;

const getMikrotikClientForZona = (zona) => {
    const cfg = getCfg(zona);
    return new RouterOSClient({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        keepalive: true
    });
};

// Alias para compatibilidad interna
const getMikrotikClient = () => getMikrotikClientForZona('escuque');

const mikrotikRestForZona = async (zona, method, path, data = null) => {
    const cfg = getCfg(zona);
    if (!cfg.useRestApi) return null;  // Beatriz no soporta REST
    return axios({
        method,
        url: `http://${cfg.host}/rest${path}`,
        auth: { username: cfg.user, password: cfg.password },
        timeout: 40000,
        headers: { 'Content-Type': 'application/json' },
        data
    });
};

const mikrotikRest = (method, path, data = null) => mikrotikRestForZona('escuque', method, path, data);

const getZonaForCliente = async (id) => {
    const result = await queryAsync('SELECT zona FROM clientes_internet WHERE id = ?', [id]);
    return (result && result.length > 0 && result[0].zona) ? result[0].zona : 'escuque';
};

// ─── FUNCIONES PRINCIPALES ─────────────────────────────────────────────────

const getClientes = async (req, res) => {
    try {
        const clientes = await queryAsync("SELECT * FROM clientes_internet ORDER BY zona ASC, nombre ASC");
        res.status(200).json({ success: true, data: clientes });
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ success: false, error: 'Error al obtener los clientes' });
    }
};

const testConnection = async (req, res) => {
    const zona = req.query.zona || 'escuque';
    const api = getMikrotikClientForZona(zona);
    try {
        const client = await api.connect();
        const identity = await client.menu('/system/identity').get();
        api.close();
        res.status(200).json({
            success: true,
            message: `Conectado a MikroTik [${zona}] exitosamente`,
            routerStatus: identity
        });
    } catch (error) {
        console.error(`Error conectando a MikroTik [${zona}]:`, error);
        res.status(500).json({ success: false, error: `Error de conexión con el Router [${zona}]` });
    }
};

const importarClientes = async (req, res) => {
    const zona = req.query.zona || 'escuque';
    const api = getMikrotikClientForZona(zona);
    try {
        const client = await api.connect();
        const arps = await client.menu('/ip/arp').get();
        const queues = await client.menu('/queue/simple').get();
        const dhcpLeases = await client.menu('/ip/dhcp-server/lease').get();
        api.close();

        let procesados = 0;
        let nuevos = 0;

        for (const lease of dhcpLeases) {
            const ip = lease.address;
            const mac = lease.macAddress || '';
            const comentario = lease.comment;
            const hostname = lease.hostName;

            if (comentario || hostname) {
                let nombreCliente = (comentario || hostname || 'Desconocido').replace(/^\/+/, '').trim();

                let planMikrotik = 'Sin Plan Específico';
                if (ip) {
                    const octetos = ip.split('.');
                    const subredAproximada = `${octetos[0]}.${octetos[1]}.${octetos[2]}.0`;
                    const queueMatch = queues.find(q => q.target && q.target.includes(subredAproximada));
                    if (queueMatch) planMikrotik = queueMatch.name || queueMatch.maxLimit || 'Plan General';
                }

                const existe = await queryAsync("SELECT id FROM clientes_internet WHERE ip_address = ?", [ip]);

                if (existe.length > 0) {
                    await runAsync(
                        "UPDATE clientes_internet SET nombre = ?, mac_address = ?, plan_mikrotik = ?, zona = ? WHERE ip_address = ?",
                        [nombreCliente, mac, planMikrotik, zona, ip]
                    );
                    procesados++;
                } else {
                    await runAsync(
                        "INSERT INTO clientes_internet (nombre, ip_address, mac_address, plan_mikrotik, zona) VALUES (?, ?, ?, ?, ?)",
                        [nombreCliente, ip, mac, planMikrotik, zona]
                    );
                    nuevos++;
                    procesados++;
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `[${zona}] Importación completada. ${procesados} procesados (${nuevos} nuevos).`
        });
    } catch (error) {
        console.error(`Error importando clientes de MikroTik [${zona}]:`, error);
        res.status(500).json({ success: false, error: `Error al sincronizar con el Router [${zona}]` });
        try { api.close(); } catch (e) { }
    }
};

const suspenderCliente = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'ID e IP obligatorios' });

    try {
        const zona = await getZonaForCliente(id);
        const cliente = await queryAsync("SELECT nombre FROM clientes_internet WHERE id = ?", [id]);
        const nombre = (cliente && cliente.length > 0) ? cliente[0].nombre : 'Cliente Desconocido';

        await runAsync("UPDATE clientes_internet SET estado = 'suspendido' WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: `Cliente ${nombre} suspendido.` });

        const syncSuspension = async () => {
            const comentario = `${nombre}, Suspendido por el sistema Megasystems`;
            const api = getMikrotikClientForZona(zona);
            try {
                const client = await api.connect();
                await client.menu('/ip/firewall/address-list').add({
                    list: 'Morosos',
                    address: ip_address,
                    comment: comentario
                });
                console.log(`[MKT-${zona}] ${nombre} agregado a Morosos.`);
                api.close();
            } catch (mktError) {
                console.log(`[MKT-${zona}] Resultado suspensión ${nombre}:`, mktError.message || 'Ya existía');
                try { api.close(); } catch (e) { }
            }
        };
        syncSuspension();

    } catch (error) {
        console.error('Error en suspenderCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al actualizar el estado del cliente.' });
    }
};

const reactivarCliente = async (req, res) => {
    const { id, ip_address, monto, metodo_pago, referencia, mes_pagado } = req.body;
    if (!id || !ip_address || !monto) return res.status(400).json({ success: false, error: 'Faltan datos obligatorios' });

    try {
        const zona = await getZonaForCliente(id);
        const api = getMikrotikClientForZona(zona);

        try {
            console.log(`[API-${zona}] Removiendo IP ${ip_address} de Morosos...`);
            const client = await api.connect();
            const list = await client.rosApi.write('/ip/firewall/address-list/print', [
                '?list=Morosos',
                `?address=${ip_address}`
            ]);
            if (list && list.length > 0) {
                for (const item of list) {
                    const rowId = item['.id'] || item.id;
                    if (rowId) {
                        try {
                            await client.rosApi.write('/ip/firewall/address-list/remove', [`=.id=${rowId}`]);
                            console.log(`[API-${zona}] Registro ${rowId} eliminado de Morosos`);
                        } catch (errRemove) {
                            console.log(`[API-${zona}] Error eliminando ${rowId}:`, errRemove.message);
                        }
                    }
                }
            }
            api.close();
        } catch (mktError) {
            console.error(`[API-${zona}] Error al remover de Morosos:`, mktError.message);
            try { api.close(); } catch (e) { }
            return res.status(500).json({ success: false, error: 'Error de conexión con MikroTik. Intente nuevamente.' });
        }

        await runAsync(
            "INSERT INTO pagos_internet (cliente_id, monto, metodo_pago, referencia, mes_pagado) VALUES (?, ?, ?, ?, ?)",
            [id, monto, metodo_pago || 'Desconocido', referencia || 'N/A', mes_pagado || '']
        );
        await runAsync("UPDATE clientes_internet SET estado = 'activo' WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: 'Cliente reactivado y pago registrado.' });

    } catch (error) {
        console.error('Error en reactivarCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al procesar reactivación.' });
    }
};

const eliminarCliente = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID obligatorio' });

    try {
        const zona = await getZonaForCliente(id);
        await runAsync("DELETE FROM clientes_internet WHERE id = ?", [id]);

        if (ip_address) {
            const cfg = getCfg(zona);
            if (cfg.useRestApi) {
                // REST API disponible (RouterOS 7+)
                try {
                    const leaseRes = await mikrotikRestForZona(zona, 'get', `/ip/dhcp-server/lease?address=${ip_address}`);
                    if (leaseRes && leaseRes.data && leaseRes.data.length > 0) {
                        for (const l of leaseRes.data) {
                            await mikrotikRestForZona(zona, 'delete', `/ip/dhcp-server/lease/${l['.id']}`);
                        }
                    }
                    const arpRes = await mikrotikRestForZona(zona, 'get', `/ip/arp?address=${ip_address}`);
                    if (arpRes && arpRes.data && arpRes.data.length > 0) {
                        for (const a of arpRes.data) {
                            await mikrotikRestForZona(zona, 'delete', `/ip/arp/${a['.id']}`);
                        }
                    }
                    const morosoRes = await mikrotikRestForZona(zona, 'get', `/ip/firewall/address-list?address=${ip_address}&list=Morosos`);
                    if (morosoRes && morosoRes.data && morosoRes.data.length > 0) {
                        for (const m of morosoRes.data) {
                            await mikrotikRestForZona(zona, 'delete', `/ip/firewall/address-list/${m['.id']}`);
                        }
                    }
                } catch (mktError) {
                    console.error(`[REST-${zona}] Error limpiando datos:`, mktError.message);
                }
            } else {
                // Socket API (RouterOS 6.x — Beatriz)
                const api = getMikrotikClientForZona(zona);
                try {
                    const client = await api.connect();
                    const leases = await client.rosApi.write('/ip/dhcp-server/lease/print', [`?address=${ip_address}`]);
                    if (leases && leases.length > 0) {
                        for (const l of leases) {
                            const lid = l['.id'] || l.id;
                            if (lid) await client.rosApi.write('/ip/dhcp-server/lease/remove', [`=.id=${lid}`]);
                        }
                    }
                    const morosos = await client.rosApi.write('/ip/firewall/address-list/print', [
                        '?list=Morosos', `?address=${ip_address}`
                    ]);
                    if (morosos && morosos.length > 0) {
                        for (const m of morosos) {
                            const mid = m['.id'] || m.id;
                            if (mid) await client.rosApi.write('/ip/firewall/address-list/remove', [`=.id=${mid}`]);
                        }
                    }
                    api.close();
                } catch (mktError) {
                    console.error(`[Socket-${zona}] Error limpiando datos:`, mktError.message);
                    try { api.close(); } catch (e) { }
                }
            }
        }

        res.status(200).json({ success: true, message: 'Cliente eliminado exitosamente.' });
    } catch (error) {
        console.error('Error en eliminarCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al eliminar de la base de datos' });
    }
};

const crearDeuda = async (req, res) => {
    const { cliente_id, concepto, monto_usd } = req.body;
    if (!cliente_id || !concepto || !monto_usd) {
        return res.status(400).json({ success: false, error: 'Datos incompletos.' });
    }
    try {
        await runAsync(
            "INSERT INTO deudas_internet (cliente_id, concepto, monto_total, monto_pagado, estado) VALUES (?, ?, ?, 0, 'pendiente')",
            [cliente_id, concepto, monto_usd]
        );
        res.status(200).json({ success: true, message: 'Deuda registrada exitosamente.' });
    } catch (error) {
        console.error('Error creando deuda:', error);
        res.status(500).json({ success: false, error: 'Error al registrar la deuda.' });
    }
};

const obtenerDeudas = async (req, res) => {
    const { id } = req.params;
    try {
        const deudas = await queryAsync(
            "SELECT * FROM deudas_internet WHERE cliente_id = ? ORDER BY fecha_registro DESC", [id]
        );
        let totalAdeudado = 0;
        deudas.forEach(d => {
            if (d.estado !== 'pagado') {
                totalAdeudado += (parseFloat(d.monto_total) - parseFloat(d.monto_pagado || 0));
            }
        });
        res.status(200).json({ success: true, data: deudas, totalAdeudado });
    } catch (error) {
        console.error('Error obteniendo deudas:', error);
        res.status(500).json({ success: false, error: 'Error al consultar las deudas.' });
    }
};

const toggleCorteAutomatico = async (req, res) => {
    const { id } = req.params;
    const { nombre, auto_suspension, dia_cobranza, celular, fecha_nacimiento, sector_id, grupo_pago, saldo_pendiente, zona } = req.body;

    try {
        let sql = `UPDATE clientes_internet SET auto_suspension = ?`;
        let params = [auto_suspension];

        if (nombre !== undefined)          { sql += `, nombre = ?`;           params.push(nombre); }
        if (dia_cobranza !== undefined)    { sql += `, dia_cobranza = ?`;     params.push(parseInt(dia_cobranza) || 5); }
        if (celular !== undefined)         { sql += `, celular = ?`;          params.push(celular || null); }
        if (fecha_nacimiento !== undefined){ sql += `, fecha_nacimiento = ?`; params.push(fecha_nacimiento || null); }
        if (sector_id !== undefined)       { sql += `, sector_id = ?`;        params.push(sector_id || null); }
        if (grupo_pago !== undefined)      { sql += `, grupo_pago = ?`;       params.push(grupo_pago || 'mensual'); }
        if (saldo_pendiente !== undefined) { sql += `, saldo_pendiente = ?`;  params.push(saldo_pendiente !== null ? parseFloat(saldo_pendiente) : null); }
        if (zona !== undefined)            { sql += `, zona = ?`;             params.push(zona || 'escuque'); }

        sql += ` WHERE id = ?`;
        params.push(id);

        await runAsync(sql, params);

        // Sincronizar nombre en MikroTik (solo si hay REST API disponible)
        const zonaActual = zona || await getZonaForCliente(id);
        const cfg = getCfg(zonaActual);

        if (cfg.useRestApi && nombre) {
            const clienteInfo = await queryAsync("SELECT ip_address FROM clientes_internet WHERE id = ?", [id]);
            if (clienteInfo && clienteInfo.length > 0 && clienteInfo[0].ip_address) {
                const ip = clienteInfo[0].ip_address;
                const syncMktRest = async () => {
                    try {
                        const leaseRes = await mikrotikRestForZona(zonaActual, 'get', `/ip/dhcp-server/lease?address=${ip}`);
                        if (leaseRes && leaseRes.data && leaseRes.data.length > 0) {
                            const leaseId = leaseRes.data[0]['.id'];
                            await mikrotikRestForZona(zonaActual, 'patch', `/ip/dhcp-server/lease/${leaseId}`, { comment: nombre });
                            console.log(`[REST-${zonaActual}] Lease DHCP actualizado: comment = "${nombre}"`);
                        }
                    } catch (errRest) {
                        console.error(`[REST-${zonaActual}] Error sincronizando nombre:`, errRest.message);
                    }
                };
                syncMktRest();
            }
        }

        res.status(200).json({ success: true, message: 'Configuración guardada correctamente.' });
    } catch (error) {
        console.error('Error en toggleCorteAutomatico:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al actualizar configuración.' });
    }
};

const activarLibre = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'Faltan datos.' });

    try {
        const zona = await getZonaForCliente(id);
        const api = getMikrotikClientForZona(zona);
        const client = await api.connect();
        try {
            const scriptMenu = client.menu('/system/script');
            const scriptName = `reactivar_libre_megasystems_${Date.now()}`;
            const addRes = await scriptMenu.add({
                name: scriptName,
                source: `/ip firewall address-list remove [find list="Morosos" address="${ip_address}"]`
            });
            await client.rosApi.write('/system/script/run', ['=.id=' + addRes.ret]);
            await scriptMenu.remove(addRes.ret);
        } catch (mErr) {
            console.log(`[MKT-${zona}] Error reactivar libre:`, mErr);
        }
        api.close();
        await runAsync("UPDATE clientes_internet SET estado = 'activo' WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: 'Cliente REACTIVADO forzosamente' });
    } catch (error) {
        console.error('Error en activarLibre:', error);
        res.status(500).json({ success: false, error: 'Error enviando orden al RouterBoard.' });
    }
};

const suspenderLibre = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'Faltan datos.' });

    try {
        const zona = await getZonaForCliente(id);
        const api = getMikrotikClientForZona(zona);
        const client = await api.connect();
        try {
            await client.menu('/ip/firewall/address-list').add({
                list: 'Morosos',
                address: ip_address,
                comment: 'Suspendido manualmente (Modo Libre)'
            });
        } catch (mErr) {
            console.log(`[MKT-${zona}] Error suspender libre (quizás ya existe):`, mErr);
        }
        api.close();
        await runAsync("UPDATE clientes_internet SET estado = 'suspendido' WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: 'Cliente SUSPENDIDO forzosamente' });
    } catch (error) {
        console.error('Error en suspenderLibre:', error);
        res.status(500).json({ success: false, error: 'Error enviando orden al RouterBoard.' });
    }
};

const promesaPago = async (req, res) => {
    const { id, ip_address, fecha_limite } = req.body;
    if (!id || !ip_address || !fecha_limite) {
        return res.status(400).json({ success: false, error: 'Faltan datos obligatorios.' });
    }

    try {
        const zona = await getZonaForCliente(id);
        const api = getMikrotikClientForZona(zona);

        try {
            console.log(`[API-${zona}] Removiendo IP ${ip_address} de Morosos por PRÓRROGA...`);
            const client = await api.connect();
            const list = await client.rosApi.write('/ip/firewall/address-list/print', [
                '?list=Morosos', `?address=${ip_address}`
            ]);
            if (list && list.length > 0) {
                for (const item of list) {
                    const rowId = item['.id'] || item.id;
                    if (rowId) {
                        try {
                            await client.rosApi.write('/ip/firewall/address-list/remove', [`=.id=${rowId}`]);
                        } catch (errRemove) {
                            console.log(`[API-${zona}] Error eliminando ${rowId}:`, errRemove.message);
                        }
                    }
                }
            }
            api.close();
        } catch (mktError) {
            console.error(`[API-${zona}] Error al remover moroso en Prórroga:`, mktError.message);
            try { api.close(); } catch (e) { }
            return res.status(500).json({ success: false, error: 'Error de conexión con MikroTik.' });
        }

        await runAsync(
            "UPDATE clientes_internet SET estado = 'activo', fecha_promesa_pago = ? WHERE id = ?",
            [fecha_limite, id]
        );
        res.status(200).json({ success: true, message: 'Prórroga registrada y cliente reactivado.' });

    } catch (error) {
        console.error('Error en promesaPago:', error.message);
        res.status(500).json({ success: false, error: 'Error al procesar la prórroga.' });
    }
};

const procesarPromesasVencidas = async () => {
    try {
        console.log('[CRON] Buscando promesas de pago vencidas...');
        const vencidos = await queryAsync(`
            SELECT id, ip_address, nombre, zona
            FROM clientes_internet
            WHERE fecha_promesa_pago IS NOT NULL
            AND fecha_promesa_pago <= CURRENT_DATE
            AND estado != 'suspendido'
        `);

        if (!vencidos || vencidos.length === 0) {
            console.log('[CRON] No hay vencimientos de prórroga para suspender hoy.');
            return;
        }

        console.log(`[CRON] ${vencidos.length} clientes con prórroga vencida.`);

        // Agrupar por zona para abrir una sola conexión por router
        const porZona = {};
        for (const c of vencidos) {
            const z = c.zona || 'escuque';
            if (!porZona[z]) porZona[z] = [];
            porZona[z].push(c);
        }

        for (const [zona, clientes] of Object.entries(porZona)) {
            const api = getMikrotikClientForZona(zona);
            let client;
            try {
                client = await api.connect();
            } catch (connErr) {
                console.error(`[CRON] No se pudo conectar a MikroTik [${zona}]:`, connErr.message);
                continue;
            }

            for (const { id, ip_address, nombre } of clientes) {
                console.log(`[CRON] Suspendiendo ${nombre} (${zona}, IP: ${ip_address})`);
                await runAsync(
                    "UPDATE clientes_internet SET estado = 'suspendido', fecha_promesa_pago = NULL WHERE id = ?",
                    [id]
                );
                try {
                    await client.menu('/ip/firewall/address-list').add({
                        list: 'Morosos',
                        address: ip_address,
                        comment: `${nombre}, Prórroga vencida (Megasystems)`
                    });
                } catch (mErr) {
                    console.log(`[CRON] Error MikroTik al suspender ${nombre}:`, mErr.message);
                }
            }

            try { api.close(); } catch (e) { }
        }
    } catch (error) {
        console.error('[CRON] Error general al procesar promesas vencidas:', error);
    }
};

const marcarPagoMes = async (req, res) => {
    const { id } = req.params;
    try {
        await runAsync(
            "UPDATE clientes_internet SET estado_pago_mes = 'pagado', fecha_ultimo_pago = CURRENT_DATE WHERE id = ?",
            [id]
        );
        res.json({ success: true, message: 'Pago del mes registrado.' });
    } catch (error) {
        console.error('Error marcando pago:', error);
        res.status(500).json({ success: false, error: 'Error al registrar pago.' });
    }
};

const resetearPagosMes = async () => {
    try {
        await runAsync("UPDATE clientes_internet SET estado_pago_mes = 'pendiente' WHERE estado_pago_mes = 'pagado'");
        console.log('[CRON] Estado de pago mensual reseteado.');
    } catch (error) {
        console.error('[CRON] Error reseteando pagos del mes:', error);
    }
};

module.exports = {
    getClientes,
    testConnection,
    importarClientes,
    suspenderCliente,
    reactivarCliente,
    eliminarCliente,
    crearDeuda,
    obtenerDeudas,
    toggleCorteAutomatico,
    activarLibre,
    suspenderLibre,
    promesaPago,
    procesarPromesasVencidas,
    marcarPagoMes,
    resetearPagosMes
};
