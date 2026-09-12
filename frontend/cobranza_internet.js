// Variables Globales
let clientesCache = [];

// API URL (Relativa o absoluta dependiendo de cómo está desplegado)
const API_URL = 'http://localhost:3050/api/mikrotik';
// Podrías necesitar ajustar esto si usas window.location.origin para producción

document.addEventListener('DOMContentLoaded', () => {
    cargarClientes();
});

// Función para mostrar la alerta de carga total (pantalla completa)
function mostrarCargaPantalla(texto) {
    document.getElementById('loadingText').textContent = texto;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function ocultarCargaPantalla() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// 1. Obtener la lista de clientes desde la BD
async function cargarClientes() {
    try {
        const respuesta = await fetch(`${API_URL}/clientes`);
        const json = await respuesta.json();

        if (json.success) {
            clientesCache = json.data;
            renderTabla();
        } else {
            console.error('Error del servidor:', json.error);
        }
    } catch (err) {
        console.error('Error realizando el fetch de clientes:', err);
    }
}

// Renderiza la tabla y los contadores
function renderTabla(filtro = '') {
    const tbody = document.getElementById('clientesBody');
    tbody.innerHTML = '';

    let busqueda = clientesCache;
    if (filtro) {
        busqueda = clientesCache.filter(c => 
            c.nombre.toLowerCase().includes(filtro.toLowerCase()) || 
            (c.ip_address && c.ip_address.includes(filtro)) ||
            (c.plan_mikrotik && c.plan_mikrotik.toLowerCase().includes(filtro.toLowerCase()))
        );
    }

    let activos = 0;
    let suspendidos = 0;
    let prorrogas = 0;
    busqueda.forEach(c => {
        if (c.estado === 'activo') activos++;
        if (c.estado === 'suspendido') suspendidos++;
        if (c.fecha_promesa_pago && c.fecha_promesa_pago !== 'null') prorrogas++;
    });

    // Actualizar Estadísticas siempre en base a la búsqueda
    document.getElementById('statTotal').innerText = busqueda.length;
    document.getElementById('statActivos').innerText = activos;
    document.getElementById('statMorosos').innerText = suspendidos;
    document.getElementById('statProrroga').innerText = prorrogas;

    // Aplicar el filtro de estado actual a la vista de la tabla
    let filtrados = busqueda;
    if (window.filtroEstadoActual === 'prorroga') {
        filtrados = busqueda.filter(c => c.fecha_promesa_pago && c.fecha_promesa_pago !== 'null');
    } else if (window.filtroEstadoActual && window.filtroEstadoActual !== 'todos') {
        filtrados = busqueda.filter(c => c.estado === window.filtroEstadoActual);
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 30px;">
            <i class="ph ph-wifi-slash" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 10px; display:block;"></i>
            No se encontraron clientes en este estado o filtro de búsqueda.
        </td></tr>`;
    } else {
        filtrados.forEach(c => {
            const estadoHtml = c.estado === 'activo' 
                ? `<span class="status-badge activo"><i class="ph ph-check-circle"></i> Activo</span>`
                : `<span class="status-badge suspendido"><i class="ph ph-warning-circle"></i> Suspendido</span>`;

            // Badge si tiene convenio (no se corta)
            let convenioHtml = c.auto_suspension === false 
                ? `<div style="font-size:0.75rem; color:#d97706; margin-top:4px;"><i class="ph ph-handshake"></i> Sin Corte Automático</div>` 
                : `<div style="font-size:0.75rem; color:#64748b; margin-top:4px;">Corte: Día ${c.dia_cobranza || 5}</div>`;

            if (c.fecha_promesa_pago && c.fecha_promesa_pago !== 'null') {
                const fTo = new Date(c.fecha_promesa_pago).toLocaleDateString('es-VE');
                convenioHtml += `<div style="font-size:0.75rem; color:#8b5cf6; margin-top:4px; font-weight:700;"><i class="ph ph-calendar-plus"></i> Prórroga hasta: ${fTo}</div>`;
            }

            // Botón primario de Mikrotik (Cortar/Reactivar+Pagar)
            const btnHtml = c.estado === 'activo'
                ? `<button class="btn-action btn-suspend" onclick="confirmarSuspension('${c.id}')"><i class="ph ph-power"></i> Cortar</button>`
                : `<button class="btn-action btn-pay" onclick="abrirModalPago('${c.id}')"><i class="ph ph-money"></i> Pagar / Reactivar</button> 
                   <button class="btn-action" style="background:#ede9fe; color:#8b5cf6; margin-left:4px;" onclick="abrirPromesaModal('${c.id}')"><i class="ph ph-calendar-plus"></i> Prórroga</button>`;

            // Extras
            const extraBtns = `
                <button title="Estado de Cuenta" class="btn-action" style="background:#f1f5f9; color:#0ea5e9;" onclick="abrirEstadoCuenta('${c.id}')"><i class="ph ph-receipt"></i></button>
                <button title="Configurar Cliente" class="btn-action" style="background:#f1f5f9; color:#475569;" onclick="abrirConfigCliente('${c.id}')"><i class="ph ph-gear"></i></button>
            `;

            const deleteBtn = `<button title="Eliminar del Sistema" class="btn-delete" onclick="eliminarCliente('${c.id}')"><i class="ph ph-trash"></i></button>`;

            const planTxt = c.plan_mikrotik ? c.plan_mikrotik : '<span style="color:#94a3b8">Básico</span>';
            const ipTxt = c.ip_address ? c.ip_address : '';
            const macTxt = c.mac_address ? c.mac_address : '';

            tbody.innerHTML += `
                <tr>
                    <td style="font-weight: 500;">
                        ${c.nombre}
                        ${convenioHtml}
                    </td>
                    <td>${planTxt}</td>
                    <td style="font-family: monospace; font-size: 0.85rem; color: #64748b;">
                        <div><i class="ph ph-globe" style="color: #0ea5e9;"></i> ${ipTxt}</div>
                        <div><i class="ph ph-cpu"></i> ${macTxt}</div>
                    </td>
                    <td>${estadoHtml}</td>
                    <td style="display:flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                        ${btnHtml} 
                        ${extraBtns}
                        ${deleteBtn}
                    </td>
                </tr>
            `;
        });
    }
}

// 2. Sincronizar clientes desde el Router MikroTik
async function sincronizarMikrotik() {
    if (!confirm('Esta acción leerá todos los equipos y colas de tu MikroTik y actualizará la base de datos de Megasystems. ¿Deseas continuar?')) return;

    mostrarCargaPantalla('Conectando a MikroTik y sincronizando datos...');
    try {
        const respuesta = await fetch(`${API_URL}/importar`);
        const json = await respuesta.json();
        
        if (json.success) {
            alert(`✅ ${json.message}`);
            await cargarClientes(); // Recargar la tabla
        } else {
            alert(`⚠️ Hubo un problema: ${json.error}`);
        }
    } catch (err) {
        alert('❌ Error de comunicación con el Backend. Revisa que el servidor Node esté corriendo.');
    } finally {
        ocultarCargaPantalla();
    }
}

// Filtrar la tabla desde el buscador
function filtrarTabla() {
    const filtro = document.getElementById('searchInput').value;
    renderTabla(filtro);
}

// Cambiar el filtro de estado global al clickear las tarjetas
window.filtroEstadoActual = 'todos';
function setFiltroEstado(estado) {
    window.filtroEstadoActual = estado;
    filtrarTabla(); // Re-renderizar
}

// 3. Suspender Internet (Cortar servicio)
async function confirmarSuspension(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;
    const ip = c.ip_address;
    const nombre = c.nombre;

    if (!ip) {
        alert(`❌ El cliente ${nombre} no tiene una IP registrada. Deberás resincronizar el MikroTik.`);
        return;
    }

    if (confirm(`¿Estás seguro que deseas CORTAR el internet a ${nombre}? (Se enviará su IP al Address List de Morosos en MikroTik)`)) {
        mostrarCargaPantalla(`Desconectando a ${nombre}...`);
        try {
            const peticion = await fetch(`${API_URL}/suspender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, ip_address: ip })
            });
            const json = await peticion.json();
            
            if (json.success) {
                // Actualizar visualmente para que se vea rápido
                await cargarClientes();
            } else {
                alert(`⚠️ Error al cortar el internet: ${json.error}`);
            }
        } catch (e) {
            alert('❌ Ocurrió un error en la plataforma. Intenta nuevamente.');
        } finally {
            ocultarCargaPantalla();
        }
    }
}

// 4. Eliminar Cliente Permanente
async function eliminarCliente(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;
    const ip = c.ip_address;
    const nombre = c.nombre;

    if (confirm(`¿Estás seguro que deseas ELIMINAR permanentemente a ${nombre}? \nSe borrará de Megasystems y también se limpiará su IP del DHCP/ARP del MikroTik para que no vuelva a aparecer.`)) {
        mostrarCargaPantalla(`Eliminando a ${nombre}...`);
        try {
            const peticion = await fetch(`${API_URL}/eliminar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, ip_address: ip })
            });
            const json = await peticion.json();
            
            if (json.success) {
                await cargarClientes();
            } else {
                alert(`⚠️ Error al eliminar: ${json.error}`);
            }
        } catch (e) {
            alert('❌ Ocurrió un error de red al intentar eliminar.');
        } finally {
            ocultarCargaPantalla();
        }
    }
}

// MODAL DE PAGO Y REACTIVACIÓN

// AUTOCOMPLETADO SEGÚN EL PLAN
function autoCompletarMonto() {
    const comboPlan = document.getElementById('pagoPlanDropdown');
    const inputMonto = document.getElementById('pagoMonto');
    
    if (comboPlan.value === 'otro') {
        inputMonto.value = '';
        inputMonto.readOnly = false;
        inputMonto.focus();
    } else {
        inputMonto.value = comboPlan.value; // Será 10 o 20
        inputMonto.readOnly = true;
    }
}

function abrirModalPago(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;
    const ip = c.ip_address;
    const nombre = c.nombre;

    document.getElementById('modalClienteId').value = id;
    document.getElementById('modalClienteIp').value = ip;
    document.getElementById('modalClienteNombre').textContent = nombre;
    
    // Reset form states
    document.getElementById('pagoForm').reset();
    
    // Resetear readonly en inputMonto por si acaso
    document.getElementById('pagoMonto').readOnly = true;
    
    // Autocompletar la fecha mensual a la actual by default (ahora en texto)
    const now = new Date();
    const opcionesMes = { month: 'long', year: 'numeric' };
    const currentMonth = now.toLocaleDateString('es-ES', opcionesMes);
    document.getElementById('pagoMes').value = currentMonth;

    document.getElementById('pagoModal').classList.add('active');
}

function cerrarModal() {
    document.getElementById('pagoModal').classList.remove('active');
}

// 4. Procesar el Pago y Reactivar en MikroTik
async function procesarReactivacion(e) {
    e.preventDefault();
    
    const id = document.getElementById('modalClienteId').value;
    const ip = document.getElementById('modalClienteIp').value;
    const monto = document.getElementById('pagoMonto').value;
    const mes_pagado = document.getElementById('pagoMes').value;
    const metodo_pago = document.getElementById('pagoMetodo').value;
    const referencia = document.getElementById('pagoReferencia').value;

    cerrarModal();
    mostrarCargaPantalla('Registrando pago y reactivando internet...');
    
    try {
        const peticion = await fetch(`${API_URL}/reactivar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id, ip_address: ip, monto, mes_pagado, metodo_pago, referencia 
            })
        });
        const json = await peticion.json();
        
        if (json.success) {
            await cargarClientes();
            // Lógica adicional (opcional): si quieres que también emita una factura en Megasystems!
            alert('✅ Pago registrado con éxito y cliente REACTIVADO en MikroTik.');
        } else {
            alert(`⚠️ Error al reactivar internet: ${json.error}`);
        }
    } catch (err) {
        alert('❌ Ocurrió un error interno durante el proceso.');
    } finally {
        ocultarCargaPantalla();
    }
}

// =============================
// MODAL ESTADO DE CUENTA
// =============================
async function abrirEstadoCuenta(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;
    const nombre = c.nombre;

    document.getElementById('modalEcClienteId').value = id;
    document.getElementById('modalEcClienteNombre').innerText = nombre;
    document.getElementById('estadoCuentaModal').classList.add('active');
    await cargarDeudas(id);
}

function cerrarEstadoCuenta() {
    document.getElementById('estadoCuentaModal').classList.remove('active');
    document.getElementById('formAgregarDeuda').reset();
}

async function cargarDeudas(clienteId) {
    const tbody = document.getElementById('deudasBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando deudas...</td></tr>';
    
    try {
        const req = await fetch(`${API_URL}/clientes/${clienteId}/deudas`);
        const res = await req.json();
        
        if (res.success) {
            document.getElementById('modalEcTotal').innerText = `$${formatVez(parseFloat(res.totalAdeudado))}`;
            
            if (res.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">No hay historial de deudas</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            res.data.forEach(d => {
                const f = new Date(d.fecha_registro).toLocaleDateString('es-VE');
                const estado = d.estado === 'pagado'
                    ? '<span class="status-badge activo">Pagado</span>'
                    : '<span class="status-badge suspendido">Pendiente</span>';

                tbody.innerHTML += `
                    <tr>
                        <td style="color:#64748b;">${f}</td>
                        <td style="font-weight:600;">${d.concepto}</td>
                        <td>$${formatVez(parseFloat(d.monto_total))}</td>
                        <td>$${formatVez(parseFloat(d.monto_pagado))}</td>
                        <td>${estado}</td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error cargando deudas</td></tr>';
    }
}

async function agregarDeuda(e) {
    e.preventDefault();
    const id = document.getElementById('modalEcClienteId').value;
    const concepto = document.getElementById('deudaConcepto').value;
    const monto = document.getElementById('deudaMonto').value;
    
    try {
        mostrarCargaPantalla('Registrando deuda histórica...');
        const req = await fetch(`${API_URL}/deudas`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cliente_id: id, concepto: concepto, monto_usd: monto })
        });
        const res = await req.json();
        ocultarCargaPantalla();
        
        if (res.success) {
            document.getElementById('formAgregarDeuda').reset();
            cargarDeudas(id); // recargar tabla modal
        } else {
            alert('⚠️ Error: ' + res.error);
        }
    } catch (err) {
        ocultarCargaPantalla();
        alert('❌ Ocurrió un error conectando al servidor.');
    }
}

// =============================
// MODAL CONFIGURACIÓN DE CLIENTE Y SECTORES
// =============================
async function cargarSectores() {
    const select = document.getElementById('confSector');
    try {
        const req = await fetch(`${API_URL}/sectores`);
        const res = await req.json();
        if (res.success) {
            select.innerHTML = '<option value="">Sin Asignar</option>';
            res.data.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
            });
            select.innerHTML += `<option value="nuevo_sector" style="font-weight:bold; color:#0ea5e9;">+ Añadir Nuevo Sector</option>`;
        }
    } catch (e) {
        console.error('Error cargando sectores', e);
    }
}

// Inicializar sectores al cargar la página
cargarSectores();

// Listener para cuando se quiere agregar un sector
document.getElementById('confSector').addEventListener('change', async function() {
    if (this.value === 'nuevo_sector') {
        const nuevoNombre = prompt('Ingrese el nombre del nuevo Sector/Ubicación:');
        if (nuevoNombre && nuevoNombre.trim() !== '') {
            try {
                mostrarCargaPantalla('Creando sector...');
                const req = await fetch(`${API_URL}/sectores`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ nombre: nuevoNombre.trim() })
                });
                const res = await req.json();
                ocultarCargaPantalla();
                if (res.success) {
                    await cargarSectores();
                    this.value = res.data.id;
                } else {
                    alert('Error: ' + res.error);
                    this.value = '';
                }
            } catch (err) {
                ocultarCargaPantalla();
                alert('Ocurrió un error guardando el sector');
                this.value = '';
            }
        } else {
            this.value = '';
        }
    }
});

function abrirConfigCliente(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;

    const nombre = c.nombre;
    const dia_cobranza = c.dia_cobranza || 5;
    const auto_suspension_val = c.auto_suspension !== false;
    const celular = c.celular || '';
    const fecha_nacimiento = c.fecha_nacimiento || '';
    const sector_id = c.sector_id || '';

    document.getElementById('confClienteId').value = id;
    document.getElementById('confNombre').value = nombre || '';
    document.getElementById('confDiaCobranza').value = dia_cobranza;
    document.getElementById('confAutoSuspension').checked = auto_suspension_val;
    document.getElementById('confCelular').value = celular || '';
    
    // El campo de tipo date espera YYYY-MM-DD
    if (fecha_nacimiento && fecha_nacimiento !== 'null') {
        // En supabase si es date puede venir como '1990-01-01' o tener tiempo. Tomamos solo la cita de fecha:
        document.getElementById('confFechaNacimiento').value = fecha_nacimiento.split('T')[0];
    } else {
        document.getElementById('confFechaNacimiento').value = '';
    }
    
    document.getElementById('confSector').value = (sector_id && sector_id !== 'null') ? sector_id : '';
    
    document.getElementById('configClienteModal').classList.add('active');
}

function cerrarConfigCliente() {
    document.getElementById('configClienteModal').classList.remove('active');
}

async function guardarConfigCliente(e) {
    e.preventDefault();
    const id = document.getElementById('confClienteId').value;
    const nombre = document.getElementById('confNombre').value;
    const dia_cobranza = document.getElementById('confDiaCobranza').value;
    const auto_suspension = document.getElementById('confAutoSuspension').checked;
    const celular = document.getElementById('confCelular').value;
    const fecha_nacimiento = document.getElementById('confFechaNacimiento').value;
    const sector_id = document.getElementById('confSector').value;
    
    const bodyArgs = {
        nombre: nombre || 'Sin Nombre',
        auto_suspension: auto_suspension,
        dia_cobranza: dia_cobranza,
        celular: celular || null,
        fecha_nacimiento: fecha_nacimiento || null,
        sector_id: (sector_id !== '' && sector_id !== 'nuevo_sector') ? parseInt(sector_id) : null
    };

    try {
        mostrarCargaPantalla('Actualizando configuración...');
        const req = await fetch(`${API_URL}/clientes/${id}/corte-automatico`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(bodyArgs)
        });
        const res = await req.json();
        ocultarCargaPantalla();
        
        if (res.success) {
            cerrarConfigCliente();
            cargarClientes(); // Recargar tabla
        } else {
            alert('⚠️ Error: ' + res.error);
        }
    } catch (err) {
        ocultarCargaPantalla();
        alert('❌ Ocurrió un error guardando la configuración.');
    }
}

// =============================
// MODAL PROMESA DE PAGO (PRÓRROGA)
// =============================
function abrirPromesaModal(id) {
    const c = clientesCache.find(x => x.id === id);
    if (!c) return;

    document.getElementById('promesaClienteId').value = id;
    document.getElementById('promesaClienteIp').value = c.ip_address;
    document.getElementById('promesaClienteNombre').textContent = c.nombre;
    
    // Setear la fecha actual + 1 día por defecto
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    document.getElementById('promesaFechaLimite').value = manana.toISOString().split('T')[0];

    document.getElementById('promesaModal').classList.add('active');
}

function cerrarPromesaModal() {
    document.getElementById('promesaModal').classList.remove('active');
    document.getElementById('formPromesa').reset();
}

async function procesarPromesa(e) {
    e.preventDefault();
    const id = document.getElementById('promesaClienteId').value;
    const ip_address = document.getElementById('promesaClienteIp').value;
    const fecha_limite = document.getElementById('promesaFechaLimite').value;

    cerrarPromesaModal();
    mostrarCargaPantalla('Registrando prórroga y reactivando internet...');
    
    try {
        const peticion = await fetch(`${API_URL}/promesa-pago`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ip_address, fecha_limite })
        });
        const json = await peticion.json();
        
        if (json.success) {
            await cargarClientes();
            alert('✅ Prórroga registrada. Internet reactivado hasta la fecha límite.');
        } else {
            alert(`⚠️ Error al reactivar prórroga: ${json.error}`);
        }
    } catch (err) {
        alert('❌ Ocurrió un error interno durante el proceso.');
    } finally {
        ocultarCargaPantalla();
    }
}
