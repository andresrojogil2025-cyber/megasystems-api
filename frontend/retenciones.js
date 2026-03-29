const API_URL = '/api';
const formatVez = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    let allClients = [];
    let selectedClientId = null;
    let clientInvoices = [];
    let selectedInvoice = null;

    // Elementos DOM
    const searchClient = document.getElementById('searchClient');
    const clientsDropdown = document.getElementById('clientsDropdown');
    const facturaSelect = document.getElementById('factura_id');
    const retencionForm = document.getElementById('retencionForm');
    const tableBody = document.getElementById('retencionesTableBody');
    const clientLabel = document.getElementById('clientNameLabel');
    const selectedInfo = document.getElementById('selectedClientInfo');
    const invoiceDetailsBox = document.getElementById('invoiceDetailsBox');
    const impuestoTipo = document.getElementById('impuesto_tipo');
    const porcentajeRetencion = document.getElementById('porcentaje_retencion');
    const montoRetenido = document.getElementById('monto_retenido_ves');
    const porcentajeContainer = document.getElementById('porcentajeContainer');

    // 1. Cargar Clientes para autocompletado
    async function loadData() {
        try {
            const res = await fetch(`${API_URL}/entidades`);
            const data = await res.json();
            if(data.success) allClients = data.data.filter(e => e.tipo === 'cliente');
            
            loadRetenciones();
        } catch (e) { console.error("Error cargando clientes:", e); }
    }

    // 2. Cargar historial de retenciones
    async function loadRetenciones() {
        try {
            const res = await fetch(`${API_URL}/retenciones`);
            const data = await res.json();
            
            tableBody.innerHTML = '';
            if(data.success && data.data.length > 0) {
                data.data.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${r.fecha_retencion.split(' ')[0]}</td>
                        <td><strong>${r.nro_comprobante}</strong></td>
                        <td>${r.cliente_nombre}<br><small>${r.cliente_rif}</small></td>
                        <td>Factura: ${r.nro_factura}</td>
                        <td style="font-weight:600;">${formatVez(r.monto_retenido_ves)}</td>
                        <td><span class="badge-iva">${r.impuesto_tipo}</span></td>
                    `;
                    tableBody.appendChild(tr);
                });
            } else {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:gray;">No hay retenciones registradas.</td></tr>';
            }
        } catch (e) { console.error("Error cargando retenciones:", e); }
    }

    // 3. Autocompletado de Clientes
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

    async function selectClient(c) {
        selectedClientId = c.id;
        searchClient.value = c.nombre_razon;
        clientLabel.innerText = `${c.nombre_razon} (${c.rif})`;
        selectedInfo.style.display = 'block';
        clientsDropdown.style.display = 'none';
        
        // Cargar facturas de este cliente
        facturaSelect.disabled = false;
        facturaSelect.innerHTML = '<option value="">Cargando facturas...</option>';
        
        // Limpiar detalles de factura
        invoiceDetailsBox.style.display = 'none';
        selectedInvoice = null;
        montoRetenido.value = '';
        
        try {
            const resF = await fetch(`${API_URL}/entidades/${c.id}/facturas`); 
            const dataF = await resF.json();
            
            facturaSelect.innerHTML = '<option value="">Seleccione Factura Afectada</option>';
            if(dataF.success && dataF.data.length > 0) {
                clientInvoices = dataF.data;
                clientInvoices.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = `Factura: ${f.nro_factura} (Total: ${formatVez(f.total_ves)} Bs.)`;
                    facturaSelect.appendChild(opt);
                });
            } else {
                clientInvoices = [];
                facturaSelect.innerHTML = '<option value="">No hay facturas para este cliente</option>';
            }
        } catch (e) {
            clientInvoices = [];
            facturaSelect.innerHTML = '<option value="">Error cargando facturas</option>';
        }
    }

    // 4. Mostrar detalles de factura seleccionada y calcular retención
    facturaSelect.addEventListener('change', (e) => {
        const fId = e.target.value;
        if (!fId) {
            invoiceDetailsBox.style.display = 'none';
            selectedInvoice = null;
            montoRetenido.value = '';
            return;
        }

        selectedInvoice = clientInvoices.find(f => f.id == fId);
        if (selectedInvoice) {
            document.getElementById('lbl_fecha_factura').innerText = selectedInvoice.fecha.split(' ')[0];
            document.getElementById('lbl_nro_factura').innerText = selectedInvoice.nro_factura;
            document.getElementById('lbl_nro_control').innerText = selectedInvoice.nro_control;
            document.getElementById('lbl_base_imponible').innerText = formatVez(selectedInvoice.subtotal_ves);
            document.getElementById('lbl_monto_iva').innerText = formatVez(selectedInvoice.iva_ves);
            document.getElementById('lbl_total_factura').innerText = formatVez(selectedInvoice.total_ves);
            
            invoiceDetailsBox.style.display = 'block';
            calcularRetencion();
        }
    });

    // 5. Calcular retención
    function calcularRetencion() {
        if (!selectedInvoice) return;
        
        const tipo = impuestoTipo.value;
        if (tipo === 'IVA') {
            porcentajeContainer.style.display = 'block';
            const porcentaje = parseFloat(porcentajeRetencion.value) || 0;
            const iva = parseFloat(selectedInvoice.iva_ves) || 0;
            const retenido = (iva * (porcentaje / 100)).toFixed(3);
            montoRetenido.value = retenido;
        } else {
            porcentajeContainer.style.display = 'none';
            montoRetenido.value = ''; // El ISLR normalmente es distinto y se calcula diferente
        }
    }

    impuestoTipo.addEventListener('change', calcularRetencion);
    porcentajeRetencion.addEventListener('input', calcularRetencion);

    // Cerrar dropdown si clic fuera
    document.addEventListener('click', (e) => {
        if(!searchClient.contains(e.target) && !clientsDropdown.contains(e.target)) clientsDropdown.style.display = 'none';
    });

    // 6. Guardar Retención
    retencionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            fecha_retencion: document.getElementById('fecha_retencion').value,
            nro_comprobante: document.getElementById('nro_comprobante').value,
            cliente_id: selectedClientId,
            factura_id: facturaSelect.value,
            monto_retenido_ves: document.getElementById('monto_retenido_ves').value,
            impuesto_tipo: document.getElementById('impuesto_tipo').value
        };

        try {
            const res = await fetch(`${API_URL}/retenciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if(data.success) {
                alert("Retención registrada con éxito");
                retencionForm.reset();
                selectedInfo.style.display = 'none';
                invoiceDetailsBox.style.display = 'none';
                facturaSelect.disabled = true;
                selectedInvoice = null;
                clientInvoices = [];
                loadRetenciones();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) { alert("Error de conexión"); }
    });

    // Inicializar
    loadData();
    // Setear fecha de hoy por defecto
    document.getElementById('fecha_retencion').valueAsDate = new Date();
});
