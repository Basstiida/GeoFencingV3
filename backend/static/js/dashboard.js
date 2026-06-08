const dashboardUi = {
    toastRegion: document.getElementById("toast-region"),
    profileToggle: document.getElementById("profile-toggle"),
    profileDropdown: document.getElementById("profileDropdown"),
    searchInput: document.getElementById("dash-search"),
    geofenceTabButton: document.getElementById("btn-tab-geocercas"),
    mapTabButton: document.getElementById("btn-tab-mapas"),
    geofenceSection: document.getElementById("seccion-geocercas"),
    mapSection: document.getElementById("seccion-mapas"),
    deleteModal: document.getElementById("deleteModal"),
    deleteModalTitle: document.getElementById("delete-modal-title"),
    deleteModalCopy: document.getElementById("delete-modal-copy"),
    deleteCancelButton: document.getElementById("delete-cancel-btn"),
    deleteConfirmButton: document.getElementById("delete-confirm-btn"),
    createGeofenceButton: document.getElementById("create-geofence-btn"),
    settingsButton: document.getElementById("profile-settings-btn"),
    profileLogoutButton: document.getElementById("profile-logout-btn"),
    sidebarLogoutButton: document.getElementById("sidebar-logout-btn"),
    //DISPOSITIVOS
    deviceTabButton: document.getElementById("btn-tab-dispositivos"),
    deviceSection: document.getElementById("seccion-dispositivos"),
    addDeviceBtn: document.getElementById("btn-add-device-dash"),
    deviceModalDash: document.getElementById("deviceModalDash"),
    dashDeviceCancel: document.getElementById("dash-device-cancel"),
    dashDeviceSubmit: document.getElementById("dash-device-submit"),
    dashDeviceIdInput: document.getElementById("dash-device-id"),
    dashDeviceAliasInput: document.getElementById("dash-device-alias"),
};

const deleteState = {
    id: null,
    type: null,
};

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function showToast(message, tone = "info", title) {
    if (!dashboardUi.toastRegion) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="toast-copy">
            <span class="toast-title">${escapeHtml(title || tone)}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        </div>
    `;

    dashboardUi.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : { message: "La respuesta del servidor no es válida." };

    if (!response.ok) {
        throw new Error(data.message || "No se pudo completar la operación.");
    }

    return data;
}

function toggleProfileMenu() {
    dashboardUi.profileDropdown.classList.toggle("show");
}

function closeProfileMenu() {
    dashboardUi.profileDropdown.classList.remove("show");
}

function openDeleteModal(type, id) {
    deleteState.id = id;
    deleteState.type = type;

    if (type === "map") {
        dashboardUi.deleteModalTitle.textContent = "Eliminar mapa";
        dashboardUi.deleteModalCopy.textContent = "El mapa se eliminará y sus geocercas quedarán sin mapa asignado. Esta acción no se puede deshacer.";
    } else if (type === "device") {
        dashboardUi.deleteModalTitle.textContent = "Desvincular LILYGO";
        dashboardUi.deleteModalCopy.textContent = "El dispositivo dejará de transmitir a tu cuenta y se borrará del sistema. Esta acción no se puede deshacer.";
    } else {
        dashboardUi.deleteModalTitle.textContent = "Eliminar geocerca";
        dashboardUi.deleteModalCopy.textContent = "La geocerca se eliminará definitivamente. Esta acción no se puede deshacer.";
    }

    dashboardUi.deleteModal.style.display = "flex";
}

function closeDeleteModal() {
    deleteState.id = null;
    deleteState.type = null;
    dashboardUi.deleteModal.style.display = "none";
}

async function confirmDeletion() {
    if (!deleteState.id || !deleteState.type) return;

    let endpoint = "";
    if (deleteState.type === "map") endpoint = `/api/delete_map/${deleteState.id}`;
    else if (deleteState.type === "device") endpoint = `/api/delete_device/${deleteState.id}`;
    else endpoint = `/api/delete_zone/${deleteState.id}`;

    try {
        await apiRequest(endpoint, { method: "POST" });
        window.location.reload();
    } catch (error) {
        showToast(error.message, "error", "Error");
        closeDeleteModal();
    }
}

function showGeofenceSection() {
    dashboardUi.geofenceSection.style.display = "block";
    dashboardUi.mapSection.style.display = "none";
    dashboardUi.geofenceTabButton.classList.add("active");
    dashboardUi.mapTabButton.classList.remove("active");
    handleSearch({ target: dashboardUi.searchInput });
}

function showMapSection() {
    dashboardUi.geofenceSection.style.display = "none";
    dashboardUi.mapSection.style.display = "block";
    dashboardUi.mapTabButton.classList.add("active");
    dashboardUi.geofenceTabButton.classList.remove("active");
    handleSearch({ target: dashboardUi.searchInput });
}

function getVisibleRows() {
    const activeTable = dashboardUi.geofenceSection.style.display === "none"
        ? dashboardUi.mapSection.querySelectorAll(".table-row")
        : dashboardUi.geofenceSection.querySelectorAll(".table-row");

    return [...activeTable];
}

function handleSearch(event) {
    const query = event.target.value.trim().toLowerCase();

    getVisibleRows().forEach((row) => {
        const searchValue = row.dataset.search || "";
        row.style.display = searchValue.includes(query) ? "" : "none";
    });
}

function openZoneFromRow(row) {
    const coordinates = row.getAttribute("data-coords");
    if (!coordinates) return;

    localStorage.setItem("zonaParaDibujar", coordinates);
    window.location.href = "/map";
}

function openMapFromRow(row) {
    const mapId = row.dataset.mapId;
    if (!mapId) return;

    window.location.href = `/map?map_id=${mapId}`;
}

function handleTableClick(event) {
    const deleteButton = event.target.closest("[data-delete-type]");
    if (deleteButton) {
        event.stopPropagation();
        openDeleteModal(deleteButton.dataset.deleteType, deleteButton.dataset.deleteId);
        return;
    }

    const row = event.target.closest(".table-row[data-row-action]");
    if (!row) return;

    if (row.dataset.rowAction === "open-zone") {
        openZoneFromRow(row);
    } else if (row.dataset.rowAction === "open-map") {
        openMapFromRow(row);
    }
}

function bindDashboardEvents() {
    dashboardUi.deviceTabButton.addEventListener("click", showDeviceSection);
    dashboardUi.addDeviceBtn.addEventListener("click", openDeviceModalDash);
    dashboardUi.dashDeviceCancel.addEventListener("click", closeDeviceModalDash);
    dashboardUi.dashDeviceSubmit.addEventListener("click", linkDeviceDashAction);
    dashboardUi.profileToggle.addEventListener("click", toggleProfileMenu);
    dashboardUi.geofenceTabButton.addEventListener("click", showGeofenceSection);
    dashboardUi.mapTabButton.addEventListener("click", showMapSection);
    dashboardUi.searchInput.addEventListener("input", handleSearch);
    dashboardUi.deleteCancelButton.addEventListener("click", closeDeleteModal);
    dashboardUi.deleteConfirmButton.addEventListener("click", confirmDeletion);
    dashboardUi.createGeofenceButton.addEventListener("click", () => {
        window.location.href = "/map";
    });
    dashboardUi.settingsButton.addEventListener("click", () => {
        window.location.href = "/settings";
    });

    [dashboardUi.profileLogoutButton, dashboardUi.sidebarLogoutButton].forEach((button) => {
        button.addEventListener("click", () => {
            window.location.href = "/logout";
        });
    });

    document.addEventListener("click", (event) => {
        if (!dashboardUi.profileDropdown.contains(event.target) && !dashboardUi.profileToggle.contains(event.target)) {
            closeProfileMenu();
        }
    });

    document.addEventListener("click", handleTableClick);
}
function showDeviceSection() {
    dashboardUi.geofenceSection.style.display = "none";
    dashboardUi.mapSection.style.display = "none";
    dashboardUi.deviceSection.style.display = "block";
    
    dashboardUi.deviceTabButton.classList.add("active");
    dashboardUi.geofenceTabButton.classList.remove("active");
    dashboardUi.mapTabButton.classList.remove("active");
    
    handleSearch({ target: dashboardUi.searchInput });
}

// Actualiza getVisibleRows para incluir la nueva tabla
function getVisibleRows() {
    if (dashboardUi.geofenceSection.style.display === "block") {
        return [...dashboardUi.geofenceSection.querySelectorAll(".table-row")];
    } else if (dashboardUi.mapSection.style.display === "block") {
        return [...dashboardUi.mapSection.querySelectorAll(".table-row")];
    } else {
        return [...dashboardUi.deviceSection.querySelectorAll(".table-row")];
    }
}

function openDeviceModalDash() {
    dashboardUi.dashDeviceIdInput.value = "";
    dashboardUi.dashDeviceAliasInput.value = "";
    dashboardUi.deviceModalDash.style.display = "flex";
}

function closeDeviceModalDash() {
    dashboardUi.deviceModalDash.style.display = "none";
}

async function linkDeviceDashAction() {
    const deviceId = dashboardUi.dashDeviceIdInput.value.trim();
    const alias = dashboardUi.dashDeviceAliasInput.value.trim();

    if (!deviceId || !alias) {
        showToast("Por favor ingresa tanto el ID como el Alias.", "warning", "Datos incompletos");
        return;
    }

    const btn = dashboardUi.dashDeviceSubmit;
    const originalText = btn.textContent;
    btn.textContent = "Vinculando...";
    btn.disabled = true;

    try {
        await apiRequest("/api/link_device", {
            method: "POST",
            body: JSON.stringify({ device_id: deviceId, alias: alias })
        });
        window.location.reload(); // Recarga para ver la tabla actualizada
    } catch (error) {
        showToast(error.message, "error", "Error al vincular");
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

bindDashboardEvents();
