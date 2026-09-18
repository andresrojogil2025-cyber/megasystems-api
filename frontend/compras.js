// ── Estado global ────────────────────────────────────────────────────────────
let proveedores = [];
let catalogoCache = [];
let itemsCompra = [];    // [{catalogo_id, nombre_item, cantidad, costo_usd}]
let facturaFile = null;
let searchTimeout = null;

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

function abrirModalProveedor(id) {
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
        cerrarModalProveedor();
        await cargarProveedores();
        renderTablaProveedores();
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

function renderItems() {
    const tbody = document.getElementById('itemsBody');
    if (!itemsCompra.length) {
        tbody.innerHTML = '<tr id="emptyItemsRow"><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">Agrega productos usando el buscador de arriba.</td></tr>';
        actualizarTotal();
        return;
    }
    tbody.innerHTML = itemsCompra.map((item, i) => `
        <tr>
            <td>${item.nombre_item}</td>
            <td><input type="number" min="1" value="${item.cantidad}" onchange="updateItemCant(${i}, this.value)"></td>
            <td><input type="number" class="wide" step="0.01" min="0" value="${parseFloat(item.costo_usd).toFixed(2)}" onchange="updateItemCosto(${i}, this.value)"></td>
            <td style="font-weight:600; color:#16a34a;">$${(item.cantidad * item.costo_usd).toFixed(2)}</td>
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
function previewFactura(input) {
    const file = input.files[0];
    if (!file) return;
    facturaFile = file;

    const box = document.getElementById('facturaPreview');
    box.style.display = 'block';

    if (file.type === 'application/pdf') {
        const url = URL.createObjectURL(file);
        box.innerHTML = `<iframe src="${url}"></iframe>`;
    } else {
        const reader = new FileReader();
        reader.onload = e => {
            box.innerHTML = `<img src="${e.target.result}" alt="Factura" onclick="abrirVisorImagen('${e.target.result}')">`;
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('uploadZone').innerHTML = `
        <i class="ph ph-check-circle" style="color:#16a34a;font-size:2rem;"></i>
        <p style="color:#16a34a;font-weight:600;">${file.name}</p>
        <p style="font-size:0.8rem;color:#64748b;">Haz clic para cambiar el archivo</p>
        <input type="file" id="facturaFile" accept="image/*,.pdf" style="display:none;" onchange="previewFactura(this)">
    `;
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
    itemsCompra = [];
    facturaFile = null;
}

async function guardarCompra() {
    if (!itemsCompra.length) { alert('Agrega al menos un producto a la compra.'); return; }

    const fd = new FormData();
    fd.append('proveedor_id', document.getElementById('cProveedorId').value || '');
    fd.append('fecha_compra', document.getElementById('cFecha').value || '');
    fd.append('factura_proveedor', document.getElementById('cFactura').value.trim());
    fd.append('notas', document.getElementById('cNotas').value.trim());
    fd.append('items', JSON.stringify(itemsCompra));
    if (facturaFile) fd.append('factura', facturaFile);

    const btn = document.querySelector('#formCompraPanel .btn-green');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Guardando...';

    try {
        const r = await fetch('/api/compras', { method: 'POST', body: fd });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Error al guardar');
        cancelarCompra();
        cargarHistorial();
        alert(`✅ Compra ${d.codigo} registrada correctamente.`);
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
    const wrap = document.getElementById('listaCompras');
    if (!compras.length) {
        wrap.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">No hay compras registradas todavía.</p>';
        return;
    }
    wrap.innerHTML = compras.map(c => {
        const fecha = c.fecha_compra ? new Date(c.fecha_compra).toLocaleDateString('es-VE') : '—';
        const proveedor = c.proveedor_nombre || 'Sin proveedor';
        const total = parseFloat(c.total_usd || 0).toFixed(2);
        const itemsHTML = (c.items || []).map(it => `
            <tr>
                <td>${it.nombre_item}</td>
                <td style="text-align:center;">${it.cantidad}</td>
                <td style="text-align:right;">$${parseFloat(it.costo_usd||0).toFixed(2)}</td>
                <td style="text-align:right;font-weight:600;">$${parseFloat(it.subtotal_usd||0).toFixed(2)}</td>
            </tr>
        `).join('');

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
                <table class="items-table">
                    <thead><tr>
                        <th>Producto</th><th style="text-align:center;width:60px;">Cant.</th>
                        <th style="text-align:right;width:100px;">Costo USD</th>
                        <th style="text-align:right;width:100px;">Subtotal</th>
                    </tr></thead>
                    <tbody>${itemsHTML}</tbody>
                    <tfoot><tr>
                        <td colspan="3" style="text-align:right;font-weight:700;padding:8px 12px;">Total:</td>
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
