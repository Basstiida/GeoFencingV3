const settingsUi = {
    toastRegion: document.getElementById("toast-region"),
    form: document.getElementById("profile-form"),
    saveButton: document.getElementById("profile-save-btn"),
    photoComingSoonButton: document.getElementById("photo-coming-soon-btn"),
    displayName: document.getElementById("identity-name"),
    initials: document.getElementById("identity-initials"),
    nombreInput: document.getElementById("profile-nombre"),
    apellidoPaternoInput: document.getElementById("profile-apellido-paterno"),
    apellidoMaternoInput: document.getElementById("profile-apellido-materno"),
    telefonoInput: document.getElementById("profile-telefono"),
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
    if (!settingsUi.toastRegion) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="toast-copy">
            <span class="toast-title">${escapeHtml(title || tone)}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        </div>
    `;

    settingsUi.toastRegion.appendChild(toast);
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

function setSavingState(isSaving) {
    settingsUi.saveButton.classList.toggle("is-loading", isSaving);
    settingsUi.saveButton.disabled = isSaving;
}

function buildInitials(nombre, apellidoPaterno) {
    const letters = [nombre, apellidoPaterno]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map((value) => value[0].toUpperCase())
        .slice(0, 2);

    return letters.join("") || "US";
}

function syncIdentity(profile) {
    settingsUi.displayName.textContent = profile.display_name;
    settingsUi.initials.textContent = profile.initials;
}

async function handleProfileSubmit(event) {
    event.preventDefault();

    const payload = {
        nombre: settingsUi.nombreInput.value.trim(),
        apellido_paterno: settingsUi.apellidoPaternoInput.value.trim(),
        apellido_materno: settingsUi.apellidoMaternoInput.value.trim(),
        telefono: settingsUi.telefonoInput.value.trim(),
    };

    if (!payload.nombre || !payload.apellido_paterno || !payload.telefono) {
        showToast("Completa nombre, apellido paterno y teléfono.", "warning", "Campos incompletos");
        return;
    }

    setSavingState(true);

    try {
        const data = await apiRequest("/api/profile", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        settingsUi.initials.textContent = buildInitials(payload.nombre, payload.apellido_paterno);
        syncIdentity(data.profile);
        showToast(data.message, "success", "Perfil actualizado");
    } catch (error) {
        showToast(error.message, "error", "No se pudo guardar");
    } finally {
        setSavingState(false);
    }
}

function bindSettingsEvents() {
    settingsUi.form.addEventListener("submit", handleProfileSubmit);
    settingsUi.photoComingSoonButton.addEventListener("click", () => {
        showToast(
            "La carga de foto necesita un campo nuevo en la base y almacenamiento de archivos. La vista ya quedó lista para esa siguiente fase.",
            "warning",
            "Función pendiente",
        );
    });
}

bindSettingsEvents();
