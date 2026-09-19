// ── Estado global ────────────────────────────────────────────────────────────
let proveedores = [];
let catalogoCache = [];
let itemsCompra = [];    // [{catalogo_id, nombre_item, cantidad, costo_usd}]
let facturaFile = null;
let searchTimeout = null;
let historialData = [];

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('cFecha').value = hoy;

    cargarProveedores();
    cargarHistorial();
    cargarCatalogo();

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrap')) {
            document.getElementById('catalogoDropdown').style.display = 'none';
        }
    });
});

// ── Tabs ─────────────────────────────────────────────────────────────────────
function showTab(tab) {
    document.getElementById('tab-compras').style.display = tab === 'compras' ? 'block' : 'none';
    document.getElementById('tab-proveedores').style.display = tab === 'proveedores' ? 'block' : 'none';
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', (i === 0 && tab === 'compras') || (i === 1 && tab === 'proveedores'));
    });
    if (tab === 'proveedores') renderTablaProveedores();
}

// ── Proveedores ───────────────────────────────────────────────────────────────
async function cargarProveedores() {
    try {
        const r = await fetch('/api/proveedores');
        const d = await r.json();
        proveedores = d.data || [];
        const sel = document.getElementById('cProveedorId');
        sel.innerHTML = '<option value="">Sin proveedor</option>';
        proveedores.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.nombre}${p.empresa ? ' — ' + p.empresa : ''}</option>`;
        });
    } catch (e) {
        console.error('Error cargando proveedores', e);
    }
}

function renderTablaProveedores() {
    const wrap = document.getElementById('tablaProveedores');
    if (!proveedores.length) {
        wrap.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">No hay proveedores registrados.</p>';
        return;
    }
    wrap.innerHTML = `
    <table class="prov-table">
        <thead><tr>
            <th>Nombre</th><th>RIF</th><th>Empresa</th><th>Teléfono</th><th>Email</th><th></th>
        </tr></thead>
        <tbody>
        ${proveedores.map(p => `
            <tr>
                <td><strong>${p.nombre}</strong></td>
                <td>${p.rif || '—'}</td>
                <td>${p.empresa || '—'}</td>
                <td>${p.telefono || '—'}</td>
                <td>${p.email || '—'}</td>
                <td style="display:flex;gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick="editarProveedor(${p.id})"><i class="ph ph-pencil"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="eliminarProveedor(${p.id})"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join('')}
        </tbody>
    </table>`;
}

let _provModalFromForm = false;

function abrirModalProveedor(id) {
    _provModalFromForm = false;
    document.getElementById('modalProvTitle').textContent = 'Nuevo Proveedor';
    document.getElementById('provId').value = '';
    ['provNombre','provRif','provTelefono','provEmail','provEmpresa','provNotas'].forEach(f => document.getElementById(f).value = '');
    document.getElementById('modalProveedor').classList.add('open');
}

function abrirModalProveedorDesdeForm() {
    _provModalFromForm = true;
    document.getElementById('modalProvTitle').textContent = 'Nuevo Proveedor';
    document.getElementById('provId').value = '';
    ['provNombre','provRif','provTelefono','provEmail','provEmpresa','provNotas'].forEach(f => document.getElementById(f).value = '');
    document.getElementById('modalProveedor').classList.add('open');
}

function editarProveedor(id) {
    const p = proveedores.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalProvTitle').textContent = 'Editar Proveedor';
    document.getElementById('provId').value = p.id;
    document.getElementById('provNombre').value = p.nombre || '';
    document.getElementById('provRif').value = p.rif || '';
    document.getElementById('provTelefono').value = p.telefono || '';
    document.getElementById('provEmail').value = p.email || '';
    document.getElementById('provEmpresa').value = p.empresa || '';
    document.getElementById('provNotas').value = p.notas || '';
    document.getElementById('modalProveedor').classList.add('open');
}

function cerrarModalProveedor() {
    document.getElementById('modalProveedor').classList.remove('open');
}

async function guardarProveedor() {
    const id = document.getElementById('provId').value;
    const nombre = document.getElementById('provNombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio.'); return; }

    const body = {
        nombre,
        rif: document.getElementById('provRif').value.trim(),
        telefono: document.getElementById('provTelefono').value.trim(),
        email: document.getElementById('provEmail').value.trim(),
        empresa: document.getElementById('provEmpresa').value.trim(),
        notas: document.getElementById('provNotas').value.trim()
    };

    try {
        const url = id ? `/api/proveedores/${id}` : '/api/proveedores';
        const method = id ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Error al guardar');
        const nuevoId = d.id || null;
        cerrarModalProveedor();
        await cargarProveedores();
        renderTablaProveedores();
        if (_provModalFromForm && !id && nuevoId) {
            document.getElementById('cProveedorId').value = nuevoId;
        }
        _provModalFromForm = false;
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function eliminarProveedor(id) {
    if (!confirm('¿Eliminar este proveedor?')) return;
    try {
        await fetch(`/api/proveedores/${id}`, { method: 'DELETE' });
        await cargarProveedores();
        renderTablaProveedores();
    } catch (e) {
        alert('Error al eliminar.');
    }
}

// ── Catálogo ──────────────────────────────────────────────────────────────────
async function cargarCatalogo() {
    try {
        const r = await fetch('/api/catalogo');
        const d = await r.json();
        catalogoCache = d.data || [];
    } catch (e) {}
}

function buscarEnCatalogo(q) {
    clearTimeout(searchTimeout);
    const dd = document.getElementById('catalogoDropdown');
    if (!q.trim()) { dd.style.display = 'none'; return; }

    searchTimeout = setTimeout(() => {
        const term = q.toLowerCase();
        const results = catalogoCache.filter(x => x.nombre.toLowerCase().includes(term)).slice(0, 10);
        let html = results.map(x => `
            <div onclick="agregarItem(${x.id}, '${x.nombre.replace(/'/g,"\\'")}', ${x.precio_usd || 0})">
                <strong>${x.nombre}</strong>
                <span style="color:#64748b;font-size:0.8rem;"> — $${parseFloat(x.precio_usd||0).toFixed(2)}</span>
                ${x.stock != null ? `<span style="color:#94a3b8;font-size:0.78rem;"> (stock: ${x.stock})</span>` : ''}
            </div>
        `).join('');
        html += `<div class="crear-nuevo" onclick="abrirModalNuevoProducto('${q.replace(/'/g,"\\'")}')"><i class="ph ph-plus"></i> Crear "${q}" como nuevo producto</div>`;
        dd.innerHTML = html;
        dd.style.display = 'block';
    }, 200);
}

function agregarItem(catalogoId, nombre, precioRef) {
    document.getElementById('buscarProducto').value = '';
    document.getElementById('catalogoDropdown').style.display = 'none';

    // Si ya está en la lista, solo incrementar cantidad
    const exist = itemsCompra.find(x => x.catalogo_id === catalogoId);
    if (exist) { exist.cantidad++; renderItems(); return; }

    itemsCompra.push({ catalogo_id: catalogoId, nombre_item: nombre, cantidad: 1, costo_usd: precioRef });
    renderItems();
}

function catalogoColHTML(item, i) {
    if (item.catalogo_id) {
        const cat = catalogoCache.find(c => c.id === item.catalogo_id);
        const nombre = cat ? (cat.nombre.length > 20 ? cat.nombre.substring(0,20)+'…' : cat.nombre) : '✓';
        return `<span style="background:#dcfce7;color:#16a34a;padding:3px 8px;border-radius:8px;font-size:0.72rem;font-weight:700;display:inline-block;">✓ ${nombre}</span>`;
    }
    if (item.crear_en_catalogo) {
        return `<div style="display:flex;gap:4px;align-items:center;">
            <span style="background:#fef9c3;color:#854d0e;padding:2px 6px;border-radius:6px;font-size:0.7rem;font-weight:700;">NUEVO</span>
            <input type="number" placeholder="Precio $" step="0.01" min="0" value="${item.precio_venta||''}"
                onchange="itemsCompra[${i}].precio_venta=parseFloat(this.value)||0"
                style="width:78px;padding:3px 6px;border:1.5px solid #fde047;border-radius:6px;font-size:0.82rem;">
            <button onclick="itemsCompra[${i}].crear_en_catalogo=false;renderItems()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:15px;padding:0;line-height:1;">✕</button>
        </div>`;
    }
    if (item.catalogo_match) {
        const m = item.catalogo_match;
        const mNombre = m.nombre.length > 18 ? m.nombre.substring(0,18)+'…' : m.nombre;
        return `<div>
            <div style="color:#0369a1;font-size:0.72rem;margin-bottom:3px;">🔍 ${mNombre}</div>
            <div style="display:flex;gap:3px;">
                <button onclick="vincularACatalogo(${i},${m.id})" style="background:#0ea5e9;color:#fff;border:none;border-radius:6px;padding:2px 8px;font-size:0.7rem;cursor:pointer;font-weight:600;">Vincular</button>
                <button onclick="itemsCompra[${i}].catalogo_match=null;itemsCompra[${i}].crear_en_catalogo=true;renderItems()" style="background:#f1f5f9;color:#475569;border:none;border-radius:6px;padding:2px 7px;font-size:0.7rem;cursor:pointer;">Nuevo</button>
            </div>
        </div>`;
    }
    return `<button onclick="itemsCompra[${i}].crear_en_catalogo=true;renderItems()"
        style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:0.72rem;cursor:pointer;font-weight:600;">
        <i class="ph ph-plus"></i> Al catálogo</button>`;
}

function vincularACatalogo(i, catId) {
    itemsCompra[i].catalogo_id = catId;
    itemsCompra[i].crear_en_catalogo = false;
    itemsCompra[i].catalogo_match = null;
    renderItems();
}

function buscarMatchesCatalogo() {
    for (const item of itemsCompra) {
        if (item.catalogo_id || item._matchBuscado) continue;
        item._matchBuscado = true;
        const palabras = item.nombre_item.toLowerCase()
            .replace(/[^a-záéíóúñ0-9\s]/gi, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 5);
        if (!palabras.length) { item.catalogo_match = null; continue; }
        const match = catalogoCache.find(c => {
            const cn = c.nombre.toLowerCase();
            const hits = palabras.filter(w => cn.includes(w));
            return hits.length >= Math.min(2, palabras.length);
        });
        item.catalogo_match = match || null;
    }
}

function renderItems() {
    const tbody = document.getElementById('itemsBody');
    if (!itemsCompra.length) {
        tbody.innerHTML = '<tr id="emptyItemsRow"><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px;">Agrega productos usando el buscador de arriba.</td></tr>';
        actualizarTotal();
        return;
    }
    tbody.innerHTML = itemsCompra.map((item, i) => `
        <tr>
            <td>${item.nombre_item}</td>
            <td><input type="number" min="1" value="${item.cantidad}" onchange="updateItemCant(${i}, this.value)"></td>
            <td><input type="number" class="wide" step="0.01" min="0" value="${parseFloat(item.costo_usd).toFixed(2)}" onchange="updateItemCosto(${i}, this.value)"></td>
            <td style="font-weight:600; color:#16a34a;">$${(item.cantidad * item.costo_usd).toFixed(2)}</td>
            <td>${catalogoColHTML(item, i)}</td>
            <td><button class="btn btn-danger btn-sm" onclick="quitarItem(${i})"><i class="ph ph-x"></i></button></td>
        </tr>
    `).join('');
    actualizarTotal();
}

function updateItemCant(i, v) {
    itemsCompra[i].cantidad = Math.max(1, parseInt(v) || 1);
    renderItems();
}

function updateItemCosto(i, v) {
    itemsCompra[i].costo_usd = parseFloat(v) || 0;
    renderItems();
}

function quitarItem(i) {
    itemsCompra.splice(i, 1);
    renderItems();
}

function actualizarTotal() {
    const total = itemsCompra.reduce((s, x) => s + x.cantidad * x.costo_usd, 0);
    document.getElementById('totalUSD').textContent = '$' + total.toFixed(2);
}

// ── Crear nuevo producto en catálogo ──────────────────────────────────────────
function abrirModalNuevoProducto(nombre) {
    document.getElementById('catalogoDropdown').style.display = 'none';
    document.getElementById('nuevoNombre').value = nombre;
    document.getElementById('nuevoDesc').value = '';
    document.getElementById('nuevoPrecio').value = '';
    document.getElementById('nuevoStock').value = '1';
    document.getElementById('nuevoTipo').value = 'producto';
    document.getElementById('modalNuevoProducto').classList.add('open');
}

function cerrarModalNuevoProducto() {
    document.getElementById('modalNuevoProducto').classList.remove('open');
}

async function crearProductoYAgregar() {
    const nombre = document.getElementById('nuevoNombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio.'); return; }

    const body = {
        tipo: document.getElementById('nuevoTipo').value,
        nombre,
        descripcion: document.getElementById('nuevoDesc').value.trim(),
        precio_usd: parseFloat(document.getElementById('nuevoPrecio').value) || 0,
        stock: parseInt(document.getElementById('nuevoStock').value) || 0
    };

    try {
        const r = await fetch('/api/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        if (!d.success && !d.id) throw new Error(d.error || 'Error creando producto');
        const newId = d.id;
        cerrarModalNuevoProducto();
        await cargarCatalogo();
        agregarItem(newId, nombre, body.precio_usd);
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ── Factura upload ────────────────────────────────────────────────────────────
let facturaItems = [];

async function previewFactura(input) {
    const file = input.files[0];
    if (!file) return;
    facturaFile = file;

    const box = document.getElementById('facturaPreview');
    box.style.display = 'block';
    const badge = document.getElementById('parseBadge');

    // Mostrar preview según tipo
    if (file.type === 'application/pdf') {
        box.innerHTML = `<iframe src="${URL.createObjectURL(file)}"></iframe>`;
    } else {
        const reader = new FileReader();
        reader.onload = e => {
            const src = e.target.result;
            box.innerHTML = `<img src="${src}" alt="Factura" onclick="abrirVisorImagen('${src}')">`;
        };
        reader.readAsDataURL(file);
    }

    // Actualizar zona de upload
    document.getElementById('uploadZone').innerHTML = `
        <i class="ph ph-check-circle" style="color:#16a34a;font-size:2rem;"></i>
        <p style="color:#16a34a;font-weight:600;">${file.name}</p>
        <p style="font-size:0.8rem;color:#64748b;">Haz clic para cambiar el archivo</p>
        <input type="file" id="facturaFile" accept="image/*,.pdf" style="display:none;" onchange="previewFactura(this)">
    `;

    // Intentar extraer ítems (PDF con texto o imagen con OCR)
    const esImagen = file.type.startsWith('image/');
    badge.textContent = esImagen ? 'Leyendo imagen con OCR... (puede tardar unos segundos)' : 'Analizando PDF...';
    badge.className = 'badge-manual';
    badge.style.display = 'inline-block';
    mostrarPanelFacturaItems([]); // Tabla vacía mientras procesa

    try {
        const fd = new FormData();
        fd.append('factura', file);
        const r = await fetch('/api/compras/parse-factura', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.items && d.items.length > 0) {
            const metodos = { gemini: 'Gemini IA', vision: 'Google Vision', claude: 'IA (Claude)', pdf: 'PDF', ocr: 'OCR' };
            const tipo = metodos[d.metodo] || d.metodo;
            badge.textContent = `${d.items.length} ítems detectados via ${tipo} — revisa y corrige si es necesario`;
            badge.className = 'badge-auto';
            mostrarPanelFacturaItems(d.items);
        } else {
            badge.textContent = 'No se detectaron ítems — ingrésalos manualmente en la tabla';
            badge.className = 'badge-manual';
        }
    } catch (e) {
        badge.textContent = 'Error al leer el archivo — ingresa los ítems manualmente';
        badge.className = 'badge-manual';
    }
}

// ── Spreadsheet de ítems de factura ──────────────────────────────────────────
function mostrarPanelFacturaItems(items) {
    facturaItems = items.length
        ? items.map(x => ({ ...x, seleccionado: true }))
        : [{ descripcion: '', cantidad: 1, costo_usd: 0, seleccionado: true }];
    document.getElementById('facturaItemsPanel').style.display = 'block';
    renderFacturaItems();
}

function renderFacturaItems() {
    const tbody = document.getElementById('facturaItemsBody');
    tbody.innerHTML = facturaItems.map((item, i) => `
        <tr>
            <td><input type="checkbox" class="fac-check" ${item.seleccionado ? 'checked' : ''} onchange="facturaItems[${i}].seleccionado=this.checked"></td>
            <td><input type="text" value="${item.descripcion.replace(/"/g,'&quot;')}" placeholder="Descripción del producto..."
                onchange="facturaItems[${i}].descripcion=this.value"
                oninput="facturaItems[${i}].descripcion=this.value"></td>
            <td><input type="number" min="1" value="${item.cantidad}"
                onchange="facturaItems[${i}].cantidad=parseInt(this.value)||1"></td>
            <td><input type="number" step="0.01" min="0" value="${parseFloat(item.costo_usd).toFixed(2)}"
                onchange="facturaItems[${i}].costo_usd=parseFloat(this.value)||0"></td>
            <td><button class="btn btn-danger btn-sm" onclick="removeFacturaRow(${i})" title="Quitar fila"><i class="ph ph-x"></i></button></td>
        </tr>
    `).join('');
}

function addFacturaRow() {
    facturaItems.push({ descripcion: '', cantidad: 1, costo_usd: 0, seleccionado: true });
    renderFacturaItems();
    // Enfocar el último input de descripción
    const inputs = document.querySelectorAll('#facturaItemsBody input[type=text]');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeFacturaRow(i) {
    facturaItems.splice(i, 1);
    if (!facturaItems.length) addFacturaRow();
    else renderFacturaItems();
}

function toggleSelectAllFac(cb) {
    facturaItems.forEach(x => x.seleccionado = cb.checked);
    renderFacturaItems();
    document.getElementById('selectAllFac').checked = cb.checked;
}

function agregarSeleccionadosACompra() {
    const seleccionados = facturaItems.filter(x => x.seleccionado && x.descripcion.trim());
    if (!seleccionados.length) { alert('Selecciona al menos un ítem con descripción.'); return; }

    seleccionados.forEach(item => {
        const desc = item.descripcion.trim();
        const exist = itemsCompra.find(x => x.nombre_item.toLowerCase() === desc.toLowerCase());
        if (exist) {
            exist.cantidad += item.cantidad;
        } else {
            itemsCompra.push({
                catalogo_id: null,
                nombre_item: desc,
                cantidad: item.cantidad || 1,
                costo_usd: item.costo_usd || 0,
                _matchBuscado: false,
                catalogo_match: null,
                crear_en_catalogo: false,
                precio_venta: ''
            });
        }
    });
    buscarMatchesCatalogo();

    renderItems();
    document.getElementById('facturaItemsPanel').style.display = 'none';
    // Scroll hacia la tabla de ítems
    document.getElementById('itemsTable').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Visor imagen ampliado ─────────────────────────────────────────────────────
function abrirVisorImagen(src) {
    document.getElementById('imgViewerSrc').src = src;
    document.getElementById('imgViewer').classList.add('open');
}
function cerrarVisorImagen() {
    document.getElementById('imgViewer').classList.remove('open');
}

// ── Formulario nueva compra ───────────────────────────────────────────────────
function mostrarFormCompra() {
    document.getElementById('btnNuevaCompraWrap').style.display = 'none';
    document.getElementById('formCompraPanel').style.display = 'block';
    itemsCompra = [];
    facturaFile = null;
    renderItems();
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('cFecha').value = hoy;
    document.getElementById('cFactura').value = '';
    document.getElementById('cNotas').value = '';
    document.getElementById('cProveedorId').value = '';
    document.getElementById('facturaPreview').style.display = 'none';
    document.getElementById('uploadZone').innerHTML = `
        <i class="ph ph-upload-simple"></i>
        <p>Haz clic para subir una imagen (JPG, PNG) o PDF de la factura del proveedor</p>
        <input type="file" id="facturaFile" accept="image/*,.pdf" style="display:none;" onchange="previewFactura(this)">
    `;
}

function cancelarCompra() {
    document.getElementById('formCompraPanel').style.display = 'none';
    document.getElementById('btnNuevaCompraWrap').style.display = 'block';
    document.getElementById('facturaItemsPanel').style.display = 'none';
    document.getElementById('facturaPreview').style.display = 'none';
    itemsCompra = [];
    facturaFile = null;
    facturaItems = [];
}

async function guardarCompra() {
    if (!itemsCompra.length) { alert('Agrega al menos un producto a la compra.'); return; }

    const btn = document.querySelector('#formCompraPanel .btn-green');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Guardando...';

    try {
        // 1. Crear en catálogo los ítems marcados como nuevos
        const nuevos = itemsCompra.filter(it => it.crear_en_catalogo && !it.catalogo_id);
        for (const item of nuevos) {
            const precioVenta = parseFloat(item.precio_venta) || 0;
            const rc = await fetch('/api/catalogo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: 'producto',
                    nombre: item.nombre_item,
                    precio_usd: precioVenta,
                    stock: parseInt(item.cantidad) || 0
                })
            });
            const dc = await rc.json();
            if (dc.id) { item.catalogo_id = dc.id; item.crear_en_catalogo = false; }
        }

        // 2. Guardar la compra
        const fd = new FormData();
        fd.append('proveedor_id', document.getElementById('cProveedorId').value || '');
        fd.append('fecha_compra', document.getElementById('cFecha').value || '');
        fd.append('factura_proveedor', document.getElementById('cFactura').value.trim());
        fd.append('notas', document.getElementById('cNotas').value.trim());
        fd.append('items', JSON.stringify(itemsCompra));
        if (facturaFile) fd.append('factura', facturaFile);

        const r = await fetch('/api/compras', { method: 'POST', body: fd });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Error al guardar');
        await cargarCatalogo();
        cancelarCompra();
        cargarHistorial();
        alert(`✅ Compra ${d.codigo} registrada. ${nuevos.length ? nuevos.length + ' producto(s) nuevos agregados al catálogo.' : ''}`);
    } catch (e) {
        alert('Error: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Guardar Compra';
    }
}

// ── Historial ─────────────────────────────────────────────────────────────────
async function cargarHistorial() {
    try {
        const r = await fetch('/api/compras');
        const d = await r.json();
        renderHistorial(d.data || []);
    } catch (e) {
        document.getElementById('listaCompras').innerHTML = '<p style="color:#ef4444;text-align:center;">Error cargando historial.</p>';
    }
}

function renderHistorial(compras) {
    historialData = compras;
    const wrap = document.getElementById('listaCompras');
    if (!compras.length) {
        wrap.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">No hay compras registradas todavía.</p>';
        return;
    }
    wrap.innerHTML = compras.map(c => {
        const fecha = c.fecha_compra ? new Date(c.fecha_compra).toLocaleDateString('es-VE') : '—';
        const proveedor = c.proveedor_nombre || 'Sin proveedor';
        const total = parseFloat(c.total_usd || 0).toFixed(2);
        const sinCatalogo = (c.items || []).filter(it => !it.catalogo_id);
        const itemsHTML = (c.items || []).map(it => {
            const catBtn = it.catalogo_id
                ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:700;"><i class="ph ph-check-circle"></i> En catálogo</span>`
                : `<button class="btn btn-sm" id="btn-cat-${it.id}" onclick="abrirModalItemCatalogo(${it.id},${JSON.stringify(it.nombre_item)},${it.cantidad},${parseFloat(it.costo_usd||0)})" style="background:#16a34a;color:#fff;font-size:0.75rem;padding:4px 9px;"><i class="ph ph-package"></i> Al catálogo</button>`;
            return `<tr>
                <td>${it.nombre_item}</td>
                <td style="text-align:center;">${it.cantidad}</td>
                <td style="text-align:right;">$${parseFloat(it.costo_usd||0).toFixed(2)}</td>
                <td style="text-align:right;font-weight:600;">$${parseFloat(it.subtotal_usd||0).toFixed(2)}</td>
                <td style="text-align:center;width:130px;">${catBtn}</td>
            </tr>`;
        }).join('');

        let facturaHTML = '';
        if (c.factura_imagen) {
            const ext = c.factura_imagen.toLowerCase();
            if (ext.endsWith('.pdf')) {
                facturaHTML = `
                    <div style="margin-top:12px;">
                        <div class="panel-title" style="font-size:0.82rem;"><i class="ph ph-file-pdf"></i> Factura (PDF)</div>
                        <div class="preview-box"><iframe src="${c.factura_imagen}"></iframe></div>
                    </div>`;
            } else {
                facturaHTML = `
                    <div style="margin-top:12px;">
                        <div class="panel-title" style="font-size:0.82rem;"><i class="ph ph-image"></i> Factura</div>
                        <div class="preview-box"><img src="${c.factura_imagen}" alt="Factura" onclick="abrirVisorImagen('${c.factura_imagen}')"></div>
                    </div>`;
            }
        }

        return `
        <div class="compra-card">
            <div class="compra-card-header" onclick="toggleCompra('cc-${c.id}')">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span class="badge-codigo">${c.codigo || '—'}</span>
                    <strong>${proveedor}</strong>
                    <span style="color:#64748b;font-size:0.85rem;">${fecha}</span>
                    ${c.factura_proveedor ? `<span style="color:#94a3b8;font-size:0.82rem;">Fac: ${c.factura_proveedor}</span>` : ''}
                </div>
                <div style="font-size:1.05rem;font-weight:800;color:#16a34a;">$${total}</div>
            </div>
            <div class="compra-card-body" id="cc-${c.id}">
                ${c.notas ? `<p style="color:#64748b;margin-bottom:12px;font-size:0.88rem;"><i class="ph ph-note"></i> ${c.notas}</p>` : ''}
                ${sinCatalogo.length ? `<div style="margin-bottom:10px;"><button class="btn btn-green btn-sm" onclick="agregarTodosAlCatalogo(${c.id})"><i class="ph ph-package"></i> Agregar todos al catálogo (${sinCatalogo.length})</button></div>` : ''}
                <table class="items-table">
                    <thead><tr>
                        <th>Producto</th><th style="text-align:center;width:60px;">Cant.</th>
                        <th style="text-align:right;width:100px;">Costo USD</th>
                        <th style="text-align:right;width:100px;">Subtotal</th>
                        <th style="text-align:center;width:130px;">Catálogo</th>
                    </tr></thead>
                    <tbody>${itemsHTML}</tbody>
                    <tfoot><tr>
                        <td colspan="4" style="text-align:right;font-weight:700;padding:8px 12px;">Total:</td>
                        <td style="text-align:right;font-weight:800;color:#16a34a;padding:8px 12px;">$${total}</td>
                    </tr></tfoot>
                </table>
                ${facturaHTML}
                ${!c.factura_imagen ? `<div style="margin-top:12px;"><label class="btn btn-secondary btn-sm" for="uploadEdit-${c.id}"><i class="ph ph-upload-simple"></i> Subir factura</label><input type="file" id="uploadEdit-${c.id}" accept="image/*,.pdf" style="display:none;" onchange="subirFacturaExistente(${c.id}, this)"></div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function toggleCompra(id) {
    const el = document.getElementById(id);
    el.classList.toggle('open');
}

async function subirFacturaExistente(compraId, input) {
    const file = input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('factura', file);
    try {
        const r = await fetch(`/api/compras/${compraId}/factura`, { method: 'POST', body: fd });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        cargarHistorial();
    } catch (e) {
        alert('Error subiendo factura: ' + e.message);
    }
}

// ── Agregar ítems del historial al catálogo ───────────────────────────────────
function abrirModalItemCatalogo(itemId, nombre, cantidad, costoUsd) {
    document.getElementById('itemCatItemId').value = itemId;
    document.getElementById('itemCatNombre').value = nombre;
    document.getElementById('itemCatTipo').value = 'producto';
    document.getElementById('itemCatPrecio').value = '';
    document.getElementById('itemCatStock').value = cantidad;
    document.getElementById('modalItemCatalogo').classList.add('open');
    setTimeout(() => document.getElementById('itemCatPrecio').focus(), 100);
}

function cerrarModalItemCatalogo() {
    document.getElementById('modalItemCatalogo').classList.remove('open');
}

async function guardarItemEnCatalogo() {
    const itemId = document.getElementById('itemCatItemId').value;
    const nombre = document.getElementById('itemCatNombre').value.trim();
    const tipo = document.getElementById('itemCatTipo').value;
    const precio_usd = parseFloat(document.getElementById('itemCatPrecio').value);
    const stock = parseInt(document.getElementById('itemCatStock').value) || 0;
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    if (isNaN(precio_usd) || precio_usd < 0) { alert('Ingresa un precio de venta válido'); return; }
    try {
        const r = await fetch(`/api/compras/items/${itemId}/al-catalogo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, tipo, precio_usd, stock })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Error');
        cerrarModalItemCatalogo();
        await cargarCatalogo();
        await cargarHistorial();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function agregarTodosAlCatalogo(compraId) {
    const compra = historialData.find(c => c.id === compraId);
    if (!compra) return;
    const sinCatalogo = (compra.items || []).filter(it => !it.catalogo_id);
    if (!sinCatalogo.length) { alert('Todos los ítems ya están en el catálogo.'); return; }
    if (!confirm(`Se agregarán ${sinCatalogo.length} producto(s) al catálogo.\nEl precio de venta inicial será igual al costo de la factura.\nPodrás editarlo después en el módulo Catálogo.\n\n¿Continuar?`)) return;
    let ok = 0, err = 0;
    for (const it of sinCatalogo) {
        try {
            const r = await fetch(`/api/compras/items/${it.id}/al-catalogo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: it.nombre_item, tipo: 'producto', precio_usd: parseFloat(it.costo_usd)||0, stock: parseInt(it.cantidad)||0 })
            });
            const d = await r.json();
            if (d.success) ok++; else err++;
        } catch { err++; }
    }
    alert(`${ok} producto(s) agregados al catálogo.${err ? `\n${err} con error.` : ''}\n\nRecuerda editar los precios de venta en el Catálogo.`);
    await cargarCatalogo();
    await cargarHistorial();
}
