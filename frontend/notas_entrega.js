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
    let allCatalog = [];
    let activeClientId = null;
    let currentItems = [];

    const searchClient = document.getElementById('searchClient');
    const clientsDropdown = document.getElementById('clientsDropdown');
    const selectedClientBox = document.getElementById('selectedClientBox');
    const labelCN = document.getElementById('labelClientName');
    const labelCRif = document.getElementById('labelClientRif');

    const searchCatalog = document.getElementById('searchCatalog');
    const catalogDropdown = document.getElementById('catalogDropdown');
    const tbody = document.getElementById('invoiceItemsBody');

    let currentSubtotalUsd = 0;
    const descuentoMontoInput = document.getElementById('descuentoMonto');
    const descuentoMonedaSelect = document.getElementById('descuentoMoneda');
    descuentoMontoInput.addEventListener('input', () => calculateTotals(currentSubtotalUsd));
    descuentoMonedaSelect.addEventListener('change', () => calculateTotals(currentSubtotalUsd));

    // --- Gestión de Fechas e Historial de Tasas ---
    const invoiceDateInput = document.getElementById('invoiceDate');
    const todayStr = new Date().toISOString().split('T')[0];
    invoiceDateInput.value = todayStr;

    async function fetchRateForDate(fecha) {
        try {
            const res = await fetch(`${API_URL}/bcv/rate/${fecha}`);
            const data = await res.json();

            if (data.success) {
                rate = data.rate;
                console.log(`Tasa cargada para ${fecha}: ${rate}`);
            } else {
                console.warn(`Sin tasa para ${fecha}. Fallback: ${data.fallbackRate}`);
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
            renderTable();
        } catch (error) {
            console.error("Error al cargar tasa histórica:", error);
        }
    }

    invoiceDateInput.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if (selectedDate) fetchRateForDate(selectedDate);
    });
    // ---------------------------------------------------

    // Módulos de carga inicial (Resilientes)
    async function loadDBs() {
        try {
            const resC = await fetch(`${API_URL}/entidades`);
            const dataC = await resC.json();
            if (dataC.success) allClients = dataC.data.filter(e => e.tipo === 'cliente');
        } catch (e) { console.error("Error Clientes:", e); }

        try {
            const resI = await fetch(`${API_URL}/catalogo`);
            const dataI = await resI.json();
            if (dataI.success) allCatalog = dataI.data;
        } catch (e) { console.error("Error Catálogo:", e); }
    }
    await loadDBs();
    selectedClientBox.style.display = 'none';

    // Cargar ítems desde historial (sessionStorage)
    const preloadItems = sessionStorage.getItem('preload_items');
    if (preloadItems) {
        const items = JSON.parse(preloadItems);
        const nro = sessionStorage.getItem('preload_from') || '';
        sessionStorage.removeItem('preload_items');
        sessionStorage.removeItem('preload_from');
        currentItems = items;
        renderTable();
        alert(`${items.length} ítem(s) cargados de ${nro}.\nSelecciona el cliente para continuar.`);
    }

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

    // ======== AUTOCOMPLETADO DE CATÁLOGO ========
    searchCatalog.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        catalogDropdown.innerHTML = '';
        if (!val) { catalogDropdown.style.display = 'none'; return; }

        const filtered = allCatalog.filter(i => i.nombre.toLowerCase().includes(val) || (i.descripcion || '').toLowerCase().includes(val));

        if (filtered.length > 0) {
            filtered.forEach(i => {
                const div = document.createElement('div');
                div.innerHTML = `<span class="badge ${i.tipo}" style="font-size:0.6rem!important;">${i.tipo.toUpperCase()}</span> <strong>${i.nombre}</strong> - $${formatVez(i.precio_usd)}`;
                div.onclick = () => { addItemToInvoice(i); searchCatalog.value = ''; catalogDropdown.style.display = 'none'; };
                catalogDropdown.appendChild(div);
            });
            catalogDropdown.style.display = 'block';
        } else {
            catalogDropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchClient.contains(e.target) && !clientsDropdown.contains(e.target)) clientsDropdown.style.display = 'none';
        if (!searchCatalog.contains(e.target) && !catalogDropdown.contains(e.target)) catalogDropdown.style.display = 'none';
    });

    // ======== TABLA DE ÍTEMS ========
    function addItemToInvoice(itemDb) {
        const existing = currentItems.find(i => i.catalogo_id === itemDb.id);
        if (existing) {
            existing.cantidad += 1;
        } else {
            currentItems.push({
                catalogo_id: itemDb.id,
                nombre: itemDb.nombre,
                precio_usd: parseFloat(itemDb.precio_usd),
                cantidad: 1
            });
        }
        renderTable();
    }

    window.updateQty = (id, elm) => {
        const item = currentItems.find(i => i.catalogo_id === id);
        if (item) {
            let val = parseInt(elm.value);
            if (isNaN(val) || val < 1) val = 1;
            item.cantidad = val;
            renderTable();
        }
    };

    window.updatePriceUsd = (id, elm) => {
        const item = currentItems.find(i => i.catalogo_id === id);
        if (!item) return;
        let val = parseFloat(elm.value);
        if (isNaN(val) || val < 0) val = 0;
        item.precio_usd = val;
        renderTable();
    };

    window.updatePriceVes = (id, elm) => {
        const item = currentItems.find(i => i.catalogo_id === id);
        if (!item) return;
        let valVes = parseFloat(elm.value);
        if (isNaN(valVes) || valVes < 0) valVes = 0;
        item.precio_usd = rate > 0 ? +(valVes / rate).toFixed(4) : 0;
        renderTable();
    };

    window.deleteItem = (id) => {
        currentItems = currentItems.filter(i => i.catalogo_id !== id);
        renderTable();
    };

    function renderTable() {
        if (currentItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:gray;">Agregue productos al carrito buscando arriba.</td></tr>';
            calculateTotals(0);
            return;
        }

        tbody.innerHTML = '';
        let subUsd = 0;

        currentItems.forEach(item => {
            const pUsd = parseFloat(item.precio_usd) || 0;
            const lineUsd = pUsd * item.cantidad;
            const priceVes = pUsd * rate;
            const lineVes = lineUsd * rate;
            subUsd += lineUsd;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.nombre}</strong></td>
                <td>
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
                        <span style="font-size:0.75rem;color:#6b7280;font-weight:600;">$</span>
                        <input type="number" step="0.01" min="0" value="${pUsd.toFixed(2)}"
                               onchange="updatePriceUsd(${item.catalogo_id}, this)"
                               style="width:80px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-weight:600;color:var(--color-secondary);">
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:0.75rem;color:#1d4ed8;font-weight:600;">Bs.</span>
                        <input type="number" step="0.01" min="0" value="${priceVes.toFixed(2)}"
                               onchange="updatePriceVes(${item.catalogo_id}, this)"
                               style="width:100px;padding:4px 6px;border:1px solid #bfdbfe;border-radius:5px;font-weight:500;color:#1d4ed8;font-size:0.85rem;">
                    </div>
                </td>
                <td><input type="number" class="qty" value="${item.cantidad}" onchange="updateQty(${item.catalogo_id}, this)"></td>
                <td style="font-weight:600;">
                    $${formatVez(lineUsd)} <br>
                    <small style="color:var(--color-secondary); font-weight:500; font-size: 0.8rem;">Bs. ${formatVez(lineVes)}</small>
                </td>
                <td><button class="btn-delete" onclick="deleteItem(${item.catalogo_id})" title="Quitar"><i class="ph ph-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        calculateTotals(subUsd);
    }

    function calculateTotals(subtotalUsd) {
        currentSubtotalUsd = subtotalUsd;

        document.getElementById('totSubUsd').innerText = formatVez(subtotalUsd);
        document.getElementById('totSubVes').innerText = rate > 0 ? formatVez(subtotalUsd * rate) : "0,00";

        // Convertir el descuento ingresado (en USD o VES) a USD, moneda canónica interna
        const descuentoMonto = parseFloat(descuentoMontoInput.value) || 0;
        const descuentoMoneda = descuentoMonedaSelect.value;
        let descuentoUsd = descuentoMoneda === 'VES' ? (rate > 0 ? descuentoMonto / rate : 0) : descuentoMonto;
        if (descuentoUsd < 0) descuentoUsd = 0;

        const totalUsd = Math.max(0, subtotalUsd - descuentoUsd);
        const totalVes = rate > 0 ? totalUsd * rate : 0;

        document.getElementById('totGrandUsd').innerText = formatVez(totalUsd);
        document.getElementById('totGrandVes').innerText = rate > 0 ? formatVez(totalVes) : "0,00";
    }

    // ======== ENVÍO DE DATOS A EXPRESS ========
    async function sendNota() {
        if (!activeClientId) return alert("Por favor, selecciona o busca el Cliente al que le emitirás la nota de entrega.");
        if (currentItems.length === 0) return alert("La nota de entrega está vacía. Añade items del catálogo.");

        try {
            const payload = {
                client_id: activeClientId,
                items: currentItems,
                observaciones: document.getElementById('observaciones').value,
                fecha_documento: invoiceDateInput.value,
                tasa_bcv_hoy: rate,
                descuento_monto: parseFloat(descuentoMontoInput.value) || 0,
                descuento_moneda: descuentoMonedaSelect.value
            };

            const res = await fetch(`${API_URL}/notas-entrega`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                const totalVesMsg = data.data.total_ves ? `\nBolívares: Bs.${formatVez(data.data.total_ves)}` : '';
                if (confirm(`¡Nota de Entrega ${data.data.nro_nota_entrega} generada exitosamente!\n\nTotal: $${formatVez(data.data.total_usd)}${totalVesMsg}\n\n¿Desea abrir el diseño para Imprimirla o guardarla como PDF ahora?`)) {
                    window.location.href = `print_nota_entrega.html?id=${data.data.id}`;
                }

                currentItems = [];
                activeClientId = null;
                selectedClientBox.style.display = 'none';
                document.getElementById('observaciones').value = '';
                descuentoMontoInput.value = 0;
                descuentoMonedaSelect.value = 'USD';
                renderTable();
            } else {
                alert(data.error || 'Ocurrió un error guardando el documento en base de datos.');
            }
        } catch (error) {
            alert("Falló la conexión al servidor Node.js");
        }
    }

    document.getElementById('btnProcesarNota').addEventListener('click', sendNota);

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

                    await loadDBs();

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
