const API_URL = `${window.location.origin}/api`;

const textElement = document.getElementById("typewriter-text");
const text = "Geofencing";

const authUi = {
    modal: document.getElementById("auth-modal"),
    modalDialog: document.getElementById("auth-modal-dialog"),
    modalTitle: document.getElementById("auth-modal-title"),
    modalMessage: document.getElementById("auth-modal-message"),
    modalCloseButton: document.getElementById("auth-modal-close"),
};

function typeTitle() {
    if (!textElement) return;

    let index = 0;
    const tick = () => {
        if (index < text.length) {
            textElement.textContent += text.charAt(index);
            index += 1;
            window.setTimeout(tick, 50);
        }
    };

    tick();
}

function openModal({ title, message, tone = "error", closable = true }) {
    if (!authUi.modal || !authUi.modalTitle || !authUi.modalMessage || !authUi.modalDialog) return;

    authUi.modalDialog.dataset.tone = tone;
    authUi.modalTitle.textContent = title;
    authUi.modalMessage.textContent = message;
    authUi.modalCloseButton.hidden = !closable;
    authUi.modal.dataset.closable = closable ? "true" : "false";
    authUi.modal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeModal() {
    if (!authUi.modal) return;
    authUi.modal.hidden = true;
    authUi.modal.dataset.closable = "true";
    document.body.classList.remove("modal-open");
}

function setFormBusy(form, isBusy) {
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = isBusy;
    }
}

async function apiRequest(path, payload) {
    const response = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : { message: "La respuesta del servidor no es válida." };

    if (!response.ok) {
        throw new Error(data.message || "No se pudo completar la solicitud.");
    }

    return data;
}

function setupLoginForm() {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.getElementById("email")?.value.trim() || "";
        const password = document.getElementById("password")?.value || "";

        if (!email || !password) {
            openModal({
                title: "Datos incompletos",
                message: "Ingresa tu correo y contraseña.",
                tone: "error",
            });
            return;
        }

        setFormBusy(loginForm, true);
        openModal({
            title: "Iniciando sesión",
            message: "Validando tus credenciales y preparando el acceso al panel.",
            tone: "loading",
            closable: false,
        });

        try {
            const data = await apiRequest("/login", { email, password });
            localStorage.setItem("user_email", data.email);
            openModal({
                title: "Iniciando sesión",
                message: "Acceso concedido. Redirigiendo al panel...",
                tone: "loading",
                closable: false,
            });
            window.setTimeout(() => {
                window.location.href = "/profile";
            }, 700);
        } catch (error) {
            closeModal();
            setFormBusy(loginForm, false);
            openModal({
                title: "No se pudo iniciar sesión",
                message: error.message,
                tone: "error",
            });
        }
    });
}

function setupRegisterForm() {
    const registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            nombre: document.getElementById("nombre")?.value.trim() || "",
            paterno: document.getElementById("paterno")?.value.trim() || "",
            materno: document.getElementById("materno")?.value.trim() || "",
            telefono: document.getElementById("telefono")?.value.trim() || "",
            email: document.getElementById("email")?.value.trim() || "",
            password: document.getElementById("password")?.value || "",
        };

        if (!payload.nombre || !payload.paterno || !payload.telefono || !payload.email || !payload.password) {
            openModal({
                title: "Datos incompletos",
                message: "Completa todos los campos obligatorios.",
                tone: "error",
            });
            return;
        }

        setFormBusy(registerForm, true);
        openModal({
            title: "Creando cuenta",
            message: "Estamos registrando tu información. Espera un momento.",
            tone: "loading",
            closable: false,
        });

        try {
            await apiRequest("/register", payload);
            openModal({
                title: "Creando cuenta",
                message: "Cuenta creada. Redirigiendo al inicio de sesión...",
                tone: "loading",
                closable: false,
            });
            window.setTimeout(() => {
                window.location.href = "/";
            }, 900);
        } catch (error) {
            closeModal();
            setFormBusy(registerForm, false);
            openModal({
                title: "No se pudo crear la cuenta",
                message: error.message,
                tone: "error",
            });
        }
    });
}

function setupModal() {
    if (!authUi.modal) return;

    authUi.modalCloseButton?.addEventListener("click", closeModal);

    authUi.modal.addEventListener("click", (event) => {
        if (
            authUi.modal.dataset.closable !== "false" &&
            event.target instanceof HTMLElement &&
            event.target.dataset.closeModal === "true"
        ) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (
            authUi.modal.dataset.closable !== "false" &&
            event.key === "Escape" &&
            !authUi.modal.hidden
        ) {
            closeModal();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    typeTitle();
    closeModal();
    setupModal();
    setupLoginForm();
    setupRegisterForm();
});
