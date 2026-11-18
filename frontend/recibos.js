const API_URL = '/api';
const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

document.addEventListener('DOMContentLoaded', async () => {

    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    // 1. Obtener y setear tasa BCV (forzada a 2 decimales)
    let rate = parseFloat(localStorage.getItem('rate')) || 0;
    rate = Math.round(rate * 100) / 100;
    document.getElementById('displayBcvRate').innerText = rate ? formatVez(rate) : "Desconocida";
    if (!rate) alert("Sin tasa BCV: Las conversiones a Bolívares aparecerán en 0.");

    let allClients = [];
    let activeClientId = null;

    const searchClient = document.getElementById('searchClient');
    const clientsDropdown = document.getElementById('clientsDropdown');
    const selectedClientBox = document.getElementById('selectedClientBox');
    const labelCN = document.getElementById('labelClientName');
    const labelCRif = document.getElementById('labelClientRif');

    const montoInput = document.getElementById('montoPago');
    const monedaSelect = document.getElementById('monedaPago');

    // --- Gestión de Fechas e Historial de Tasas ---
    const reciboDateInput = document.getElementById('reciboDate');
    const todayStr = new Date().toISOString().split('T')[0];
    reciboDateInput.value = todayStr;

    async function fetchRateForDate(fecha) {
        try {
            const res = await fetch(`${API_URL}/bcv/rate/${fecha}`);
            const data = await res.json();

            if (data.success) {
                rate = data.rate;
            } else {
                const manual = prompt(`No hay una tasa registrada en el historial para el día ${fecha}.\n\n¿Deseas ingresar la tasa manualmente para que el sistema la recuerde?`, data.fallbackRate);

                if (manual !== null) {
                    const valManual = parseFloat(manual.replace(',', '.'));
                    if (!isNaN(valManual) && valManual > 0) {
                        rate = valManual;
                        await fetch(`${API_URL}/bcv/rate-manual`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ rate: rate, fecha: fecha })
                        });
                        alert(`¡Excelente! Tasa del día ${fecha} guardada: ${rate} Bs/USD.`);
                    } else {
                        alert("Tasa inválida. Se usará la tasa de respaldo.");
                        rate = data.fallbackRate;
                    }
                } else {
                    rate = data.fallbackRate;
                }
            }
            document.getElementById('displayBcvRate').innerText = rate ? formatVez(rate) : "Desconocida";
            calculateResumen();
        } catch (error) {
            console.error("Error al cargar tasa histórica:", error);
        }
    }

    reciboDateInput.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if (selectedDate) fetchRateForDate(selectedDate);
    });
    // ---------------------------------------------------

    async function loadClients() {
        try {
            const resC = await fetch(`${API_URL}/entidades`);
            const dataC = await resC.json();
            if (dataC.success) allClients = dataC.data.filter(e => e.tipo === 'cliente');
        } catch (e) { console.error("Error Clientes:", e); }
    }
    await loadClients();
    selectedClientBox.style.display = 'none';

    // ======== AUTOCOMPLETADO DE CLIENTES ========
    searchClient.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        clientsDropdown.innerHTML = '';
        if (!val) { clientsDropdown.style.display = 'none'; return; }

        const filtered = allClients.filter(c => c.nombre_razon.toLowerCase().includes(val) || c.rif.toLowerCase().includes(val));

        if (filtered.length > 0) {
            filtered.forEach(c => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${c.nombre_razon}</strong> <small>(${c.rif})</small>`;
                div.onclick = () => selectClient(c);
                clientsDropdown.appendChild(div);
            });
            clientsDropdown.style.display = 'block';
        } else {
            clientsDropdown.style.display = 'none';
        }
    });

    function selectClient(c) {
        activeClientId = c.id;
        labelCN.innerText = c.nombre_razon;
        labelCRif.innerText = c.rif;

        searchClient.value = '';
        clientsDropdown.style.display = 'none';
        selectedClientBox.style.display = 'block';
    }

    document.addEventListener('click', (e) => {
        if (!searchClient.contains(e.target) && !clientsDropdown.contains(e.target)) clientsDropdown.style.display = 'none';
    });

    // ======== RESUMEN EN VIVO ========
    function calculateResumen() {
        const montoIngresado = parseFloat(montoInput.value) || 0;
        const moneda = monedaSelect.value;

        const montoUsd = moneda === 'VES' ? (rate > 0 ? montoIngresado / rate : 0) : montoIngresado;
        const montoVes = moneda === 'VES' ? montoIngresado : (rate > 0 ? montoIngresado * rate : 0);

        document.getElementById('montoResumenUsd').innerText = formatVez(montoUsd);
        document.getElementById('montoResumenVes').innerText = formatVez(montoVes);
    }

    montoInput.addEventListener('input', calculateResumen);
    monedaSelect.addEventListener('change', calculateResumen);

    // ======== ENVÍO DE DATOS A EXPRESS ========
    async function sendRecibo() {
        if (!activeClientId) return alert("Por favor, selecciona o busca el Cliente que realizó el pago.");
        const montoIngresado = parseFloat(montoInput.value) || 0;
        if (montoIngresado <= 0) return alert("Ingresa un monto válido.");

        try {
            const payload = {
                client_id: activeClientId,
                monto: montoIngresado,
                moneda: monedaSelect.value,
                tasa_bcv_hoy: rate,
                metodo_pago: document.getElementById('metodoPago').value,
                concepto: document.getElementById('concepto').value,
                observaciones: document.getElementById('observaciones').value,
                modo_moneda: document.getElementById('modoMoneda').value,
                fecha_documento: reciboDateInput.value
            };

            const res = await fetch(`${API_URL}/recibos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                const montoVesMsg = data.data.monto_ves ? `\nBolívares: Bs.${formatVez(data.data.monto_ves)}` : '';
                if (confirm(`¡Recibo ${data.data.nro_recibo} generado exitosamente!\n\nMonto: $${formatVez(data.data.monto_usd)}${montoVesMsg}\n\n¿Desea abrir el diseño para Imprimirlo o guardarlo como PDF ahora?`)) {
                    window.location.href = `print_recibo.html?id=${data.data.id}`;
                }

                activeClientId = null;
                selectedClientBox.style.display = 'none';
                montoInput.value = '';
                monedaSelect.value = 'USD';
                document.getElementById('metodoPago').value = 'efectivo';
                document.getElementById('concepto').value = '';
                document.getElementById('observaciones').value = '';
                document.getElementById('modoMoneda').value = 'ambas';
                calculateResumen();
            } else {
                alert(data.error || 'Ocurrió un error guardando el recibo en base de datos.');
            }
        } catch (error) {
            alert("Falló la conexión al servidor Node.js");
        }
    }

    document.getElementById('btnGenerarRecibo').addEventListener('click', sendRecibo);

    // ======== HISTORIAL DE RECIBOS ========
    let allRecibos = [];

    async function loadHistorial() {
        try {
            const res = await fetch(`${API_URL}/recibos`);
            const data = await res.json();
            if (data.success) {
                allRecibos = data.data;
                renderHistorial(allRecibos);
            }
        } catch(e) {
            document.getElementById('historialBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#ef4444;">Error cargando historial.</td></tr>';
        }
    }

    function renderHistorial(lista) {
        const tbody = document.getElementById('historialBody');
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--color-text-muted);">No hay recibos registrados.</td></tr>';
            return;
        }
        tbody.innerHTML = lista.map(r => {
            const fechaStr = (r.fecha || '').split('T')[0];
            const [fy, fm, fd] = fechaStr.split('-');
            const fecha = `${fd}/${fm}/${fy}`;
            const montoUsd = parseFloat(r.monto_usd || 0);
            const montoVes = parseFloat(r.monto_ves || 0);
            return `<tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:10px 12px; font-weight:600; color:var(--color-primary);">${r.nro_recibo}</td>
                <td style="padding:10px 12px;">${fecha}</td>
                <td style="padding:10px 12px;">${r.cliente_nombre || '-'}</td>
                <td style="padding:10px 12px; color:var(--color-text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.concepto || '-'}</td>
                <td style="padding:10px 12px; text-align:right; font-weight:600;">$${formatVez(montoUsd)}</td>
                <td style="padding:10px 12px; text-align:right; color:#059669; font-weight:600;">Bs.${formatVez(montoVes)}</td>
                <td style="padding:10px 12px; text-align:center;">
                    <a href="print_recibo.html?id=${r.id}" target="_blank" style="background:var(--color-primary); color:white; padding:5px 12px; border-radius:4px; text-decoration:none; font-size:0.8rem; font-weight:600;">Ver / Imprimir</a>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('searchHistorial').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        if (!q) { renderHistorial(allRecibos); return; }
        renderHistorial(allRecibos.filter(r =>
            (r.nro_recibo || '').toLowerCase().includes(q) ||
            (r.cliente_nombre || '').toLowerCase().includes(q) ||
            (r.concepto || '').toLowerCase().includes(q)
        ));
    });

    await loadHistorial();

    // ======== CREACIÓN RÁPIDA DE CLIENTE DESDE MODAL ========
    const formNuevoCliente = document.getElementById('formNuevoCliente');
    if (formNuevoCliente) {
        formNuevoCliente.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                tipo: 'cliente',
                nombre_razon: document.getElementById('nuevoClienteNombre').value,
                rif: document.getElementById('nuevoClienteRif').value,
                telefono: document.getElementById('nuevoClienteTlf').value,
                email: '',
                direccion: ''
            };

            try {
                const res = await fetch(`${API_URL}/entidades`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    alert('Cliente registrado exitosamente');
                    formNuevoCliente.reset();
                    document.getElementById('modalNuevoCliente').style.display = 'none';

                    await loadClients();

                    const newlyCreated = allClients.find(c => c.id === data.id);
                    if (newlyCreated) {
                        selectClient(newlyCreated);
                    }
                } else {
                    alert(data.error || 'Error guardando el cliente, verifique si el RIF ya existe.');
                }
            } catch (error) {
                alert('Falló la conexión al servidor Node.js al crear el cliente.');
            }
        });
    }
});
