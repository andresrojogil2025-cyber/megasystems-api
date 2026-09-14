const { RouterOSClient } = require('routeros-client');
const axios = require('axios');
const { runAsync, queryAsync } = require('../db');

// Función auxiliar para obtener cliente conectado
const getMikrotikClient = () => {
    return new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        port: process.env.MIKROTIK_PORT || 8728, // Usa el puerto por defecto 8728 si no se define
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        keepalive: true
    });
};

// --- HELPER PARA MIKROTIK REST API (RouterOS 7+) ---
const mikrotikRest = async (method, path, data = null) => {
    const host = process.env.MIKROTIK_HOST;
    const user = process.env.MIKROTIK_USER;
    const pass = process.env.MIKROTIK_PASSWORD;
    const baseUrl = `http://${host}/rest`;

    const config = {
        method,
        url: `${baseUrl}${path}`,
        auth: { username: user, password: pass },
        timeout: 40000,
        headers: { 'Content-Type': 'application/json' },
        data: data
    };

    return axios(config);
};

/**
 * 0. Obtener lista de clientes de la base de datos local (Supabase)
 */
const getClientes = async (req, res) => {
    try {
        const clientes = await queryAsync("SELECT * FROM clientes_internet ORDER BY nombre ASC");
        res.status(200).json({ success: true, data: clientes });
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({ success: false, error: 'Error al obtener los clientes' });
    }
};

/**
 * 1. Probar la conexión al RouterOS
 */
const testConnection = async (req, res) => {
    const api = getMikrotikClient();
    try {
        const client = await api.connect();
        const identity = await client.menu('/system/identity').get();
        api.close();

        res.status(200).json({
            success: true,
            message: 'Conectado a MikroTik exitosamente',
            routerStatus: identity
        });
    } catch (error) {
        console.error('Error conectando a MikroTik:', error);
        res.status(500).json({ success: false, error: 'Error de conexión con el Router' });
    }
};

/**
 * 2. Importar Clientes cruzando Queues, DHCP y ARP
 */
const importarClientes = async (req, res) => {
    const api = getMikrotikClient();
    try {
        const client = await api.connect();

        // 1. Obtener ARP y Queues
        const arps = await client.menu('/ip/arp').get();
        const queues = await client.menu('/queue/simple').get();
        // Opcional: Obtener leases DHCP para más certeza en los nombres
        const dhcpLeases = await client.menu('/ip/dhcp-server/lease').get();
        api.close();

        let procesados = 0;
        let nuevos = 0;
        let errores = [];

        // Por cada entrada DHCP Lease que tenga comentario o nombre de host
        for (const lease of dhcpLeases) {
            const ip = lease.address;
            const mac = lease.macAddress || '';
            const comentario = lease.comment;
            const hostname = lease.hostName;

            // En este MikroTik los nombres están en los comentarios del DHCP
            if (comentario || hostname) {
                let nombreCliente = comentario || hostname || 'Desconocido';

                // Limpiar el nombre
                nombreCliente = nombreCliente.replace(/^\/+/, '').trim();

                // Buscar un Queue simple que cubra esta subred (ej: 192.168.116.0)
                let planMikrotik = 'Sin Plan Específico';
                if (ip) {
                    const octetos = ip.split('.'); // ['192','168','116','45']
                    const subredAproximada = `${octetos[0]}.${octetos[1]}.${octetos[2]}.0`;
                    const queueMatch = queues.find(q => q.target && q.target.includes(subredAproximada));
                    if (queueMatch) planMikrotik = queueMatch.name || queueMatch.maxLimit || 'Plan General';
                }

                // Buscar en DB si ya existe
                const sqlCheck = "SELECT id FROM clientes_internet WHERE ip_address = ?";
                const existe = await queryAsync(sqlCheck, [ip]);

                if (existe.length > 0) {
                    // Actualizar si ya existe
                    const sqlUpdate = `
                        UPDATE clientes_internet 
                        SET nombre = ?, mac_address = ?, plan_mikrotik = ?
                        WHERE ip_address = ?
                    `;
                    await runAsync(sqlUpdate, [nombreCliente, mac, planMikrotik, ip]);
                    procesados++;
                } else {
                    // Insertar nuevo
                    const sqlInsert = `
                        INSERT INTO clientes_internet (nombre, ip_address, mac_address, plan_mikrotik) 
                        VALUES (?, ?, ?, ?)
                    `;
                    await runAsync(sqlInsert, [nombreCliente, ip, mac, planMikrotik]);
                    nuevos++;
                    procesados++;
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Importación completada. ${procesados} procesados (${nuevos} nuevos).`,
            errores: errores.length > 0 ? errores : undefined
        });

    } catch (error) {
        console.error('Error importando clientes de MikroTik:', error);
        res.status(500).json({ success: false, error: 'Ocurrió un error al sincronizar con el Router' });
        try { api.close(); } catch (e) { }
    }
};

/**
 * 3. Suspender cliente (Agregar IP al Address List "Morosos" vía Socket API)
 *    Nota: Usamos el socket API (puerto 8728) para agregar al Address List
 *    porque la REST API hace timeout en operaciones de firewall en este router.
 *    El comando .add() NO causa el error !empty de RouterOS 7.18+.
 */
const suspenderCliente = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'ID e IP obligatorios' });

    try {
        // 1. Obtener el nombre del cliente de la base de datos
        const cliente = await queryAsync("SELECT nombre FROM clientes_internet WHERE id = ?", [id]);
        const nombre = (cliente && cliente.length > 0) ? cliente[0].nombre : 'Cliente Desconocido';

        // 2. Actualizar estado en la base de datos local PRIMERO
        await runAsync("UPDATE clientes_internet SET estado = 'suspendido' WHERE id = ?", [id]);

        // 3. Responder al frontend de inmediato
        res.status(200).json({
            success: true,
            message: `Cliente ${nombre} suspendido.`
        });

        // 4. Sincronizar con MikroTik EN SEGUNDO PLANO (Socket API para firewall)
        const syncSuspension = async () => {
            const comentario = `${nombre}, Suspendido por el sistema Megasystems`;
            const api = getMikrotikClient();
            try {
                const client = await api.connect();
                const addressListMenu = client.menu('/ip/firewall/address-list');
                await addressListMenu.add({
                    list: 'Morosos',
                    address: ip_address,
                    comment: comentario
                });
                console.log(`[MKT] ${nombre} agregado a Morosos con comentario.`);
                api.close();
            } catch (mktError) {
                console.log(`[MKT] Resultado suspensión ${nombre}:`, mktError.message || 'Ya existía');
                try { api.close(); } catch (e) { }
            }
        };
        syncSuspension(); // Se ejecuta en background

    } catch (error) {
        console.error('Error detallado en suspenderCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al actualizar el estado del cliente.' });
    }
};

/**
 * 4. Reactivar cliente (Quitar de la lista Morosos y registrar pago)
 *    Nota: Usamos socket API con script dinámico para quitar del Address List
 *    porque la REST API hace timeout en operaciones de firewall en este router.
 */
const reactivarCliente = async (req, res) => {
    const { id, ip_address, monto, metodo_pago, referencia, mes_pagado } = req.body;
    if (!id || !ip_address || !monto) return res.status(400).json({ success: false, error: 'Faltan datos obligatorios para el pago' });

    try {
        // 1. Quitar de Morosos en MikroTik PRIMERO (API Clásica socket 8728)
        const api = getMikrotikClient();
        try {
            console.log(`[API 8728] Intentando remover a IP ${ip_address} de Morosos...`);
            const client = await api.connect();
            
            // Usamos rosApi directo porque el wrapper '.menu()' puede congelarse en versiones RouterOS 7+
            const list = await client.rosApi.write('/ip/firewall/address-list/print', [
                '?list=Morosos',
                `?address=${ip_address}`
            ]);
            
            if (list && list.length > 0) {
                for (const item of list) {
                    const rowId = item['.id'] || item.id;
                    if (rowId) {
                        try {
                            await client.rosApi.write('/ip/firewall/address-list/remove', [
                                `=.id=${rowId}`
                            ]);
                            console.log(`[API 8728] Registro ${rowId} eliminado de Morosos para la IP ${ip_address}`);
                        } catch (errRemove) {
                            console.log(`[API 8728] Error eliminando ${rowId}:`, errRemove.message);
                        }
                    }
                }
            } else {
                console.log(`[API 8728] La IP ${ip_address} no se encontró en la lista de Morosos.`);
            }
            api.close();
            
        } catch (mktError) {
            console.error('[API 8728] Error al obtener ID interno o remover de morosos:', mktError.message);
            try { api.close(); } catch (e) { }
            return res.status(500).json({ success: false, error: 'Error de conexión con MikroTik. No se pudo reactivar el servicio. Intente nuevamente.' });
        }

        // 2. Registrar pago en base de datos
        await runAsync(`
            INSERT INTO pagos_internet (cliente_id, monto, metodo_pago, referencia, mes_pagado)
            VALUES (?, ?, ?, ?, ?)
        `, [id, monto, metodo_pago || 'Desconocido', referencia || 'N/A', mes_pagado || '']);

        // 3. Cambiar estado a activo en la DB local
        await runAsync("UPDATE clientes_internet SET estado = 'activo' WHERE id = ?", [id]);

        // 4. Responder al frontend de inmediato
        res.status(200).json({ success: true, message: 'Cliente reactivado en MikroTik y pago registrado exitosamente.' });

    } catch (error) {
        console.error('Error detallado en reactivarCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al procesar reactivación en la base de datos.' });
    }
};

/**
 * 5. Eliminar Cliente (De Supabase y del MikroTik vía REST)
 */
const eliminarCliente = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID obligatorio' });

    try {
        // 1. Eliminar de base de datos local primero
        await runAsync("DELETE FROM clientes_internet WHERE id = ?", [id]);

        // 2. Intentar eliminar del MikroTik vía REST
        if (ip_address) {
            try {
                // A. Eliminar de DHCP Leases
                const leaseRes = await mikrotikRest('get', `/ip/dhcp-server/lease?address=${ip_address}`);
                if (leaseRes.data && leaseRes.data.length > 0) {
                    for (const l of leaseRes.data) {
                        await mikrotikRest('delete', `/ip/dhcp-server/lease/${l['.id']}`);
                    }
                    console.log(`[REST] Leases eliminados para IP: ${ip_address}`);
                }

                // B. Eliminar de ARP
                const arpRes = await mikrotikRest('get', `/ip/arp?address=${ip_address}`);
                if (arpRes.data && arpRes.data.length > 0) {
                    for (const a of arpRes.data) {
                        await mikrotikRest('delete', `/ip/arp/${a['.id']}`);
                    }
                    console.log(`[REST] Entradas ARP eliminadas para IP: ${ip_address}`);
                }

                // C. Asegurarse de quitar de morosos si estaba
                const morosoRes = await mikrotikRest('get', `/ip/firewall/address-list?address=${ip_address}&list=Morosos`);
                if (morosoRes.data && morosoRes.data.length > 0) {
                    for (const m of morosoRes.data) {
                        await mikrotikRest('delete', `/ip/firewall/address-list/${m['.id']}`);
                    }
                }
            } catch (mktError) {
                console.error('[REST] Error al limpiar datos en MikroTik:', mktError.message);
            }
        }

        res.status(200).json({ success: true, message: 'Cliente eliminado exitosamente.' });

    } catch (error) {
        console.error('Error detallado en eliminarCliente:', error.message);
        res.status(500).json({ success: false, error: 'Error al eliminar de la base de datos' });
    }
};

// --- NUEVAS FUNCIONES DE ESTADO DE CUENTA Y CONTROL LIBRE ---

/**
 * 6. Crear Deuda Histórica (Estado de Cuenta)
 */
const crearDeuda = async (req, res) => {
    const { cliente_id, concepto, monto_usd } = req.body;
    if (!cliente_id || !concepto || !monto_usd) {
        return res.status(400).json({ success: false, error: 'Datos incompletos.' });
    }

    try {
        await runAsync(`
            INSERT INTO deudas_internet (cliente_id, concepto, monto_total, monto_pagado, estado)
            VALUES (?, ?, ?, 0, 'pendiente')
        `, [cliente_id, concepto, monto_usd]);

        res.status(200).json({ success: true, message: 'Deuda registrada exitosamente.' });
    } catch (error) {
        console.error('Error creando deuda:', error);
        res.status(500).json({ success: false, error: 'Error al registrar la deuda.' });
    }
};

/**
 * 7. Obtener todas las deudas de un cliente
 */
const obtenerDeudas = async (req, res) => {
    const { id } = req.params; // UUID del cliente
    try {
        const deudas = await queryAsync(`
            SELECT * FROM deudas_internet
            WHERE cliente_id = ?
            ORDER BY fecha_registro DESC
        `, [id]);

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

/**
 * 8. Configuración de Cliente (Día de Cobranza, Celular, Auto Suspensión, etc)
 */
const toggleCorteAutomatico = async (req, res) => {
    const { id } = req.params;
    const { nombre, auto_suspension, dia_cobranza, celular, fecha_nacimiento, sector_id, grupo_pago, saldo_pendiente } = req.body;

    try {
        let sql = `UPDATE clientes_internet SET auto_suspension = ?`;
        let params = [auto_suspension];

        if (nombre !== undefined) {
            sql += `, nombre = ?`;
            params.push(nombre);
        }

        if (dia_cobranza !== undefined) {
            sql += `, dia_cobranza = ?`;
            params.push(parseInt(dia_cobranza) || 5);
        }
        if (celular !== undefined) {
            sql += `, celular = ?`;
            params.push(celular || null);
        }
        if (fecha_nacimiento !== undefined) {
            sql += `, fecha_nacimiento = ?`;
            params.push(fecha_nacimiento || null);
        }
        if (sector_id !== undefined) {
            sql += `, sector_id = ?`;
            params.push(sector_id || null);
        }
        if (grupo_pago !== undefined) {
            sql += `, grupo_pago = ?`;
            params.push(grupo_pago || 'mensual');
        }
        if (saldo_pendiente !== undefined) {
            sql += `, saldo_pendiente = ?`;
            params.push(saldo_pendiente !== null ? parseFloat(saldo_pendiente) : null);
        }

        sql += ` WHERE id = ?`;
        params.push(id);

        console.log('Ejecutando SQL:', sql, params);
        await runAsync(sql, params);

        // --- SINCRONIZACIÓN CON MIKROTIK (Vía REST API para evitar crash !empty) ---
        const clienteInfo = await queryAsync("SELECT ip_address FROM clientes_internet WHERE id = ?", [id]);
        if (clienteInfo && clienteInfo.length > 0 && clienteInfo[0].ip_address && nombre) {
            const ip = clienteInfo[0].ip_address;

            // Función asíncrona de fondo para no bloquear la respuesta HTTP
            const syncMktRest = async () => {
                try {
                    console.log(`[REST] Intentando sincronizar nombre: ${nombre} para IP: ${ip}`);

                    // 1. Buscar el Lease del DHCP Server por IP
                    const leaseRes = await mikrotikRest('get', `/ip/dhcp-server/lease?address=${ip}`);
                    if (leaseRes && leaseRes.data && leaseRes.data.length > 0) {
                        const leaseId = leaseRes.data[0]['.id'];
                        // 2. Actualizar el comment del Lease con el nombre del cliente
                        await mikrotikRest('patch', `/ip/dhcp-server/lease/${leaseId}`, { comment: nombre });
                        console.log(`[REST] Lease DHCP actualizado en MikroTik: comment = "${nombre}"`);
                    } else {
                        console.log(`[REST] No se encontró lease DHCP para IP: ${ip}`);
                    }

                    // 3. Buscar y actualizar comentario en Address List (si existe, ej: Morosos)
                    const alRes = await mikrotikRest('get', `/ip/firewall/address-list?address=${ip}`);
                    if (alRes && alRes.data && alRes.data.length > 0) {
                        for (const entry of alRes.data) {
                            await mikrotikRest('patch', `/ip/firewall/address-list/${entry['.id']}`, {
                                comment: nombre
                            });
                            console.log(`[REST] Address List "${entry.list}" actualizado: comment = "${nombre}"`);
                        }
                    }
                } catch (errRest) {
                    console.error('Error en sincronización REST (MikroTik):', errRest.response ? errRest.response.data : errRest.message);
                }
            };

            syncMktRest(); // Se ejecuta en background
        }

        res.status(200).json({ success: true, message: 'Configuración guardada y sincronizada correctamente.' });
    } catch (error) {
        console.error('Error detallado en toggleCorteAutomatico:', error);
        res.status(500).json({ success: false, error: error.message || 'Error al actualizar configuración.' });
    }
};

/**
 * 9. Activar Internet (Control Libre vía Mikrotik, sin forzar pago)
 */
const activarLibre = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'Faltan datos.' });

    // AQUÍ IRÁ LA LÓGICA MIKROTIK
    // Ejemplo: Quitar de Address-List / Reactivar Simple Queue / Activar PPP Secret dependiendo de la configuración del usuario
    console.log(`[MikroTik] Intentando Activar Libre IP: ${ip_address}`);

    try {
        const api = getMikrotikClient();
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
            console.log('Error MikroTik reactivar libre:', mErr);
        }
        api.close();

        // Actualizamos estado en DB
        await runAsync("UPDATE clientes_internet SET estado = 'activo' WHERE id = ?", [id]);

        res.status(200).json({ success: true, message: 'Cliente REACTIVADO forzosamente' });
    } catch (error) {
        console.error('Error general activar libre:', error);
        res.status(500).json({ success: false, error: 'Error enviando orden al RouterBoard.' });
    }
};

/**
 * 10. Suspender Internet (Control Libre vía Mikrotik)
 */
const suspenderLibre = async (req, res) => {
    const { id, ip_address } = req.body;
    if (!id || !ip_address) return res.status(400).json({ success: false, error: 'Faltan datos.' });

    // AQUÍ IRÁ LA LÓGICA MIKROTIK
    // Ejemplo: Agregar a Address-List / Bloquear Simple Queue por IP
    console.log(`[MikroTik] Intentando Suspender Libre IP: ${ip_address}`);

    try {
        const api = getMikrotikClient();
        const client = await api.connect();
        const addressListMenu = client.menu('/ip/firewall/address-list');

        try {
            await addressListMenu.add({
                list: 'Morosos',
                address: ip_address,
                comment: 'Suspendido manualmente (Modo Libre)'
            });
        } catch (mErr) {
            console.log('Error MikroTik suspender libre (quizás ya existe):', mErr);
        }
        api.close();

        // Actualizamos estado en DB
        await runAsync("UPDATE clientes_internet SET estado = 'suspendido' WHERE id = ?", [id]);

        res.status(200).json({ success: true, message: 'Cliente SUSPENDIDO forzosamente' });
    } catch (error) {
        console.error('Error general suspender libre:', error);
        res.status(500).json({ success: false, error: 'Error enviando orden al RouterBoard.' });
    }
};

/**
 * 11. Promesa de Pago (Convenio / Prórroga)
 */
const promesaPago = async (req, res) => {
    const { id, ip_address, fecha_limite } = req.body;
    if (!id || !ip_address || !fecha_limite) {
        return res.status(400).json({ success: false, error: 'Faltan datos obligatorios para la prórroga.' });
    }

    try {
        // 1. Quitar de Morosos en MikroTik PRIMERO (API Clásica socket 8728) - Misma lógica estable
        const api = getMikrotikClient();
        try {
            console.log(`[API 8728] Intentando remover a IP ${ip_address} de Morosos por PRÓRROGA...`);
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
                            await client.rosApi.write('/ip/firewall/address-list/remove', [
                                `=.id=${rowId}`
                            ]);
                            console.log(`[API 8728] Registro ${rowId} eliminado (Prórroga) para la IP ${ip_address}`);
                        } catch (errRemove) {
                            console.log(`[API 8728] Error eliminando ${rowId}:`, errRemove.message);
                        }
                    }
                }
            } else {
                console.log(`[API 8728] La IP ${ip_address} no se encontró en la lista de Morosos.`);
            }
            api.close();
            
        } catch (mktError) {
            console.error('[API 8728] Error al remover moroso en Prórroga:', mktError.message);
            try { api.close(); } catch (e) { }
            return res.status(500).json({ success: false, error: 'Error de conexión con MikroTik. Intente nuevamente.' });
        }

        // 2. Actualizar estado y fecha_promesa_pago en DB local
        await runAsync(
            "UPDATE clientes_internet SET estado = 'activo', fecha_promesa_pago = ? WHERE id = ?", 
            [fecha_limite, id]
        );

        res.status(200).json({ success: true, message: 'Prórroga registrada y cliente reactivado exitosamente.' });

    } catch (error) {
        console.error('Error detallado en promesaPago:', error.message);
        res.status(500).json({ success: false, error: 'Error al procesar la prórroga en la base de datos.' });
    }
};

/**
 * 12. Tarea CRON: Procesar promesas de pago vencidas
 */
const procesarPromesasVencidas = async () => {
    try {
        console.log('[CRON] Buscando promesas de pago vencidas...');
        // Todos los clientes cuya fecha_promesa_pago sea menor o igual a HOY
        // Formato devuelto puede depender de sqlite/mysql/pg
        const sql = `
            SELECT id, ip_address, nombre 
            FROM clientes_internet 
            WHERE fecha_promesa_pago IS NOT NULL 
            AND fecha_promesa_pago <= CURRENT_DATE
            AND estado != 'suspendido'
        `;
        const vencidos = await queryAsync(sql);
        
        if (!vencidos || vencidos.length === 0) {
            console.log('[CRON] No hay vencimientos de prórroga para suspender hoy.');
            return;
        }

        console.log(`[CRON] Se encontraron ${vencidos.length} clientes con prórroga vencida.`);

        for (const cliente of vencidos) {
            const { id, ip_address, nombre } = cliente;
            console.log(`[CRON] Suspendiendo a ${nombre} (IP: ${ip_address}) por prórroga vencida.`);
            
            // Suspender en base de datos y limpiar la promesa
            await runAsync("UPDATE clientes_internet SET estado = 'suspendido', fecha_promesa_pago = NULL WHERE id = ?", [id]);

            // Suspender en Mikrotik (Socket 8728)
            const api = getMikrotikClient();
            try {
                const clientConnect = await api.connect();
                const addressListMenu = clientConnect.menu('/ip/firewall/address-list');
                await addressListMenu.add({
                    list: 'Morosos',
                    address: ip_address,
                    comment: `${nombre}, Prórroga vencida (Suspendido por Megasystems)`
                });
                clientConnect.close();
            } catch (mErr) {
                console.log(`[CRON] MikroTik Error al suspender ${nombre} (quizás ya existe):`, mErr.message);
                try { api.close(); } catch(e){}
            }
        }
    } catch (error) {
        console.error('[CRON] Error general al procesar promesas vencidas:', error);
    }
};

/**
 * 13. Marcar pago del mes actual manualmente
 */
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

/**
 * 14. CRON: Resetear estado_pago_mes el día 1 de cada mes
 */
const resetearPagosMes = async () => {
    try {
        await runAsync("UPDATE clientes_internet SET estado_pago_mes = 'pendiente' WHERE estado_pago_mes = 'pagado'");
        console.log('[CRON] Estado de pago mensual reseteado para todos los clientes.');
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
