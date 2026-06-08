const socket = io();

const map = L.map("map", { zoomControl: false }).setView([19.4326, -99.1332], 13);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; CARTO",
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const ui = {
    toastRegion: document.getElementById("toast-region"),
    menuToggle: document.getElementById("menu-toggle"),
    sidebar: document.getElementById("sidebar"),
    appStatus: document.getElementById("app-status"),
    alertBox: document.getElementById("alert-box"),
    alertTitle: document.getElementById("alert-title"),
    alertMessage: document.getElementById("alert-message"),
    searchInput: document.getElementById("map-search"),
    searchButton: document.getElementById("search-action-btn"),
    mapNameInput: document.getElementById("map-name-input"),
    saveMapButton: document.getElementById("btn-save-map"),
    drawButton: document.getElementById("btn-main-draw"),
    drawDropdownButton: document.getElementById("btn-draw-dropdown"),
    drawDropdownMenu: document.getElementById("draw-dropdown-menu"),
    drawCoordsButton: document.getElementById("btn-draw-coords"),
    geoPanel: document.getElementById("geo-panel"),
    geoPanelHeader: document.getElementById("geo-panel-header"),
    geoPanelContent: document.getElementById("geo-panel-content"),
    geoPanelArrow: document.getElementById("geo-panel-arrow"),
    geoPanelName: document.getElementById("geo-panel-name"),
    geoPointSummary: document.getElementById("geo-point-summary"),
    geoCoordList: document.getElementById("geo-coord-list"),
    geoCancelButton: document.getElementById("btn-geo-cancel"),
    geoConfirmButton: document.getElementById("btn-geo-confirm"),
    geoSaveButton: document.getElementById("btn-geo-save"),
    coordModal: document.getElementById("coordModal"),
    coordCancelButton: document.getElementById("coord-cancel"),
    coordSubmitButton: document.getElementById("coord-submit"),
    coordInputs: ["p1", "p2", "p3", "p4"].map((id) => document.getElementById(id)),
    navDrawButton: document.getElementById("nav-draw-zone"),
    navCoordsButton: document.getElementById("nav-open-coords"),
    navSimulateButton: document.getElementById("nav-simulate-route"),
    navStopButton: document.getElementById("nav-stop-sim"),
    navProfileButton: document.getElementById("nav-profile"),
    navLogoutButton: document.getElementById("nav-logout"),
    //LILYGO
    navAddDeviceButton: document.getElementById("nav-add-device"),
    deviceModal: document.getElementById("deviceModal"),
    deviceCancelButton: document.getElementById("device-cancel"),
    deviceSubmitButton: document.getElementById("device-submit"),
    deviceIdInput: document.getElementById("device-id-input"),
    deviceAliasInput: document.getElementById("device-alias-input"),
    //evitar q aparezcan varios dispositivos al mismo tiempo
    deviceDropdownBtn: document.getElementById("btn-device-dropdown"),
    deviceDropdownMenu: document.getElementById("device-dropdown-menu"),
    deviceListContainer: document.getElementById("device-list-container"),
    openLinkModalBtn: document.getElementById("btn-open-link-modal"),
    editDeviceModal: document.getElementById("editDeviceModal"),
    editDeviceCancel: document.getElementById("edit-device-cancel"),
    editDeviceSubmit: document.getElementById("edit-device-submit"),
    editDeviceIdInput: document.getElementById("edit-device-id"),
    editDeviceAliasInput: document.getElementById("edit-device-alias"),
    editDeviceColorInput: document.getElementById("edit-device-color"),
};

const state = {
    currentMode: "IDLE",
    drawnPoints: [],
    tempMarkers: [],
    tempPolygon: null,
    hoverPolyline: null,
    previewShape: null,
    customPolygonsLayer: L.layerGroup().addTo(map),
    markers: {},
    searchMarker: null,
    currentMapId: null,
    routePoints: [],
    isSimulating: false,
    simPolyline: null,
    activeDevices: new Set(),
    deviceColors: {}, 
    colorPalette: ['#43be83', '#4dabf7', '#ff6b6b', '#fcc419', '#ae3ec9', '#fd7e14']
};

const iconMarkup = {
    trash: `
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16"></path>
            <path d="M9 7V4h6v3"></path>
            <path d="M7 7l1 12h8l1-12"></path>
        </svg>
    `,
};

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Agregamos el parámetro persistent (por defecto falso para no romper otras funciones)
function showToast(message, tone = "info", title, persistent = false) {
    if (!ui.toastRegion) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="toast-copy">
            <span class="toast-title">${escapeHtml(title || tone)}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        </div>
    `;

    ui.toastRegion.appendChild(toast);
    
    // Si NO es persistente, se borra solo a los 4.2 segundos
    if (!persistent) {
        window.setTimeout(() => toast.remove(), 4200);
    }
}

function clearAllToasts() {
    if (ui.toastRegion) {
        ui.toastRegion.innerHTML = "";
    }
}

async function apiRequest(url, options = {}) {
    const requestOptions = {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    };

    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : { message: "La respuesta del servidor no es válida." };

    if (!response.ok) {
        throw new Error(data.message || "No se pudo completar la solicitud.");
    }

    return data;
}

function setButtonBusy(button, isBusy, busyLabel = "Procesando") {
    if (!button) return;

    const label = button.querySelector("span");
    if (!button.dataset.defaultLabel && label) {
        button.dataset.defaultLabel = label.textContent.trim();
    }

    button.disabled = isBusy;
    if (label) {
        label.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
    }
}

function setSidebarStatus(message) {
    ui.appStatus.textContent = message;
}

function setAlertState(status, message) {
    const normalized = status === "DANGER" ? "danger" : status === "WARNING" ? "warning" : "safe";
    const titles = {
        safe: "Sistema seguro",
        warning: "Zona de precaución",
        danger: "Alerta activa",
    };

    ui.alertBox.dataset.status = normalized;
    ui.alertTitle.textContent = titles[normalized];
    ui.alertMessage.textContent = message;
}

function setActiveSidebarButton(activeButton) {
    [
        ui.navDrawButton,
        ui.navCoordsButton,
        ui.navSimulateButton,
        ui.navStopButton,
    ].forEach((button) => {
        if (button) button.classList.toggle("active", button === activeButton);
    });
}

function closeMenu() {
    ui.sidebar.classList.remove("active");
}

function toggleMenu() {
    ui.sidebar.classList.toggle("active");
}

function openCoordModal() {
    closeMenu();
    ui.coordModal.style.display = "flex";
}

function closeCoordModal() {
    ui.coordModal.style.display = "none";
}

function createBadgeMarker(label, extraClass = "") {
    return L.divIcon({
        className: `map-badge-marker ${extraClass}`.trim(),
        html: `<span>${escapeHtml(label)}</span>`,
    });
}

function resetPreviewShape() {
    if (state.previewShape) {
        map.removeLayer(state.previewShape);
        state.previewShape = null;
    }
}

function clearHoverLine() {
    if (state.hoverPolyline) {
        map.removeLayer(state.hoverPolyline);
        state.hoverPolyline = null;
    }
}

function syncGeoSaveState() {
    const hasShape = state.drawnPoints.length >= 3;
    const hasName = ui.geoPanelName.value.trim().length > 0;
    ui.geoSaveButton.disabled = !(hasShape && hasName);
    ui.geoConfirmButton.disabled = !hasShape;
}

function updatePointSummary() {
    const pointCount = state.drawnPoints.length;
    if (pointCount === 0) {
        ui.geoPointSummary.textContent = "Aún no hay puntos trazados.";
    } else if (pointCount < 3) {
        ui.geoPointSummary.textContent = `Hay ${pointCount} punto(s). Faltan ${3 - pointCount} para cerrar una forma válida.`;
    } else {
        ui.geoPointSummary.textContent = `${pointCount} puntos listos. Ya puedes nombrar y guardar la geocerca.`;
    }
}

function resetTempDrawing() {
    state.drawnPoints = [];
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.tempPolygon) {
        map.removeLayer(state.tempPolygon);
        state.tempPolygon = null;
    }

    clearHoverLine();
    resetPreviewShape();
    ui.geoCoordList.innerHTML = "";
    updatePointSummary();
    syncGeoSaveState();
}

function renderDrawnGeometry() {
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.tempPolygon) {
        map.removeLayer(state.tempPolygon);
        state.tempPolygon = null;
    }

    ui.geoCoordList.innerHTML = "";

    state.drawnPoints.forEach((point, index) => {
        const marker = L.circleMarker([point.lat, point.lng], {
            color: "#6ca7ff",
            fillColor: "#6ca7ff",
            radius: 5,
            fillOpacity: 0.85,
            weight: 2,
        }).addTo(map);
        state.tempMarkers.push(marker);

        const item = document.createElement("li");
        item.innerHTML = `
            <div class="point-copy">
                <span class="point-label">P${index + 1}</span>
                <span class="point-value">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
            </div>
            <button class="btn-delete-point" type="button" title="Eliminar punto">
                ${iconMarkup.trash}
            </button>
        `;

        const deleteButton = item.querySelector(".btn-delete-point");
        deleteButton.addEventListener("click", () => {
            state.drawnPoints.splice(index, 1);
            clearHoverLine();
            renderDrawnGeometry();
        });

        deleteButton.addEventListener("mouseenter", () => {
            marker.setStyle({ color: "#ef6767", fillColor: "#ef6767", radius: 6 });
            if (state.drawnPoints.length > 1) {
                const prev = (index - 1 + state.drawnPoints.length) % state.drawnPoints.length;
                const next = (index + 1) % state.drawnPoints.length;
                const coords = state.drawnPoints.length === 2
                    ? [
                        [state.drawnPoints[0].lat, state.drawnPoints[0].lng],
                        [state.drawnPoints[1].lat, state.drawnPoints[1].lng],
                    ]
                    : [
                        [state.drawnPoints[prev].lat, state.drawnPoints[prev].lng],
                        [state.drawnPoints[index].lat, state.drawnPoints[index].lng],
                        [state.drawnPoints[next].lat, state.drawnPoints[next].lng],
                    ];

                state.hoverPolyline = L.polyline(coords, {
                    color: "#ef6767",
                    weight: 4,
                    opacity: 0.8,
                }).addTo(map);
            }
        });

        deleteButton.addEventListener("mouseleave", () => {
            marker.setStyle({ color: "#6ca7ff", fillColor: "#6ca7ff", radius: 5 });
            clearHoverLine();
        });

        ui.geoCoordList.prepend(item);
    });

    if (state.drawnPoints.length >= 3) {
        state.tempPolygon = L.polygon(
            state.drawnPoints.map((point) => [point.lat, point.lng]),
            {
                color: "#6ca7ff",
                fillColor: "#6ca7ff",
                fillOpacity: 0.18,
                weight: 2,
            },
        ).addTo(map);
    }

    updatePointSummary();
    syncGeoSaveState();
}

function renderSavedPolygon(points, name, options = {}) {
    const polygon = L.polygon(
        points.map((point) => [point.lat, point.lng]),
        {
            color: options.color || "#8eb7ff",
            fillColor: options.fillColor || "#6ca7ff",
            fillOpacity: options.fillOpacity || 0.18,
            weight: options.weight || 2,
        },
    ).addTo(state.customPolygonsLayer);

    if (name) {
        polygon.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
    }

    return polygon;
}

function startDrawing() {
    stopSimulation();
    resetTempDrawing();
    ui.geoPanelName.value = "";
    ui.geoPanel.style.display = "block";
    ui.geoPanelContent.classList.remove("collapsed");
    ui.geoPanelArrow.classList.remove("arrow-up");
    state.currentMode = "DRAWING";
    map.getContainer().style.cursor = "crosshair";
    closeMenu();
    setActiveSidebarButton(ui.navDrawButton);
    setSidebarStatus("Modo dibujo activo. Marca al menos tres puntos.");
    syncGeoSaveState();
}

function cancelDrawing() {
    resetTempDrawing();
    ui.geoPanelName.value = "";
    ui.geoPanel.style.display = "none";
    state.currentMode = "IDLE";
    map.getContainer().style.cursor = "grab";
    setActiveSidebarButton(null);
    setSidebarStatus("Edición cancelada.");
}

function validateCurrentShape() {
    if (state.drawnPoints.length < 3) {
        showToast("Necesitas al menos tres puntos para formar una geocerca.", "warning", "Forma incompleta");
        return;
    }

    ui.geoPanelName.focus();
    setSidebarStatus("Forma válida. Asigna un nombre y guarda.");
    showToast("La forma es válida. Ya puedes guardarla.", "success", "Geocerca lista");
}

/*function stopSimulation() {
    if (state.simInterval) {
        window.clearInterval(state.simInterval);
        state.simInterval = null;
    }

    if (state.simPolyline) {
        map.removeLayer(state.simPolyline);
        state.simPolyline = null;
    }

    if (state.simMarkerStart) {
        map.removeLayer(state.simMarkerStart);
        state.simMarkerStart = null;
    }

    state.simStart = null;
    state.simEnd = null;

    if (state.currentMode === "SIMULATING") {
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
    }
}

function startSimulationSetup() {
    cancelDrawing();
    stopSimulation();
    closeMenu();
    setActiveSidebarButton(ui.navSimulateButton);
    state.currentMode = "SIMULATING";
    map.getContainer().style.cursor = "crosshair";
    setSidebarStatus("Selecciona el punto inicial de la ruta.");
}*/

// --- NUEVO MOTOR DE RUTAS ---

function startSimulationSetup() {
    cancelDrawing(); // Por si estaba dibujando geocercas
    stopSimulation(); // Por si había una simulación corriendo
    closeMenu();
    
    state.routePoints = [];
    state.currentMode = "DRAWING_ROUTE";
    setActiveSidebarButton(ui.navSimulateButton);
    map.getContainer().style.cursor = "crosshair";
    
    // Disfrazamos el panel de geocercas para que parezca de rutas
    ui.geoPanelName.value = "";
    ui.geoPanelName.placeholder = "Nombre de la ruta...";
    ui.geoSaveButton.textContent = "Iniciar Simulación ▶️"; 
    
    ui.geoPanel.style.display = "block";
    ui.geoPanelContent.classList.remove("collapsed");
    ui.geoPanelArrow.classList.remove("arrow-up");
    
    setSidebarStatus("Modo ruta activo. Traza la trayectoria punto por punto.");
    renderDrawnRoute();
}

function stopSimulation() {
    state.isSimulating = false;
    
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.simPolyline) {
        map.removeLayer(state.simPolyline);
        state.simPolyline = null;
    }

    if (state.markers["Bot controlado"]) {
        map.removeLayer(state.markers["Bot controlado"]);
        delete state.markers["Bot controlado"];
    }

    state.routePoints = [];
    resetPreviewShape();
    clearHoverLine();
    
    // Restauramos el panel a su estado normal
    ui.geoPanel.style.display = "none";
    ui.geoSaveButton.textContent = "Guardar Geocerca"; 
    ui.geoPanelName.placeholder = "Nombre de la zona...";

    if (state.currentMode === "DRAWING_ROUTE" || state.currentMode === "SIMULATING") {
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
        setActiveSidebarButton(null);
        setSidebarStatus("Simulación detenida.");
    }
}

function renderDrawnRoute() {
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.simPolyline) {
        map.removeLayer(state.simPolyline);
        state.simPolyline = null;
    }

    ui.geoCoordList.innerHTML = "";

    // Dibuja los puntos de la ruta
    state.routePoints.forEach((point, index) => {
        const marker = L.circleMarker([point.lat, point.lng], {
            color: "#ffaa00", // Naranja para diferenciar de las geocercas
            fillColor: "#ffaa00",
            radius: 5,
            fillOpacity: 0.85,
            weight: 2,
        }).addTo(map);
        state.tempMarkers.push(marker);

        // Agrega el punto a la lista del panel lateral
        const item = document.createElement("li");
        item.innerHTML = `
            <div class="point-copy">
                <span class="point-label">P${index + 1}</span>
                <span class="point-value">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
            </div>
            <button class="btn-delete-point" type="button" title="Eliminar punto">
                ${iconMarkup.trash}
            </button>
        `;

        const deleteButton = item.querySelector(".btn-delete-point");
        deleteButton.addEventListener("click", () => {
            state.routePoints.splice(index, 1);
            resetPreviewShape();
            renderDrawnRoute();
        });

        ui.geoCoordList.prepend(item);
    });

    // Conecta los puntos con una línea naranja
    if (state.routePoints.length >= 2) {
        state.simPolyline = L.polyline(
            state.routePoints.map((point) => [point.lat, point.lng]),
            { color: "#ffaa00", weight: 3, dashArray: "8 10" }
        ).addTo(map);
    }

    // Actualiza el texto del panel
    const pointCount = state.routePoints.length;
    if (pointCount === 0) ui.geoPointSummary.textContent = "Aún no hay puntos trazados.";
    else if (pointCount === 1) ui.geoPointSummary.textContent = "Marca el siguiente punto del camino.";
    else ui.geoPointSummary.textContent = `Ruta de ${pointCount} puntos lista. Nómbrala e inicia.`;

    // Bloquea el botón si no hay nombre o suficientes puntos
    const hasShape = state.routePoints.length >= 2;
    const hasName = ui.geoPanelName.value.trim().length > 0;
    ui.geoSaveButton.disabled = !(hasShape && hasName);
    ui.geoConfirmButton.disabled = !hasShape;
}

async function runRouteSimulation() {
    const routeName = ui.geoPanelName.value.trim();
    if (state.routePoints.length < 2 || !routeName) return;

    ui.geoPanel.style.display = "none";
    state.currentMode = "SIMULATING";
    state.isSimulating = true;
    
    setSidebarStatus(`Simulando ruta: ${routeName}`);

    await apiRequest("/api/reset_bot_state", { method: "POST" });
    clearAllToasts();

    // Eliminamos los marcadores temporales (los circulitos naranjas) para limpiar el mapa
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    // Recorremos los segmentos de la ruta uno por uno
    for (let i = 0; i < state.routePoints.length - 1; i++) {
        if (!state.isSimulating) break;

        const startP = state.routePoints[i];
        const endP = state.routePoints[i + 1];

        const steps = 30; // Suavidad del movimiento
        const stepTime = 150; // Velocidad: 150ms por paso
        
        const latStep = (endP.lat - startP.lat) / steps;
        const lngStep = (endP.lng - startP.lng) / steps;

        for (let s = 1; s <= steps; s++) {
            if (!state.isSimulating) break;

            const newLat = startP.lat + latStep * s;
            const newLng = startP.lng + lngStep * s;

            await sendFakeLocation(newLat, newLng);
            await new Promise(resolve => setTimeout(resolve, stepTime));
        }
    }

    if (state.isSimulating) {
        stopSimulation();
        showToast(`La ruta "${routeName}" llegó a su destino.`, "success", "Viaje completado");
        clearAllToasts();
    }
}

async function sendFakeLocation(lat, lng) {
    try {
        await apiRequest("/api/update_location", {
            method: "POST",
            body: JSON.stringify({
                lat,
                lng,
                device_id: "simulador_bot",
                alias: "Bot controlado",
                map_id: state.currentMapId
            }),
        });
    } catch (error) {
        showToast(error.message, "error", "Ruta detenida");
        stopSimulation();
    }
}

/*function runSimulation() {
    if (!state.simStart || !state.simEnd) return;

    const steps = 200;
    const duration = 40000;
    const stepTime = duration / steps;
    let currentStep = 0;

    const latStep = (state.simEnd.lat - state.simStart.lat) / steps;
    const lngStep = (state.simEnd.lng - state.simStart.lng) / steps;

    setSidebarStatus("Simulación en curso. Se está enviando ubicación en tiempo real.");

    state.simInterval = window.setInterval(() => {
        currentStep += 1;

        const newLat = state.simStart.lat + latStep * currentStep;
        const newLng = state.simStart.lng + lngStep * currentStep;
        sendFakeLocation(newLat, newLng);

        if (currentStep >= steps) {
            window.clearInterval(state.simInterval);
            state.simInterval = null;
            setSidebarStatus("Simulación completada.");
            setActiveSidebarButton(null);
        }
    }, stepTime);
}*/

function parseCoordinateInput(input) {
    const parts = input.split(",").map((value) => Number.parseFloat(value.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
        throw new Error("Usa el formato latitud, longitud. Ejemplo: 19.33, -99.11");
    }

    return { lat: parts[0], lng: parts[1] };
}

function processCoordinates() {
    try {
        const points = ui.coordInputs.map((input) => parseCoordinateInput(input.value));
        state.drawnPoints = points;
        ui.geoPanel.style.display = "block";
        closeCoordModal();
        renderDrawnGeometry();
        state.currentMode = "DRAWING";
        map.getContainer().style.cursor = "crosshair";
        setActiveSidebarButton(ui.navCoordsButton);
        setSidebarStatus("Área base creada. Revisa los puntos y asigna un nombre.");

        if (state.tempPolygon) {
            map.fitBounds(state.tempPolygon.getBounds(), { padding: [32, 32] });
        }
    } catch (error) {
        showToast(error.message, "warning", "Coordenadas inválidas");
    }
}

function handleMapClick(event) {
    if (state.currentMode === "DRAWING") {
        state.drawnPoints.push({ lat: event.latlng.lat, lng: event.latlng.lng });
        resetPreviewShape();
        renderDrawnGeometry();
        return;
    }

    // NUEVO: Agrega puntos a la ruta
    if (state.currentMode === "DRAWING_ROUTE") {
        state.routePoints.push({ lat: event.latlng.lat, lng: event.latlng.lng });
        resetPreviewShape();
        renderDrawnRoute();
        return;
    }
}

function handleMapMouseMove(event) {
    const cursorPoint = [event.latlng.lat, event.latlng.lng];
    resetPreviewShape();

    // Dibuja previsualización verde para geocercas
    if (state.currentMode === "DRAWING" && state.drawnPoints.length > 0) {
        const firstPoint = [state.drawnPoints[0].lat, state.drawnPoints[0].lng];
        const lastPoint = [
            state.drawnPoints[state.drawnPoints.length - 1].lat,
            state.drawnPoints[state.drawnPoints.length - 1].lng,
        ];

        if (state.drawnPoints.length === 1) {
            state.previewShape = L.polyline([firstPoint, cursorPoint], { color: "#43be83", weight: 2, dashArray: "4 10" }).addTo(map);
        } else {
            state.previewShape = L.polygon([firstPoint, cursorPoint, lastPoint], { color: "#43be83", fillColor: "#43be83", fillOpacity: 0.1, weight: 2, dashArray: "4 10", interactive: false }).addTo(map);
        }
    }

    // NUEVO: Dibuja previsualización naranja para rutas
    if (state.currentMode === "DRAWING_ROUTE" && state.routePoints.length > 0) {
        const lastPoint = [
            state.routePoints[state.routePoints.length - 1].lat,
            state.routePoints[state.routePoints.length - 1].lng,
        ];
        state.previewShape = L.polyline([lastPoint, cursorPoint], { color: "#ffaa00", weight: 2, dashArray: "4 10" }).addTo(map);
    }
}

socket.on("new_location", (data) => {
    const lat = Number.parseFloat(data.lat);
    const lng = Number.parseFloat(data.lng);
    const deviceId = data.device_id || "dispositivo";
    const alias = data.alias || deviceId;
    const markerKey = deviceId;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return;
    }

    if (deviceId !== "simulador_bot" && !state.activeDevices.has(deviceId)) {
        return;
    }

    const dotColor = state.deviceColors[deviceId] || "#ffaa00";

    const customIcon = L.divIcon({
        className: 'clear-custom-marker', // Usamos una clase limpia
        html: `
            <div style="position: relative; display: flex; justify-content: center; align-items: center; width: 16px; height: 16px;">
                <div style="position: absolute; bottom: 20px; background: rgba(17, 20, 24, 0.85); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.15); pointer-events: none; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
                    ${escapeHtml(alias)}
                </div>
                <div style="width: 14px; height: 14px; background: ${dotColor}; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5);"></div>
            </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8], 
    });

    if (state.markers[markerKey]) {
        // Actualizamos la posición y el ícono
        state.markers[markerKey].setLatLng([lat, lng]).setIcon(customIcon);
        return;
    }

    if (deviceId === "simulador_bot") {
        state.markers[markerKey] = L.marker([lat, lng], {
            icon: createBadgeMarker("BOT", "device-bot"),
        }).addTo(map).bindPopup("Bot controlado");
        return;
    }

    state.markers[markerKey] = L.marker([lat, lng], { icon: customIcon }).addTo(map);
});

socket.on("geofence_event", (data) => {
    if (data.silent) {
        setAlertState(data.status, data.message);
        return; 
    }

    setAlertState(data.status, data.message);
    
    if (data.status === "DANGER") {
        showToast(data.message, "error", "Alerta de Entrada", true);
    } else if (data.status === "WARNING") {
        showToast(data.message, "warning", "Aviso", true);
    } else if (data.status === "INFO") {
        showToast(data.message, "success", "Aviso de Salida", true); 
    }
});

async function saveZone() {
    const name = ui.geoPanelName.value.trim();
    if (state.drawnPoints.length < 3) {
        showToast("Necesitas al menos tres puntos para guardar la geocerca.", "warning", "Faltan puntos");
        return;
    }

    if (!name) {
        showToast("Asigna un nombre a la geocerca antes de guardarla.", "warning", "Nombre requerido");
        ui.geoPanelName.focus();
        return;
    }

    setButtonBusy(ui.geoSaveButton, true, "Guardando");

    try {
        await apiRequest("/api/add_zone", {
            method: "POST",
            body: JSON.stringify({
                name,
                points: state.drawnPoints,
                map_id: state.currentMapId,
            }),
        });

        renderSavedPolygon(state.drawnPoints, name, {
            color: "#8eb7ff",
            fillColor: "#6ca7ff",
            fillOpacity: 0.15,
        });

        showToast(`La geocerca "${name}" se guardó correctamente.`, "success", "Guardado");
        setSidebarStatus(`Geocerca "${name}" guardada.`);
        ui.geoPanelName.value = "";
        ui.geoPanel.style.display = "none";
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
        resetTempDrawing();
        setActiveSidebarButton(null);
    } catch (error) {
        showToast(error.message, "error", "Error al guardar");
    } finally {
        setButtonBusy(ui.geoSaveButton, false);
    }
}

async function saveMap() {
    const mapName = ui.mapNameInput.value.trim();
    if (!mapName) {
        showToast("El mapa debe tener un nombre.", "warning", "Nombre requerido");
        return;
    }

    setButtonBusy(ui.saveMapButton, true, "Guardando");

    try {
        const data = await apiRequest("/api/save_map", {
            method: "POST",
            body: JSON.stringify({
                map_id: state.currentMapId,
                name: mapName,
            }),
        });

        if (!state.currentMapId) {
            state.currentMapId = data.new_map_id;
        }

        setSidebarStatus(`Mapa "${mapName}" guardado.`);
        showToast(`El mapa "${mapName}" quedó guardado.`, "success", "Mapa actualizado");
    } catch (error) {
        showToast(error.message, "error", "Error del mapa");
    } finally {
        setButtonBusy(ui.saveMapButton, false);
    }
}

async function loadMapContext() {
    const params = new URLSearchParams(window.location.search);
    const mapId = params.get("map_id");

    if (mapId) {
        try {
            const data = await apiRequest(`/api/get_map_zones/${mapId}`, { method: "GET" });
            state.currentMapId = mapId;
            ui.mapNameInput.value = data.nombre_mapa;

            data.zonas.forEach((zone) => {
                renderSavedPolygon(zone.puntos, zone.nombre, {
                    color: "#8eb7ff",
                    fillColor: "#6ca7ff",
                    fillOpacity: 0.14,
                });
            });

            if (state.customPolygonsLayer.getLayers().length > 0) {
                map.fitBounds(state.customPolygonsLayer.getBounds(), { padding: [32, 32] });
            }

            setSidebarStatus(`Mapa "${data.nombre_mapa}" cargado.`);
            return;
        } catch (error) {
            showToast(error.message, "error", "No se pudo cargar el mapa");
        }
    }

    try {
        const data = await apiRequest("/api/get_next_map_name", { method: "GET" });
        if (data.nextName) {
            ui.mapNameInput.value = data.nextName;
        }
    } catch (error) {
        showToast(error.message, "warning", "Nombre automático no disponible");
    }
}

function restoreZoneFromProfile() {
    const storedZone = localStorage.getItem("zonaParaDibujar");
    if (!storedZone) return;

    try {
        const points = JSON.parse(storedZone);
        if (!Array.isArray(points) || points.length === 0) return;

        const polygon = renderSavedPolygon(points, "Geocerca seleccionada", {
            color: "#43be83",
            fillColor: "#43be83",
            fillOpacity: 0.12,
        });
        map.fitBounds(polygon.getBounds(), { padding: [32, 32] });
    } catch (error) {
        showToast("No se pudo restaurar la geocerca seleccionada.", "warning", "Vista incompleta");
    } finally {
        localStorage.removeItem("zonaParaDibujar");
    }
}

async function loadUserDevices() {
    try {
        const devices = await apiRequest("/api/my_devices", { method: "GET" });
        ui.deviceListContainer.innerHTML = "";
        
        if (devices.length === 0) {
            ui.deviceListContainer.innerHTML = '<div style="padding: 8px 16px; color: #888; font-size: 0.9rem;">Sin dispositivos</div>';
            return;
        }

        devices.forEach((device) => {
            const deviceColor = device.color || "#43be83";
            state.deviceColors[device.device_id] = deviceColor; 
            
            const isOnline = state.activeDevices.has(device.device_id);

            const row = document.createElement("div");
            row.className = "dropdown-item";
            row.style.cursor = "default"; 
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "12px";

            const eyeIcon = isOnline 
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' 
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

            row.innerHTML = `
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${deviceColor}; flex-shrink: 0; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>
                <span style="flex-grow: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isOnline ? '#fff' : '#888'}; transition: color 0.3s;">
                    ${escapeHtml(device.alias)}
                </span>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button class="btn-edit-device" style="background: transparent; border: none; color: #aaa; cursor: pointer; padding: 4px; border-radius: 4px;" title="Editar">
                        <svg class="ui-icon" style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-toggle-device" style="background: transparent; border: none; color: ${isOnline ? '#43be83' : '#555'}; cursor: pointer; padding: 4px; border-radius: 4px;" title="Mostrar/Ocultar">
                        <svg class="ui-icon" style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${eyeIcon}
                        </svg>
                    </button>
                </div>
            `;

            const toggleBtn = row.querySelector(".btn-toggle-device");
            toggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (state.activeDevices.has(device.device_id)) {
                    state.activeDevices.delete(device.device_id);
                    // Ocultamos el marcador inmediatamente
                    if (state.markers[device.device_id]) {
                        map.removeLayer(state.markers[device.device_id]);
                        delete state.markers[device.device_id];
                    }
                    showToast(`${device.alias} oculto del mapa.`, "info", "Monitor");
                } else {
                    state.activeDevices.add(device.device_id);
                    showToast(`${device.alias} activado. Esperando señal...`, "success", "Monitor");
                }
                loadUserDevices(); 
            });

            // Lógica del botón Editar (Lápiz)
            const editBtn = row.querySelector(".btn-edit-device");
            
            // Usamos onmousedown además de click para evitar que otros scripts bloqueen el evento
            editBtn.onmousedown = (e) => {
                e.preventDefault(); // Evita que pierda el foco
                e.stopPropagation(); // Evita que se cierre el menú antes de tiempo
                
                // 1. Llenamos los datos
                if (ui.editDeviceIdInput) ui.editDeviceIdInput.value = device.device_id;
                if (ui.editDeviceAliasInput) ui.editDeviceAliasInput.value = device.alias;
                if (ui.editDeviceColorInput) ui.editDeviceColorInput.value = deviceColor;
                
                // 2. Ocultamos el menú desplegable
                if (ui.deviceDropdownMenu) ui.deviceDropdownMenu.classList.remove("show");
                
                // 3. Mostramos la ventana de edición
                if (ui.editDeviceModal) {
                    ui.editDeviceModal.style.display = "flex";
                }
            };

            ui.deviceListContainer.appendChild(row);
        });
    } catch (error) {
        showToast("Error al cargar dispositivos.", "warning");
    }
}

async function saveDeviceEditAction() {
    const deviceId = ui.editDeviceIdInput.value;
    const newAlias = ui.editDeviceAliasInput.value.trim();
    const newColor = ui.editDeviceColorInput.value;

    if (!newAlias) {
        showToast("El alias no puede estar vacío.", "warning");
        return;
    }

    setButtonBusy(ui.editDeviceSubmit, true, "Guardando...");

    try {
        await apiRequest("/api/edit_device", {
            method: "POST",
            body: JSON.stringify({
                device_id: deviceId,
                alias: newAlias,
                color: newColor
            })
        });

        showToast("Dispositivo actualizado.", "success");
        ui.editDeviceModal.style.display = "none";
        
        // Si el marcador está en el mapa, lo borramos para que se dibuje con el nuevo color en el próximo parpadeo
        if (state.markers[deviceId]) {
            map.removeLayer(state.markers[deviceId]);
            delete state.markers[deviceId];
        }
        
        await loadUserDevices(); // Recargamos la UI
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setButtonBusy(ui.editDeviceSubmit, false);
    }
}

async function searchPlace() {
    const query = ui.searchInput.value.trim();
    if (!query) return;

    setButtonBusy(ui.searchButton, true, "Buscando");

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
        );
        const results = await response.json();

        if (!results || results.length === 0) {
            showToast("No se encontró ninguna coincidencia para esa búsqueda.", "warning", "Sin resultados");
            return;
        }

        const result = results[0];
        const lat = Number.parseFloat(result.lat);
        const lng = Number.parseFloat(result.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            throw new Error("La ubicación encontrada no tiene coordenadas válidas.");
        }

        map.flyTo([lat, lng], 15);

        if (state.searchMarker) {
            map.removeLayer(state.searchMarker);
        }

        state.searchMarker = L.marker([lat, lng]).addTo(map);
        state.searchMarker.bindPopup(`<strong>Resultado</strong><br>${escapeHtml(result.display_name)}`).openPopup();
    } catch (error) {
        showToast(error.message || "Hubo un problema al buscar el lugar.", "error", "Búsqueda fallida");
    } finally {
        setButtonBusy(ui.searchButton, false);
    }
}

function bindEvents() {
    ui.menuToggle.addEventListener("click", toggleMenu);
    ui.drawButton.addEventListener("click", startDrawing);
    ui.drawDropdownButton.addEventListener("click", (event) => {
        event.stopPropagation();
        ui.drawDropdownMenu.classList.toggle("show");
    });
    ui.drawCoordsButton.addEventListener("click", () => {
        ui.drawDropdownMenu.classList.remove("show");
        openCoordModal();
    });

    ui.geoPanelHeader.addEventListener("click", () => {
        ui.geoPanelContent.classList.toggle("collapsed");
        ui.geoPanelArrow.classList.toggle("arrow-up");
    });
    ui.geoPanelName.addEventListener("input", () => {
        if (state.currentMode === "DRAWING") syncGeoSaveState();
        else if (state.currentMode === "DRAWING_ROUTE") renderDrawnRoute(); 
    });
    
    ui.geoCancelButton.addEventListener("click", () => {
        if (state.currentMode === "DRAWING") cancelDrawing();
        else if (state.currentMode === "DRAWING_ROUTE") stopSimulation();
    });
    
    ui.geoConfirmButton.addEventListener("click", () => {
        if (state.currentMode === "DRAWING") validateCurrentShape();
        else if (state.currentMode === "DRAWING_ROUTE") {
             if (state.routePoints.length < 2) return;
             ui.geoPanelName.focus();
             showToast("Trayectoria válida. Asigna un nombre e inicia.", "success", "Ruta lista");
        }
    });
    
    ui.geoSaveButton.addEventListener("click", () => {
        if (state.currentMode === "DRAWING") saveZone();
        else if (state.currentMode === "DRAWING_ROUTE") runRouteSimulation();
    });

    ui.coordCancelButton.addEventListener("click", closeCoordModal);
    ui.coordSubmitButton.addEventListener("click", processCoordinates);

    ui.navDrawButton.addEventListener("click", startDrawing);
    ui.navCoordsButton.addEventListener("click", openCoordModal);
    ui.navSimulateButton.addEventListener("click", startSimulationSetup);
    ui.navStopButton.addEventListener("click", () => {
        stopSimulation();
        setActiveSidebarButton(null);
        setSidebarStatus("Simulación detenida.");
    });
    ui.navProfileButton.addEventListener("click", () => {
        window.location.href = "/profile";
    });
    ui.navLogoutButton.addEventListener("click", () => {
        window.location.href = "/logout";
    });
    // Eventos del modal de la LILYGO
    if (ui.editDeviceCancel) ui.editDeviceCancel.addEventListener("click", () => ui.editDeviceModal.style.display = "none");
    if (ui.editDeviceSubmit) ui.editDeviceSubmit.addEventListener("click", saveDeviceEditAction);
    if (ui.navAddDeviceButton) ui.navAddDeviceButton.addEventListener("click", openDeviceModal);
    if (ui.deviceCancelButton) ui.deviceCancelButton.addEventListener("click", closeDeviceModal);
    if (ui.deviceSubmitButton) ui.deviceSubmitButton.addEventListener("click", linkDeviceAction);
    ui.saveMapButton.addEventListener("click", saveMap);
    ui.searchButton.addEventListener("click", searchPlace);
    ui.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchPlace();
        }
    });

    document.addEventListener("click", (event) => {
        if (ui.drawDropdownMenu.classList.contains("show") &&
            !ui.drawDropdownMenu.contains(event.target) &&
            !ui.drawDropdownButton.contains(event.target)) {
            ui.drawDropdownMenu.classList.remove("show");
        }

        if (ui.sidebar.classList.contains("active") &&
            !ui.sidebar.contains(event.target) &&
            !ui.menuToggle.contains(event.target)) {
            closeMenu();
        }
    });
  
    ui.deviceDropdownBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        ui.deviceDropdownMenu.classList.toggle("show");
        if (ui.drawDropdownMenu) ui.drawDropdownMenu.classList.remove("show"); 
    });

    ui.openLinkModalBtn.addEventListener("click", () => {
        ui.deviceDropdownMenu.classList.remove("show");
        openDeviceModal(); 
    });


    document.addEventListener("click", (event) => {
        
        if (ui.deviceDropdownMenu.classList.contains("show") &&
            !ui.deviceDropdownMenu.contains(event.target) &&
            !ui.deviceDropdownBtn.contains(event.target)) {
            ui.deviceDropdownMenu.classList.remove("show");
        }
    });
    map.on("click", handleMapClick);
    map.on("mousemove", handleMapMouseMove);
}

async function init() {
    bindEvents();
    updatePointSummary();
    syncGeoSaveState();
    setAlertState("SAFE", "Monitoreo activo.");
    setSidebarStatus("En espera de interacción.");
    await loadMapContext();
    restoreZoneFromProfile();
    await loadUserDevices();
}

// --- LÓGICA DE VINCULACIÓN LILYGO ---
function openDeviceModal() {
    closeMenu(); // Cierra la barra lateral para que no estorbe
    ui.deviceIdInput.value = "";
    ui.deviceAliasInput.value = "";
    ui.deviceModal.style.display = "flex";
}

function closeDeviceModal() {
    ui.deviceModal.style.display = "none";
}

async function linkDeviceAction() {
    const deviceId = ui.deviceIdInput.value.trim();
    const alias = ui.deviceAliasInput.value.trim();

    if (!deviceId || !alias) {
        showToast("Por favor ingresa tanto el ID como el Alias.", "warning", "Datos incompletos");
        return;
    }

    // Usamos tu función para bloquear el botón mientras procesa
    setButtonBusy(ui.deviceSubmitButton, true, "Vinculando...");

    try {
        // Hacemos el POST usando tu propia función centralizada apiRequest
        const data = await apiRequest("/api/link_device", {
            method: "POST",
            body: JSON.stringify({ device_id: deviceId, alias: alias })
        });

        showToast(`El dispositivo "${alias}" se vinculó correctamente.`, "success", "Listo");
        closeDeviceModal();
    } catch (error) {
        // Tu apiRequest ya extrae el mensaje de error de Flask automáticamente
        showToast(error.message, "error", "Error al vincular");
    } finally {
        // Desbloqueamos el botón al terminar
        setButtonBusy(ui.deviceSubmitButton, false);
    }
}

init();
