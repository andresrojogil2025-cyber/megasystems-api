// Lógica viva conectada a SQLite 
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
    if(!rate) alert("Sin tasa BCV: Las conversiones a Bolívares aparecerán en 0.");

    let allClients = [];
    let allCatalog = [];
    let activeClientId = null;
    let currentItems = []; // Array of invoice rows

    let allQuotes = [];
    let activeQuoteId = null;

    // DOM Elements
    const searchQuote = document.getElementById('searchQuote');
    const quotesDropdown = document.getElementById('quotesDropdown');

    const searchClient = document.getElementById('searchClient');
    const clientsDropdown = document.getElementById('clientsDropdown');
    const selectedClientBox = document.getElementById('selectedClientBox');
    const labelCN = document.getElementById('labelClientName');
    const labelCRif = document.getElementById('labelClientRif');

    const searchCatalog = document.getElementById('searchCatalog');
    const catalogDropdown = document.getElementById('catalogDropdown');
    const tbody = document.getElementById('invoiceItemsBody');

    // --- NUEVO: Gestión de Fechas e Historial de Tasas ---
    const invoiceDateInput = document.getElementById('invoiceDate');
    const todayStr = new Date().toISOString().split('T')[0];
    invoiceDateInput.value = todayStr;

    async function fetchRateForDate(fecha) {
        try {
            const res = await fetch(`${API_URL}/bcv/rate/${fecha}`);
            const data = await res.json();
            
            if(data.success) {
                rate = data.rate;
                console.log(`Tasa cargada para ${fecha}: ${rate}`);
            } else {
                // Si no hay tasa, preguntar al usuario si desea ingresarla
                console.warn(`Sin tasa para ${fecha}. Fallback: ${data.fallbackRate}`);
                const manual = prompt(`No hay una tasa registrada en el historial para el día ${fecha}.\n\n¿Deseas ingresar la tasa manualmente para que el sistema la recuerde?`, data.fallbackRate);
                
                if (manual !== null) { // El usuario no canceló
                    const valManual = parseFloat(manual.replace(',', '.'));
                    if (!isNaN(valManual) && valManual > 0) {
                        rate = valManual;
                        // Guardar para esta fecha en el backend
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
                    // Usuario canceló, usar fallback pero avisar
                    rate = data.fallbackRate;
                }
            }
            // Actualizar visualización de la tasa y recalcular tabla
            document.getElementById('displayBcvRate').innerText = rate ? formatVez(rate) : "Desconocida";
            renderTable();
        } catch (error) {
            console.error("Error al cargar tasa histórica:", error);
        }
    }

    invoiceDateInput.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if(selectedDate) fetchRateForDate(selectedDate);
    });
    // ---------------------------------------------------

    // Módulos de carga inicial (Resilientes)
    async function loadDBs() {
        // Clientes
        try {
            const resC = await fetch(`${API_URL}/entidades`);
            const dataC = await resC.json();
            if(dataC.success) allClients = dataC.data.filter(e => e.tipo === 'cliente');
        } catch (e) { console.error("Error Clientes:", e); }

        // Catálogo
        try {
            const resI = await fetch(`${API_URL}/catalogo`);
            const dataI = await resI.json();
            if(dataI.success) allCatalog = dataI.data;
        } catch (e) { console.error("Error Catálogo:", e); }

        // Cotizaciones
        try {
            const resQ = await fetch(`${API_URL}/billing/quotes`);
            const dataQ = await resQ.json();
            if(dataQ.success) allQuotes = dataQ.data;
        } catch (e) { console.error("Error Cotizaciones:", e); }
    }
    await loadDBs();
    selectedClientBox.style.display = 'none';
    await loadFromUrl();

    // ======== AUTOCOMPLETADO DE COTIZACIONES ========
    function filterQuotes(val) {
        quotesDropdown.innerHTML = '';
        const searchVal = (val || "").toLowerCase().trim();

        const filtered = allQuotes.filter(q =>
            q.nro_cotizacion.toLowerCase().includes(searchVal) ||
            (q.cliente_nombre || "").toLowerCase().includes(searchVal) ||
            (q.cliente_rif || "").toLowerCase().includes(searchVal)
        );

        if(filtered.length > 0) {
            filtered.forEach(q => {
                const div = document.createElement('div');
                div.style.cssText = "padding:8px 10px;border-bottom:1px solid #f3f4f6;";
                div.innerHTML = `
                    <div style="margin-bottom:5px;">
                        <i class="ph ph-file-text" style="color:var(--color-primary);"></i>
                        <strong>${q.nro_cotizacion}</strong>
                        <small style="color:#6b7280;"> · ${q.cliente_nombre}</small>
                    </div>
                    <div style="display:flex;gap:5px;">
                        <button onclick="loadQuoteDetails(${q.id})" style="flex:1;padding:4px 6px;font-size:0.76rem;background:#1e3a8a;color:white;border:none;border-radius:4px;cursor:pointer;">
                            Cargar completa (con cliente)
                        </button>
                        <button onclick="loadQuoteItemsOnly(${q.id})" style="flex:1;padding:4px 6px;font-size:0.76rem;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:4px;cursor:pointer;">
                            Solo ítems (otro cliente)
                        </button>
                    </div>`;
                quotesDropdown.appendChild(div);
            });
            quotesDropdown.style.display = 'block';
        } else if (searchVal !== "") {
            quotesDropdown.innerHTML = '<div style="padding:10px; color:gray; text-align:center;">No hay cotizaciones pendientes para esta búsqueda.</div>';
            quotesDropdown.style.display = 'block';
        } else {
            quotesDropdown.style.display = 'none';
        }
    }

    searchQuote.addEventListener('input', (e) => filterQuotes(e.target.value));
    searchQuote.addEventListener('focus', (e) => {
        if(allQuotes.length > 0) filterQuotes(e.target.value);
    });

    window.loadQuoteDetails = async function(id) {
        try {
            const res = await fetch(`${API_URL}/billing/quote/${id}`);
            const data = await res.json();
            if(data.success) {
                const q = data.data;
                activeQuoteId = q.id;
                selectClient(q.cliente);
                currentItems = q.items.map(item => ({
                    catalogo_id: item.catalogo_id,
                    nombre: item.item_nombre,
                    precio_usd: item.precio_unitario_usd,
                    cantidad: item.cantidad
                }));
                renderTable();
                searchQuote.value = q.nro_cotizacion;
                quotesDropdown.style.display = 'none';
                document.getElementById('btnImprimirCotizacion').style.display = 'block';
                alert(`Cotización ${q.nro_cotizacion} cargada con éxito.`);
            }
        } catch (error) {
            alert("Error al cargar detalles de la cotización");
        }
    };

    window.loadQuoteItemsOnly = async function(id) {
        try {
            const res = await fetch(`${API_URL}/billing/quote/${id}`);
            const data = await res.json();
            if(data.success) {
                const q = data.data;
                currentItems = q.items.map(item => ({
                    catalogo_id: item.catalogo_id,
                    nombre: item.item_nombre,
                    precio_usd: item.precio_unitario_usd,
                    cantidad: item.cantidad
                }));
                renderTable();
                searchQuote.value = `Ítems de ${q.nro_cotizacion}`;
                quotesDropdown.style.display = 'none';
                alert(`${q.items.length} ítem(s) cargados de ${q.nro_cotizacion}.\nAhora selecciona el cliente para esta nueva cotización.`);
            }
        } catch (error) {
            alert("Error al cargar ítems de la cotización");
        }
    };

    async function loadFromUrl() {
        const preload = sessionStorage.getItem('preload_items');
        if (!preload) return;
        const items = JSON.parse(preload);
        const nro = sessionStorage.getItem('preload_from') || '';
        sessionStorage.removeItem('preload_items');
        sessionStorage.removeItem('preload_from');
        currentItems = items;
        searchQuote.value = `Ítems de ${nro}`;
        renderTable();
        alert(`${items.length} ítem(s) cargados de ${nro}.\nSelecciona el cliente para continuar.`);
    }

    // ======== AUTOCOMPLETADO DE CLIENTES ========
    searchClient.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        clientsDropdown.innerHTML = '';
        if(!val) { clientsDropdown.style.display = 'none'; return; }
        
        const filtered = allClients.filter(c => c.nombre_razon.toLowerCase().includes(val) || c.rif.toLowerCase().includes(val));
        
        if(filtered.length > 0) {
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
        if(!val) { catalogDropdown.style.display = 'none'; return; }
        
        const filtered = allCatalog.filter(i => i.nombre.toLowerCase().includes(val) || (i.descripcion||'').toLowerCase().includes(val));
        
        if(filtered.length > 0) {
            filtered.forEach(i => {
                const div = document.createElement('div');
                div.innerHTML = `<span class="badge ${i.tipo}" style="font-size:0.6rem!important;">${i.tipo.toUpperCase()}</span> <strong>${i.nombre}</strong> - $${formatVez(i.precio_usd)}`;
                div.onclick = () => { addItemToInvoice(i); searchCatalog.value = ''; catalogDropdown.style.display='none';};
                catalogDropdown.appendChild(div);
            });
            catalogDropdown.style.display = 'block';
        } else {
             catalogDropdown.style.display = 'none';
        }
    });

    // Cerrar dropdowns si se hace clic fuera
    document.addEventListener('click', (e) => {
        if(!searchQuote.contains(e.target) && !quotesDropdown.contains(e.target)) quotesDropdown.style.display = 'none';
        if(!searchClient.contains(e.target) && !clientsDropdown.contains(e.target)) clientsDropdown.style.display = 'none';
        if(!searchCatalog.contains(e.target) && !catalogDropdown.contains(e.target)) catalogDropdown.style.display = 'none';
    });

    // ======== TABLA DE FACTURACIÓN ========
    function addItemToInvoice(itemDb) {
        const existing = currentItems.find(i => i.catalogo_id === itemDb.id);
        if(existing) {
            existing.cantidad += 1;
        } else {
            // Asegurar que el precio sea convertido a número para evitar crashes del toFixed
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
        if(item) {
            let val = parseInt(elm.value);
            if(isNaN(val) || val < 1) val = 1;
            item.cantidad = val;
            renderTable();
        }
    };

    function parseVez(val) {
        const clean = (val || '').toString()
            .replace(/\./g, '')
            .replace(',', '.');
        return parseFloat(clean) || 0;
    }

    window.updatePriceUsd = (id, elm) => {
        const item = currentItems.find(i => i.catalogo_id === id);
        if(!item) return;
        item.precio_usd = parseVez(elm.value);
        renderTable();
    };

    window.updatePriceVes = (id, elm) => {
        const item = currentItems.find(i => i.catalogo_id === id);
        if(!item) return;
        const valVes = parseVez(elm.value);
        item.precio_usd = rate > 0 ? +(valVes / rate).toFixed(4) : 0;
        renderTable();
    };

    window.deleteItem = (id) => {
        currentItems = currentItems.filter(i => i.catalogo_id !== id);
        renderTable();
    };

    function renderTable() {
        if(currentItems.length === 0) {
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
                        <input type="text" inputmode="decimal" value="${formatVez(pUsd)}"
                               onchange="updatePriceUsd(${item.catalogo_id}, this)"
                               style="width:80px;padding:4px 6px;border:1px solid #d1d5db;border-radius:5px;font-weight:600;color:var(--color-secondary);">
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:0.75rem;color:#1d4ed8;font-weight:600;">Bs.</span>
                        <input type="text" inputmode="decimal" value="${formatVez(priceVes)}"
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
        const ivaUsd = subtotalUsd * 0.16;
        const totalUsd = subtotalUsd + ivaUsd;

        document.getElementById('totSubUsd').innerText = formatVez(subtotalUsd);
        document.getElementById('totIvaUsd').innerText = formatVez(ivaUsd);
        document.getElementById('totGrandUsd').innerText = formatVez(totalUsd);

        if(rate > 0) {
            document.getElementById('totSubVes').innerText = formatVez(subtotalUsd * rate);
            document.getElementById('totIvaVes').innerText = formatVez(ivaUsd * rate);
            document.getElementById('totGrandVes').innerText = formatVez(totalUsd * rate);
        } else {
            document.getElementById('totSubVes').innerText = "0,00";
            document.getElementById('totIvaVes').innerText = "0,00";
            document.getElementById('totGrandVes').innerText = "0,00";
        }
    }

    // ======== ENVÍO DE DATOS A EXPRESS ========
    async function sendCart(endpointInfo) {
        if(!activeClientId) return alert("Por favor, selecciona o busca el Cliente al que le emitirás la factura.");
        if(currentItems.length === 0) return alert("La factura está vacía. Añade items del catálogo.");

        try {
            const payload = {
                client_id: activeClientId,
                items: currentItems,
                tasa_bcv_hoy: rate,
                fecha_documento: invoiceDateInput.value, // Nueva: Enviar fecha seleccionada
                cotizacion_id: activeQuoteId // Se envía si la factura viene de una cotización
            };

            const res = await fetch(`${API_URL}/billing/${endpointInfo}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if(res.ok && data.success) {
                const totalUsd = data.montos?.usd.total || data.data?.total_usd || 0;
                const totalVes = data.montos?.ves.total || (totalUsd * rate) || 0;

                if (endpointInfo === 'quote') {
                    if (confirm(`¡Cotización generada exitosamente!\n\nUSD: $${formatVez(totalUsd)}\nBolívares: Bs.${formatVez(totalVes)}\n\n¿Desea abrir el diseño para Imprimirla o guardarla como PDF ahora?`)) {
                        window.location.href = `print_quote.html?id=${data.data.id}`;
                    }
                } else {
                    if (confirm(`¡Factura Fiscal generada exitosamente!\n\nNro: ${data.nro_factura}\nUSD: $${formatVez(totalUsd)}\nBolívares: Bs.${formatVez(totalVes)}\n\n¿Abrir vista de impresión?`)) {
                        window.open(`print_invoice.html?id=${data.id}`, '_blank');
                    }
                }

                // Limpiar
                currentItems = [];
                activeClientId = null;
                activeQuoteId = null; // Resetear ID de cotización
                searchQuote.value = '';
                selectedClientBox.style.display = 'none';
                document.getElementById('btnImprimirCotizacion').style.display = 'none';
                renderTable();
                
                // Recargar lista de cotizaciones por si se generó una nueva
                await loadDBs();
            } else {
                alert(data.error || 'Ocurrió un error guardando el documento en base de datos.');
            }
        } catch (error) {
           alert("Falló la conexión al servidor Node.js");
        }
    }

    document.getElementById('btnProcesarFactura').addEventListener('click', () => sendCart('invoice'));
    document.getElementById('btnProcesarCotizacion').addEventListener('click', () => sendCart('quote'));

    document.getElementById('btnImprimirCotizacion').addEventListener('click', () => {
        if(activeQuoteId) window.location.href = `print_quote.html?id=${activeQuoteId}`;
        else alert('No hay ninguna cotización cargada para imprimir.');
    });

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
                    
                    // Recargar DB local para que el cliente exista en memoria
                    await loadDBs();
                    
                    // Auto-seleccionar el cliente recién creado usando el ID devuelto
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
