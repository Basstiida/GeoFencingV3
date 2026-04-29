const textElement = document.getElementById('typewriter-text');
const text = "Geofencing";
let index = 0;

function type() {
    if (index < text.length) {
        textElement.textContent += text.charAt(index);
        index++;
        setTimeout(type, 50); // Velocidad de escritura
    }
}

document.addEventListener('DOMContentLoaded', type);

const API_URL = `${window.location.origin}/api`;

        async function handleLogin() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            showMessage("Conectando...", "black");
            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Bienvenido! Redirigiendo...", "green");
                    // Guardamos el usuario en el navegador
                    localStorage.setItem('user_email', data.email);
                    setTimeout(() => {
                        window.location.href = "/profile"; // Te manda al perfil
                    }, 1000);
                } else {
                    showMessage(data.message, "red");
                }
            } catch (error) {
                showMessage("Error de conexión con el servidor", "red");
            }
        }

// -----------FUNCION DE CAPTURA DE DATOS EN REGISTRO------------//        
        async function handleRegister() {
            const nombre = document.getElementById('nombre').value;
            const paterno = document.getElementById('paterno').value;
            const materno = document.getElementById('materno').value;
            const telefono = document.getElementById('telefono').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // 2. Validación básica
            if(!nombre || !email || !password) {
                showMessage("Por favor, llena los campos obligatorios", "red");
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // 3. Enviamos TODO a Python
                    body: JSON.stringify({ 
                        nombre, 
                        paterno, 
                        materno, 
                        telefono, 
                        email, 
                        password 
                    })
                });
                
                const data = await response.json();

                if (response.ok) {
                    showMessage("¡Cuenta creada en R2-D2! Redirigiendo...", "green");
                    setTimeout(() => { window.location.href = "/"; }, 1500);
                } else {
                    showMessage("Error: " + (data.message || "No se pudo registrar"), "red");
                }
            } catch (error) {
                showMessage("Error de conexión con el servidor", "red");
            }
        }

        function showMessage(text, color) {
            const msgDiv = document.getElementById('msg');
            msgDiv.innerText = text;
            msgDiv.style.color = color;
        }


document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault(); 
    handleLogin();          
});

// ARTURO
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const datos = {
            nombre: document.getElementById('reg-nombre').value,
            paterno: document.getElementById('reg-paterno').value,
            materno: document.getElementById('reg-materno').value,
            telefono: document.getElementById('reg-tel').value,
            email: document.getElementById('reg-email').value,
            password: document.getElementById('reg-password').value
        };

        showMessage("Creando cuenta...", "black");

        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            
            const resData = await response.json();

            if (response.ok) {
                showMessage("¡Cuenta creada con éxito! Redirigiendo...", "green");
                setTimeout(() => { window.location.href = "/"; }, 2000);
            } else {
                showMessage("Error: " + resData.message, "red");
            }
        } catch (error) {
            showMessage("Error de conexión", "red");
        }
    });
}

//-----------------PROFILE----------------------------------------------------------------
function toggleProfileMenu() {
    document.getElementById("profileDropdown").classList.toggle("show");
}

// Cierra el menú si se hace clic fuera de él
window.onclick = function(event) {
    if (!event.target.matches('.profile-icon') && !event.target.matches('.round-profile-pic')) {
        const dropdowns = document.getElementsByClassName("profile-dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
function handleLogout() {
    localStorage.removeItem('user_email');
    window.location.href = "/";
}

function handleSearch() {
    const query = document.getElementById('global-search').value.toLowerCase();
    const geofences = document.querySelectorAll('.geofence-item'); // Clase que usaremos en la lista

    geofences.forEach(item => {
        const text = item.innerText.toLowerCase();
        // Si el nombre coincide, se muestra; si no, se oculta
        item.style.display = text.includes(query) ? 'block' : 'none';
    });
}
