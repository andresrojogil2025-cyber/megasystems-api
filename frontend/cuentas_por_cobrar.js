const API_URL = '/api';
const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
const formatFecha = (fechaStr) => new Date(fechaStr).toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificación de sesión
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    let allClients = [];
    let selectedClientId = null;
    let bcvRate = 0;
    let currentCuentas = [];
    let selectedCuentaId = null;

    // DOM Elements
    const tableBody = document.getElementById('cuentasTableBody');
    const filterEstado = document.getElementById('filterEstado');
    const searchClient = document.getElementById('searchClient');
    const clientsDropdown = document.getElementById('clientsDropdown');
    const selectedInfo = document.getElementById('selectedClientInfo');
    const clientLabel = document.getElementById('clientNameLabel');
    const deudaForm = document.getElementById('deudaForm');
    const paymentModal = document.getElementById('paymentModal');
    const paymentForm = document.getElementById('paymentForm');
    
    // Payment Modal Elements
    const payClientName = document.getElementById('payClientName');
    const payTotalPending = document.getElementById('payTotalPending');
    const currentBcvRateLabel = document.getElementById('currentBcvRate');
    const payAmountUsd = document.getElementById('payAmountUsd');
    const payAmountVesLabel = document.getElementById('payAmountVes');
    const payDate = document.getElementById('payDate');

    // --- Tasa BCV según la fecha en que se recibió el pago ---
    async function fetchRateForDate(fecha) {
        try {
            const res = await fetch(`${API_URL}/bcv/rate/${fecha}`);
            const data = await res.json();

            if (data.success) {
                bcvRate = data.rate;
            } else {
                const manual = prompt(`No hay una tasa registrada en el historial para el día ${fecha}.\n\n¿Deseas ingresar la tasa manualmente para que el sistema la recuerde?`, data.fallbackRate);

                if (manual !== null) {
                    const valManual = parseFloat(manual.replace(',', '.'));
                    if (!isNaN(valManual) && valManual > 0) {
                        bcvRate = valManual;
                        await fetch(`${API_URL}/bcv/rate-manual`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ rate: bcvRate, fecha: fecha })
                        });
                        alert(`¡Excelente! Tasa del día ${fecha} guardada: ${bcvRate} Bs/USD.`);
                    } else {
                        alert("Tasa inválida. Se usará la tasa de respaldo.");
                        bcvRate = data.fallbackRate;
                    }
                } else {
                    bcvRate = data.fallbackRate;
                }
            }
            currentBcvRateLabel.innerText = formatVez(bcvRate);
            updateVesPreview();
        } catch (error) {
            console.error("Error al cargar tasa histórica:", error);
        }
    }

    payDate.addEventListener('change', (e) => {
        if (e.target.value) fetchRateForDate(e.target.value);
    });
    // ---------------------------------------------------

    // 2. Cargar Tasa BCV
    async function loadBcvRate() {
        try {
            const res = await fetch(`${API_URL}/bcv/rate`);
            const data = await res.json();
            if (data.success) {
                bcvRate = data.rate;
                currentBcvRateLabel.innerText = formatVez(bcvRate);
            }
        } catch (e) { console.error("Error cargando tasa BCV:", e); }
    }

    // 3. Cargar Clientes
    async function loadClients() {
        try {
            const res = await fetch(`${API_URL}/entidades?tipo=cliente`);
            const data = await res.json();
            if (data.success) allClients = data.data;
        } catch (e) { console.error("Error cargando clientes:", e); }
    }

    // 4. Cargar Cuentas por Cobrar
    async function loadCuentas() {
        try {
            const estado = filterEstado.value;
            const res = await fetch(`${API_URL}/cuentas?estado=${estado}`);
            const data = await res.json();
            
            tableBody.innerHTML = '';
            if (data.success && data.data.length > 0) {
                currentCuentas = data.data;
                data.data.forEach(c => {
                    const tr = document.createElement('tr');
                    const isPending = c.estado === 'pendiente';
                    
                    tr.innerHTML = `
                        <td><strong>${c.cliente_nombre}</strong><br><small>${c.cliente_rif}</small></td>
                        <td>${formatFecha(c.fecha_credito)}</td>
                        <td>$${formatVez(c.monto_total_usd)}</td>
                        <td style="color: ${isPending ? '#ef4444' : '#10b981'}; font-weight: 700;">$${formatVez(c.monto_pendiente_usd)}</td>
                        <td><span class="badge ${isPending ? 'badge-pending' : 'badge-paid'}">${c.estado.toUpperCase()}</span></td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-icon" title="Editar Deuda" style="color:#6366f1;" onclick="openEditModal(${c.id})"><i class="ph ph-pencil-simple"></i></button>
                                ${isPending ? `<button class="btn-icon btn-payment" title="Registrar Pago" onclick="openPaymentModal(${c.id})"><i class="ph ph-hand-coins"></i></button>` : ''}
                                <button class="btn-icon btn-whatsapp" title="Enviar WhatsApp" onclick="sendWhatsApp(${c.id})"><i class="ph ph-whatsapp-logo"></i></button>
                                <button class="btn-icon btn-email" title="Enviar Correo" onclick="sendEmail(${c.id})"><i class="ph ph-envelope"></i></button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray; padding: 40px;">No se encontraron deudas.</td></tr>';
            }
        } catch (e) { console.error("Error cargando cuentas:", e); }
    }

    // 5. Autocompletado de Clientes
    searchClient.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        clientsDropdown.innerHTML = '';
        if(!val) { clientsDropdown.style.display = 'none'; return; }
        
        const filtered = allClients.filter(c => c.nombre_razon.toLowerCase().includes(val) || c.rif.toLowerCase().includes(val));
        if(filtered.length > 0) {
            filtered.forEach(c => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${c.nombre_razon}</strong> <small>(${c.rif})</small>`;
                div.onclick = () => {
                    selectedClientId = c.id;
                    searchClient.value = c.nombre_razon;
                    clientLabel.innerText = `${c.nombre_razon} (${c.rif})`;
                    selectedInfo.style.display = 'block';
                    clientsDropdown.style.display = 'none';
                };
                clientsDropdown.appendChild(div);
            });
            clientsDropdown.style.display = 'block';
        } else {
            clientsDropdown.style.display = 'none';
        }
    });

    // Cerrar dropdown si clic fuera
    document.addEventListener('click', (e) => {
        if(!searchClient.contains(e.target) && !clientsDropdown.contains(e.target)) clientsDropdown.style.display = 'none';
    });

    // 6. Registrar Nueva Deuda
    deudaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!selectedClientId) return alert("Seleccione un cliente");

        const payload = {
            cliente_id: selectedClientId,
            monto_total_usd: document.getElementById('monto_total_usd').value,
            fecha_credito: document.getElementById('fecha_credito').value,
            notas: document.getElementById('notas_deuda').value
        };

        try {
            const res = await fetch(`${API_URL}/cuentas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if(data.success) {
                alert("Deuda registrada correctamente.");
                deudaForm.reset();
                selectedInfo.style.display = 'none';
                selectedClientId = null;
                document.getElementById('fecha_credito').valueAsDate = new Date();
                loadCuentas();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) { alert("Error de conexión"); }
    });

    // 7. Edición de Deuda (Modal)
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    let editingCuentaId = null;

    window.openEditModal = (id) => {
        const cuenta = currentCuentas.find(c => c.id === id);
        if (!cuenta) return;

        editingCuentaId = id;

        document.getElementById('editPreviewCliente').innerText = `${cuenta.cliente_nombre} (${cuenta.cliente_rif})`;
        document.getElementById('editPreviewConcepto').innerText = cuenta.notas || 'Sin especificar';
        document.getElementById('editPreviewMonto').innerText = formatVez(cuenta.monto_total_usd);
        document.getElementById('editPreviewFecha').innerText = formatFecha(cuenta.fecha_credito);

        document.getElementById('editMontoTotal').value = cuenta.monto_total_usd;
        document.getElementById('editFechaCredito').value = new Date(cuenta.fecha_credito).toISOString().split('T')[0];
        document.getElementById('editNotas').value = cuenta.notas || '';

        editModal.style.display = 'flex';
    };

    window.closeEditModal = () => {
        editModal.style.display = 'none';
    };

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            monto_total_usd: parseFloat(document.getElementById('editMontoTotal').value),
            fecha_credito: document.getElementById('editFechaCredito').value,
            notas: document.getElementById('editNotas').value
        };

        try {
            const res = await fetch(`${API_URL}/cuentas/${editingCuentaId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                alert(`Deuda actualizada. Nuevo saldo pendiente: $${formatVez(data.nuevo_pendiente)}`);
                closeEditModal();
                loadCuentas();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) { alert("Error de conexión"); }
    });

    // 8. Gestión de Pagos (Modal)
    window.openPaymentModal = (id) => {
        const cuenta = currentCuentas.find(c => c.id === id);
        if(!cuenta) return;

        selectedCuentaId = id;
        payClientName.innerText = cuenta.cliente_nombre;
        payTotalPending.innerText = `$${formatVez(cuenta.monto_pendiente_usd)}`;
        payAmountUsd.value = cuenta.monto_pendiente_usd;
        payAmountUsd.max = cuenta.monto_pendiente_usd;
        payDate.value = new Date().toISOString().split('T')[0];

        currentBcvRateLabel.innerText = formatVez(bcvRate);
        updateVesPreview();
        paymentModal.style.display = 'flex';
    };

    window.closeModal = () => {
        paymentModal.style.display = 'none';
        paymentForm.reset();
    };

    function updateVesPreview() {
        const usd = parseFloat(payAmountUsd.value) || 0;
        const ves = usd * bcvRate;
        payAmountVesLabel.innerText = formatVez(ves);
    }

    payAmountUsd.addEventListener('input', updateVesPreview);

    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usd = parseFloat(payAmountUsd.value);
        const ves = usd * bcvRate;

        const payload = {
            monto_pagado_usd: usd,
            monto_pagado_ves: ves,
            tasa_bcv: bcvRate,
            metodo_pago: document.getElementById('payMethod').value,
            notas: document.getElementById('payNotes').value,
            fecha_pago: payDate.value
        };

        try {
            const res = await fetch(`${API_URL}/cuentas/${selectedCuentaId}/abonos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if(data.success) {
                closeModal();
                loadCuentas();
                if (confirm(`${data.message}\n\nSaldo pendiente actual: $${formatVez(data.nuevo_pendiente)}\n\n¿Desea abrir el recibo del abono para imprimirlo o guardarlo como PDF?`)) {
                    window.location.href = `print_abono.html?id=${data.abono_id}`;
                }
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) { alert("Error de conexión"); }
    });

    // 9. Notificaciones
    window.sendWhatsApp = (id) => {
        const c = currentCuentas.find(x => x.id === id);
        if(!c) return;

        const telefono = c.cliente_telefono || '';
        const cleanPhone = telefono.replace(/\D/g, ''); // Solo números
        const mensaje = `Hola ${c.cliente_nombre}, le saludamos de Megasystems. Le informamos que posee una deuda pendiente por un monto de $${formatVez(c.monto_pendiente_usd)} (${formatVez(c.monto_pendiente_usd * bcvRate)} Bs. a la tasa de hoy ${formatVez(bcvRate)}). Quedamos atentos a su pago. ¡Gracias!`;
        
        const url = `https://wa.me/${cleanPhone.startsWith('58') ? '' : '58'}${cleanPhone}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    };

    window.sendEmail = (id) => {
        const c = currentCuentas.find(x => x.id === id);
        if(!c) return;

        const subject = "Recordatorio de Pago - Megasystems";
        const body = `Hola ${c.cliente_nombre},\n\nLe informamos que posee un saldo pendiente con nosotros.\n\nMonto Pendiente: $${formatVez(c.monto_pendiente_usd)}\nEquivalente en Bolívares: ${formatVez(c.monto_pendiente_usd * bcvRate)} Bs.\nTasa aplicada (BCV): ${formatVez(bcvRate)} Bs/USD\n\nPor favor, realice su pago a la brevedad posible.\n\nAtentamente,\nMegasystems`;
        
        const url = `mailto:${c.cliente_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = url;
    };

    filterEstado.addEventListener('change', loadCuentas);

    // Inicializar
    document.getElementById('fecha_credito').valueAsDate = new Date();
    await loadBcvRate();
    await loadClients();
    await loadCuentas();
});
