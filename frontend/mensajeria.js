// URL base de la API
const API_URL = 'http://localhost:3050/api/whatsapp';

let pollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    checkStatus();
});

async function checkStatus() {
    try {
        const respuesta = await fetch(`${API_URL}/status`);
        const data = await respuesta.json();
        
        const badge = document.getElementById('statusBadge');
        const qrContainer = document.getElementById('qrContainer');
        const connContainer = document.getElementById('connectedContainer');
        const qrBox = document.getElementById('qrBox');

        if (!data.success) {
            badge.className = 'status-badge status-disconnected';
            badge.innerText = '⚠️ Error en servidor Node';
            return;
        }

        if (data.status === 'CONNECTED') {
            badge.className = 'status-badge status-connected';
            badge.innerText = '🟢 Sesión Autenticada';
            qrContainer.style.display = 'none';
            connContainer.style.display = 'block';
            
            // Si estaba pollendo, lo detenemos
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }

        } else if (data.status === 'QR_READY') {
            badge.className = 'status-badge status-disconnected';
            badge.innerText = '🔴 Requiere Escaneo de QR';
            qrContainer.style.display = 'block';
            connContainer.style.display = 'none';
            
            // Renderizamos la imagen en base64
            qrBox.innerHTML = `<img src="${data.qrBase64}" alt="Escanea el código QR">`;

            // Volvemos a chequear cada 3 segundos si el usuario ya lo escaneó
            if (!pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
            }

        } else if (data.status === 'CONNECTING') {
            badge.className = 'status-badge status-loading';
            badge.innerText = '⏳ Arrancando Chromium de fondo...';
            
            if (!pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
            }
        }

    } catch (error) {
        console.error('Error conectando con la API de WhatsApp:', error);
    }
}

async function iniciarEnvioMasivo() {
    if (!confirm("¿Deseas enviar los recordatorios de manera automática? Esto podría demorar un par de minutos.")) return;
    
    const btn = document.getElementById('btnEnviar');
    const cons = document.getElementById('consoleLog');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Ordenando Envíos...';
    cons.style.display = 'block';
    cons.innerHTML = '<i>Conectando al servidor Master...</i><br>';

    const textoPersonalizado = document.getElementById('textoMensaje').value;

    try {
        const respuesta = await fetch(`${API_URL}/send-reminders`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje: textoPersonalizado })
        });
        const json = await respuesta.json();

        if (json.success) {
            cons.innerHTML += `<b>SERVIDOR:</b> ${json.message}<br>`;
            cons.innerHTML += `<span>El proceso se está ejecutando invisiblemente en el servidor (`+API_URL+`). Puedes minimizar la pestaña.</span><br>`;
        } else {
            cons.innerHTML += `<b style="color:red;">ERROR:</b> ${json.error}<br>`;
        }

    } catch (e) {
        cons.innerHTML += `<b style="color:red;">Error de red:</b> No se pudo contactar al servidor.<br>`;
    } finally {
        // Restaurar boton despues de 3 segundos para que no vuelva cliquear rapido
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Lanzar Recordatorios Masivos';
        }, 5000);
    }
}
