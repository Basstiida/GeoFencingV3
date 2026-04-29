# GeoTracker Web

Proyecto web para administrar geocercas, mapas y eventos de ubicación en tiempo real.  
La parte móvil en `tracker_app/` existe aparte, pero **no es necesaria** para correr la versión web.

## Estado actual

La aplicación web hoy permite:

- registro e inicio de sesión
- gestión de geocercas y mapas
- monitoreo de eventos de geocercas
- edición y consulta de mapas
- vista de perfil/configuración del usuario
- actualización de datos básicos del perfil

Stack actual:

- `Flask` para backend y render de vistas
- `Flask-SocketIO` para eventos en tiempo real
- `Flask-SQLAlchemy` para acceso a datos
- `Flask-Bcrypt` para hash de contraseñas
- `Shapely` para validación espacial de geocercas
- `Leaflet + CARTO` para el mapa web
- `Nominatim / OpenStreetMap` para búsqueda de lugares

## Cambios e implementaciones realizadas

### 1. Backend

- Se estandarizaron respuestas JSON con mensajes más claros.
- Se agregaron validaciones de entrada para login, registro, geocercas, mapas y ubicación.
- Se corrigió el manejo de sesión:
  - redirección al login si no hay sesión válida
  - `logout` real con `session.clear()`
- Se habilitó `PORT` por variable de entorno para evitar conflictos con el puerto `5000`.
- Se corrigió la detección de geocercas para que use zonas persistidas en base de datos y no solo zonas fijas en memoria.
- Se agregó la API `POST /api/profile` para actualizar datos del usuario.

### 2. Autenticación

- Se rediseñó la pantalla de login para que se vea más sobria y menos improvisada.
- Se eliminaron flujos duplicados de login/registro.
- Se reemplazaron mensajes verdes inline por modales de estado:
  - modal con spinner al iniciar sesión o crear cuenta
  - modal rojo con advertencia cuando ocurre un error

### 3. Dashboard / perfil principal

- Se rediseñó la vista principal del usuario.
- Se eliminaron emojis y se reemplazaron por iconografía SVG.
- Se mejoró la tabla de geocercas/mapas y su interacción.
- Se corrigió el problema visual del dropdown del perfil que quedaba por debajo de la tabla.
- Se agregaron acciones más limpias para abrir, eliminar y navegar entre mapas y geocercas.

### 4. Editor de mapa

- Se unificó el flujo de guardado de geocercas.
- Se redujo el uso de `alert()` y se cambió por notificaciones visuales.
- Se mejoró el estilo general del editor.
- Se mantuvo integración con eventos en tiempo real por Socket.IO.

### 5. Configuración / perfil de usuario

- Se creó una vista real de configuración en `/settings`.
- Se muestra:
  - nombre visible
  - correo
  - teléfono
  - apellidos
  - conteo de geocercas
  - conteo de mapas
  - conteo de dispositivos
- Se permite editar:
  - `nombre`
  - `apellido_paterno`
  - `apellido_materno`
  - `telefono`
- Se dejó preparada la sección de foto de perfil como siguiente fase.

## Estructura importante

```text
Geofencing-1/
├── backend/
│   ├── app.py
│   ├── templates/
│   │   ├── login.html
│   │   ├── profile.html
│   │   ├── settings.html
│   │   └── index.html
│   └── static/
│       ├── css/
│       ├── js/
│       └── img/
├── tracker_app/
├── requirements.txt
└── websocket_tester.html
```

## Mejoras pendientes

Estas son las mejoras más claras para la siguiente etapa:

- agregar subida real de foto de perfil
- permitir cambio de contraseña
- permitir cambio de correo con verificación
- agregar gestión real de dispositivos enlazados
- agregar pruebas automáticas para backend
- agregar migraciones de base de datos
- limpiar archivos legacy que ya no deberían seguir vivos, por ejemplo `backend/static/script.js`
- centralizar configuración con `.env`
- mejorar manejo de errores con logging más estructurado

## Lo que vamos a implementar después

Roadmap corto recomendado:

### Fase 1

- persistencia de foto de perfil
- vista de información del usuario más completa
- mensajes de confirmación más consistentes

### Fase 2

- edición de contraseña
- edición segura de correo
- administración de dispositivos por usuario

### Fase 3

- pruebas unitarias y de integración
- migraciones con Alembic o Flask-Migrate
- endurecimiento de seguridad y validaciones

## Base de datos

El proyecto **no usa SQLite como fallback** en este momento.

La resolución actual de base de datos es:

1. Si existe `DATABASE_URL`, se usa esa conexión.
2. Si no existe, el backend intenta conectarse a un SQL Server local:
   - servidor `R2-D2`
   - base `GeofencingDB`

Eso significa que en macOS lo más práctico hoy es correr el proyecto con:

- `PostgreSQL` local
- o una base remota tipo `Supabase`

## Cómo correr el proyecto web en macOS paso a paso

### 1. Entrar al proyecto

```bash
cd /Users/mauriciocv/Desktop/BastiProyect/Geofencing-1
```

### 2. Crear el entorno virtual si no existe

```bash
python3 -m venv .venv
```

Si ya existe, omite ese paso.

### 3. Activar el entorno virtual

```bash
source .venv/bin/activate
```

### 4. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 5. Preparar una base PostgreSQL local en Mac

Si no tienes PostgreSQL instalado:

```bash
brew install postgresql@16
brew services start postgresql@16
```

Crear la base:

```bash
createdb geotracker
```

Si `createdb` falla por usuario o permisos, crea la base manualmente con tu usuario de Postgres.

### 6. Exportar variables de entorno

Ejemplo con PostgreSQL local:

```bash
export DATABASE_URL='postgresql://TU_USUARIO@localhost:5432/geotracker'
export SECRET_KEY='cambia-esto-por-una-clave-segura'
export AUTO_CREATE_TABLES=1
export PORT=5001
```

Notas:

- `PORT=5001` es recomendable en Mac porque `5000` puede estar ocupado por servicios del sistema.
- Si usas Supabase u otra base remota, cambia `DATABASE_URL` por la URL real.

### 7. Ejecutar el backend web

```bash
python backend/app.py
```

### 8. Abrir la aplicación en el navegador

```text
http://127.0.0.1:5001
```

## Flujo recomendado para probar la web

1. Abrir login
2. Registrar un usuario nuevo
3. Iniciar sesión
4. Entrar al panel de perfil
5. Crear una geocerca
6. Guardar un mapa
7. Ir a configuración y editar nombre o teléfono

## Validaciones útiles durante desarrollo

Validar Python:

```bash
python3 -m py_compile backend/app.py
```

Validar JS principal:

```bash
node --check backend/static/js/auth.js
node --check backend/static/js/dashboard.js
node --check backend/static/js/map.js
node --check backend/static/js/settings.js
```

## Rutas principales

- `/` login
- `/register-view` registro
- `/profile` dashboard principal del usuario
- `/settings` vista de perfil y configuración
- `/map` editor / visor de mapa

## Observaciones importantes

- La app móvil Flutter está separada. Para la web no necesitas `flutter`.
- Hoy el proyecto web **se ejecuta**, no tiene una fase de compilación frontend como React/Vite.
- No hay migraciones todavía; si cambias el modelo de usuario para foto o nuevos campos, tendrás que agregar esquema manualmente o introducir una herramienta de migraciones.

## Siguiente tarea técnica recomendada

La mejora con más valor inmediato es:

1. agregar campo de foto al modelo `User`
2. crear endpoint de carga de imagen
3. guardar la ruta o URL en base de datos
4. conectar esa persistencia a `/settings`
