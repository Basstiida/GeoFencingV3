import os
import re
import urllib
import json
from datetime import timedelta, datetime
import requests
#Token Telegram: 8777210619:AAFeIlaVcx8FYh4OkMTwTHtg9NX7ejmzJF0

from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_socketio import SocketIO
from flask_cors import CORS
from shapely.geometry import Point, Polygon
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt



app = Flask(__name__)
CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://127.0.0.1:5000",
        "http://localhost:5000",
        "http://127.0.0.1:5001",
        "http://localhost:5001",
    ],
)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'mi_clave_secreta_super_segura!')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)


def build_database_uri():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        # Supabase usually provides postgres/postgresql URLs. Use the explicit
        # psycopg driver so SQLAlchemy does not depend on the older psycopg2 path.
        if database_url.startswith("postgres://"):
            return database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if database_url.startswith("postgresql://"):
            return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return database_url

    params = urllib.parse.quote_plus(
        'DRIVER={ODBC Driver 17 for SQL Server};'
        'SERVER=R2-D2;'
        'DATABASE=GeofencingDB;'
        'Trusted_Connection=yes;'
    )
    return f"mssql+pyodbc:///?odbc_connect={params}"


app.config['SQLALCHEMY_DATABASE_URI'] = build_database_uri()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_pre_ping": True,
}


def json_response(message, status=200, **extra):
    payload = {"message": message}
    payload.update(extra)
    return jsonify(payload), status


def get_json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError("La solicitud no contiene JSON válido.")
    return data


def normalize_text(value):
    return value.strip() if isinstance(value, str) else ""

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
socketio = SocketIO(app, cors_allowed_origins="*")
# --- ARTURO MODELOS ---
class User(db.Model):
    __tablename__ = 'Usuarios' 
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100))
    apellido_paterno = db.Column(db.String(100))
    apellido_materno = db.Column(db.String(100))
    telefono = db.Column(db.String(20))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    devices = db.relationship('Device', backref='owner', lazy=True)

class Device(db.Model):
    __tablename__ = 'Dispositivos' 
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(50), unique=True, nullable=False)
    alias = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(20), default="#43be83") 
    user_id = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)

class Mapa(db.Model):
    __tablename__ = 'Mapas'
    id_mapa = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)
    nombre_mapa = db.Column(db.String(100), nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    geocercas = db.relationship('Geocerca', backref='mapa', lazy=True)

    @property
    def cantidad_geocercas(self):
        return len(self.geocercas)

class Geocerca(db.Model):
    __tablename__ = 'Geocercas' 
    id_geocerca = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)
    id_mapa = db.Column(db.Integer, db.ForeignKey('Mapas.id_mapa'), nullable=True) # <--- NUEVO
    nombre_zona = db.Column(db.String(100), nullable=False)
    coordenadas_json = db.Column(db.Text, nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    
    @property
    def cantidad_puntos(self):
        try:
            puntos_lista = json.loads(self.coordenadas_json)
            return len(puntos_lista)
        except:
            return 0


def get_authenticated_user():
    user_email = session.get("user_email")
    if not user_email:
        return None, json_response("Debes iniciar sesión para continuar.", 401)

    user = User.query.filter_by(email=user_email).first()
    if not user:
        session.clear()
        return None, json_response("Tu sesión ya no es válida. Inicia sesión de nuevo.", 401)

    return user, None


def build_user_display_name(user):
    if not user:
        return "Usuario"

    parts = [
        normalize_text(user.nombre),
        normalize_text(user.apellido_paterno),
    ]
    full_name = " ".join(part for part in parts if part)
    return full_name or "Usuario"


def build_user_initials(user):
    if not user:
        return "US"

    letters = []
    for value in (user.nombre, user.apellido_paterno):
        clean_value = normalize_text(value)
        if clean_value:
            letters.append(clean_value[0].upper())

    if not letters:
        return "US"

    return "".join(letters[:2])


def normalize_zone_points(points):
    if not isinstance(points, list):
        raise ValueError("La lista de puntos de la geocerca es inválida.")

    normalized_points = []
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("Cada punto debe incluir latitud y longitud.")

        try:
            lat = float(point["lat"])
            lng = float(point["lng"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Cada punto debe incluir latitud y longitud válidas.")

        normalized_points.append({"lat": lat, "lng": lng})

    if len(normalized_points) < 3:
        raise ValueError("Se necesitan al menos 3 puntos para formar una geocerca.")

    return normalized_points


def get_dynamic_zone_polygons(user_id, map_id=None):
    if not user_id:
        return []
        
    zone_query = Geocerca.query.filter_by(id_usuario=user_id)
    
    if map_id and str(map_id) != "0" and str(map_id).strip() != "":
        try:
            zone_query = zone_query.filter_by(id_mapa=int(map_id))
        except ValueError:
            pass
    else:
        zone_query = zone_query.filter_by(id_mapa=None)

    polygons = []
    for zone in zone_query.all():
        try:
            zone_points = json.loads(zone.coordenadas_json)
            polygon_points = [
                (float(point["lng"]), float(point["lat"]))
                for point in zone_points
            ]
            if len(polygon_points) >= 3:
                polygons.append({
                    "name": zone.nombre_zona,
                    "polygon": Polygon(polygon_points),
                })
        except (TypeError, ValueError, KeyError, json.JSONDecodeError):
            app.logger.warning("Se omitió una geocerca inválida: %s", zone.id_geocerca)

    return polygons
# --- ZONAS (GEOCERCAS) ---

# 1. Zonas Fijas


# 2. Zonas Dinámicas (Lista vacía al inicio)
CUSTOM_ZONES = [] 
DEVICE_ZONE_STATES = {}

@app.route("/api/reset_bot_state", methods=['POST'])
def reset_bot_state():
    if "simulador_bot" in DEVICE_ZONE_STATES:
        DEVICE_ZONE_STATES["simulador_bot"] = {}
    return json_response("Memoria reiniciada", 200)

# --- RUTAS WEB ---
@app.route("/")
def home(): return render_template('login.html')

@app.route("/map")
def map():
    if not session.get("user_email"):
        return redirect(url_for("home"))
    return render_template('index.html')

# --- API: GESTIÓN DE ZONAS ---
@app.route("/api/clear_zones", methods=['POST'])
def clear_zones():
    # Reinicia la lista
    global CUSTOM_ZONES
    CUSTOM_ZONES = []
    app.logger.info("Se limpiaron las zonas temporales en memoria.")
    return json_response("Se limpiaron las zonas temporales.", 200)

# --- API: UBICACIÓN ---
@app.route("/api/update_location", methods=['POST'])
def update_location():
    try:
        data = get_json_body()
        lat = float(data["lat"])
        lng = float(data["lng"])
        
        device_id = normalize_text(data.get("device_id")) or "unknown"
        device_db = Device.query.filter_by(device_id=device_id).first()
        alias = normalize_text(data.get("alias")) or (device_db.alias if device_db else device_id)

        user_id = None
        if device_db:
            user_id = device_db.user_id 
        else:
            user_web, _ = get_authenticated_user() 
            if user_web:
                user_id = user_web.id
                
        map_id = data.get("map_id")
        user_location = Point(lng, lat)
        
        if device_id not in DEVICE_ZONE_STATES:
            DEVICE_ZONE_STATES[device_id] = {}

        # Cargamos únicamente las zonas creadas por el usuario en este mapa
        zonas_a_revisar = get_dynamic_zone_polygons(user_id, map_id)

        # --- Variables para mantener el color del panel ---
        estado_panel = 'SAFE'
        mensaje_panel = 'Monitoreo activo.'

        for zone in zonas_a_revisar:
            zone_name = zone["name"]
            is_inside = zone["polygon"].contains(user_location)
            was_inside = DEVICE_ZONE_STATES[device_id].get(zone_name, False)

            # Todas las zonas personalizadas generarán alerta de peligro (DANGER) por defecto
            nivel_alerta = 'DANGER'

            # Si está adentro en este momento, el panel debe reflejar peligro
            if is_inside:
                estado_panel = nivel_alerta
                mensaje_panel = f'Dentro de {zone_name}'

            # Evaluamos si cruzó la frontera hacia adentro
            if is_inside and not was_inside:
                DEVICE_ZONE_STATES[device_id][zone_name] = True
                msg = f'{alias} entró a {zone_name}.'
                socketio.emit('geofence_event', {'status': nivel_alerta, 'message': msg})
                app.logger.info(f"ENTRADA: {msg}")
                
            # Evaluamos si cruzó la frontera hacia afuera
            elif not is_inside and was_inside:
                DEVICE_ZONE_STATES[device_id][zone_name] = False
                msg = f'{alias} salió de {zone_name}.'
                socketio.emit('geofence_event', {'status': 'INFO', 'message': msg})
                app.logger.info(f"SALIDA: {msg}")
                enviar_alerta_telegram(f"<b>ACTUALIZACIÓN</b>\n{msg}\n Hora: {datetime.now().strftime('%H:%M:%S')}")


        socketio.emit('geofence_event', {
            'status': estado_panel, 
            'message': mensaje_panel, 
            'silent': True
        })

        data['lat'] = lat
        data['lng'] = lng
        data['alias'] = alias
        data['device_id'] = device_id
        socketio.emit('new_location', data)
        
        return jsonify({"status": "success"})

    except Exception as e:
        import traceback
        app.logger.error(f"Error crítico en update_location: {traceback.format_exc()}")
        return jsonify({"message": f"Error en Python: {str(e)}"}), 500

#---------ARTURO Y LILYGO POR SIEMPRE------------------------------------
@app.route("/api/update_lilygo_location", methods=['POST'])
def update_lilygo_location():
    try:
        data = get_json_body()
        lat = float(data["lat"])
        lng = float(data["lng"])
        
        
        device_id = normalize_text(data.get("device_id")) or "unknown"
        
        
        device_db = Device.query.filter_by(device_id=device_id).first()
        if not device_db:
            return jsonify({"message": f"El dispositivo {device_id} no está registrado en el sistema."}), 404
            
        alias = device_db.alias
        user_id = device_db.user_id
        map_id = data.get("map_id")  
        
        user_location = Point(lng, lat)
        
        
        if device_id not in DEVICE_ZONE_STATES:
            DEVICE_ZONE_STATES[device_id] = {}

        
        # Cargamos únicamente las zonas creadas por el usuario en este mapa
        zonas_a_revisar = get_dynamic_zone_polygons(user_id, map_id)

        estado_panel = 'SAFE'
        mensaje_panel = 'Monitoreo activo.'

        for zone in zonas_a_revisar:
            zone_name = zone["name"]
            is_inside = zone["polygon"].contains(user_location)
            was_inside = DEVICE_ZONE_STATES[device_id].get(zone_name, False)

            # Todas las zonas personalizadas generarán alerta de peligro (DANGER) por defecto
            nivel_alerta = 'DANGER'

            if is_inside:
                estado_panel = nivel_alerta
                mensaje_panel = f'Dentro de {zone_name}'

            
            if is_inside and not was_inside:
                DEVICE_ZONE_STATES[device_id][zone_name] = True
                msg = f'{alias} entró a {zone_name}.'
                socketio.emit('geofence_event', {'status': nivel_alerta, 'message': msg})
                app.logger.info(f"ENTRADA LILYGO: {msg}")
                enviar_alerta_telegram(f"<b>ALERTA DE ENTRADA</b>\n{msg}\nHora: {datetime.now().strftime('%H:%M:%S')}")
                
            
            elif not is_inside and was_inside:
                DEVICE_ZONE_STATES[device_id][zone_name] = False
                msg = f'{alias} salió de {zone_name}.'
                socketio.emit('geofence_event', {'status': 'INFO', 'message': msg})
                app.logger.info(f"SALIDA LILYGO: {msg}")
                enviar_alerta_telegram(f"<b>ALERTA DE SALIDA</b>\n{msg}\nHora: {datetime.now().strftime('%H:%M:%S')}")

        
        socketio.emit('geofence_event', {
            'status': estado_panel, 
            'message': mensaje_panel, 
            'silent': True
        })

        
        data_to_emit = {
            'lat': lat,
            'lng': lng,
            'alias': alias,
            'device_id': device_id
        }
        socketio.emit('new_location', data_to_emit)
        
        return jsonify({"status": "success", "message": "Datos de la LILYGO procesados correctamente."})

    except Exception as e:
        import traceback
        app.logger.error(f"Error crítico en update_lilygo_location: {traceback.format_exc()}")
        return jsonify({"message": f"Error en Python: {str(e)}"}), 500
    
# --- ARTURO AUTH ---
@app.route("/api/register", methods=['POST'])
def register():
    try:
        data = get_json_body()
    except ValueError as error:
        return json_response(str(error), 400)

    nombre = normalize_text(data.get("nombre"))
    paterno = normalize_text(data.get("paterno"))
    materno = normalize_text(data.get("materno"))
    telefono = normalize_text(data.get("telefono"))
    email = normalize_text(data.get("email")).lower()
    password = data.get("password") if isinstance(data.get("password"), str) else ""

    if not nombre or not paterno or not telefono or not email or not password:
        return json_response("Completa todos los campos obligatorios.", 400)

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return json_response("Ingresa un correo electrónico válido.", 400)

    if len(password) < 8:
        return json_response("La contraseña debe tener al menos 8 caracteres.", 400)

    if User.query.filter_by(email=email).first():
        return json_response("El correo ya está registrado.", 400)

    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(
        nombre=nombre,
        apellido_paterno=paterno,
        apellido_materno=materno,
        telefono=telefono,
        email=email,
        password=hashed
    )

    try:
        db.session.add(new_user)
        db.session.commit()
        return json_response("Usuario creado correctamente.", 200)
    except Exception:
        db.session.rollback()
        app.logger.exception("Error al registrar usuario.")
        return json_response("No se pudo completar el registro.", 500)

@app.route("/api/login", methods=['POST'])
def login():
    try:
        data = get_json_body()
    except ValueError as error:
        return json_response(str(error), 400)

    email = normalize_text(data.get("email")).lower()
    password = data.get("password") if isinstance(data.get("password"), str) else ""

    if not email or not password:
        return json_response("Ingresa tu correo y contraseña.", 400)

    user = User.query.filter_by(email=email).first()
    
    if user and bcrypt.check_password_hash(user.password, password):
        session.permanent = True
        session.modified = True 
        session['user_email'] = user.email
        session['user_name'] = build_user_display_name(user)
        app.logger.info("Sesión iniciada para %s", session['user_name'])
        return json_response("Inicio de sesión correcto.", 200, email=user.email)
    
    return json_response("Correo o contraseña incorrectos.", 401)


@app.route("/api/link_device", methods=['POST'])
def link_device():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        data = get_json_body()
    except ValueError as error:
        return json_response(str(error), 400)

    device_id = normalize_text(data.get("device_id"))
    alias = normalize_text(data.get("alias"))

    if not device_id or not alias:
        return json_response("Debes ingresar el ID único de la LILYGO y un Alias (ej. 'Vehículo 1').", 400)

    dispositivo_existente = Device.query.filter_by(device_id=device_id).first()
    if dispositivo_existente:
        return json_response("Este ID de dispositivo ya se encuentra registrado en el sistema.", 400)

    try:
        nuevo_dispositivo = Device(
            device_id=device_id,
            alias=alias,
            user_id=user.id
        )
        db.session.add(nuevo_dispositivo)
        db.session.commit()
        app.logger.info(f"Dispositivo '{alias}' ({device_id}) vinculado exitosamente al usuario ID {user.id}")
        
        return json_response("Dispositivo vinculado correctamente.", 200, device_id=device_id)

    except Exception:
        db.session.rollback()
        app.logger.exception("Error al vincular el dispositivo en la base de datos.")
        return json_response("No se pudo guardar el dispositivo por un error interno.", 500)

@app.route("/api/my_devices", methods=['GET'])
def my_devices():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    dispositivos = Device.query.filter_by(user_id=user.id).all()
    data = [{"device_id": d.device_id, "alias": d.alias, "color": d.color or "#43be83"} for d in dispositivos]
    
    return jsonify(data), 200

@app.route("/api/edit_device", methods=['POST'])
def edit_device():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        data = get_json_body()
        device_id = normalize_text(data.get("device_id"))
        new_alias = normalize_text(data.get("alias"))
        new_color = normalize_text(data.get("color"))

        device = Device.query.filter_by(device_id=device_id, user_id=user.id).first()
        if not device:
            return json_response("Dispositivo no encontrado.", 404)

        if new_alias:
            device.alias = new_alias
        if new_color:
            device.color = new_color

        db.session.commit()
        return json_response("Dispositivo actualizado correctamente.", 200)

    except Exception:
        db.session.rollback()
        return json_response("No se pudo actualizar el dispositivo.", 500)
    
# Ruta Registro
@app.route('/register-view')
def register_view():
    return render_template('register_page.html')

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('home'))


@app.route("/settings")
def settings():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return redirect(url_for("home"))

    return render_template(
        "settings.html",
        user=user,
        nombre_html=build_user_display_name(user),
        initials_html=build_user_initials(user),
        geofence_count=Geocerca.query.filter_by(id_usuario=user.id).count(),
        map_count=Mapa.query.filter_by(id_usuario=user.id).count(),
        device_count=Device.query.filter_by(user_id=user.id).count(),
    )

# ----- GUARDAR GEOCERCAS -----------
@app.route("/api/add_zone", methods=['POST'])
def add_zone():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        data = get_json_body()
        nombre = normalize_text(data.get("name"))
        puntos = normalize_zone_points(data.get("points"))
        map_id = data.get("map_id")
    except ValueError as error:
        return json_response(str(error), 400)

    if not nombre:
        return json_response("Debes ingresar un nombre para la geocerca.", 400)

    id_mapa_recibido = None
    if map_id not in (None, "", 0, "0"):
        try:
            id_mapa_recibido = int(map_id)
        except (TypeError, ValueError):
            return json_response("El identificador del mapa no es válido.", 400)

        mapa = Mapa.query.filter_by(id_mapa=id_mapa_recibido, id_usuario=user.id).first()
        if not mapa:
            return json_response("El mapa seleccionado no existe.", 404)

    try:
        nueva_zona = Geocerca(
            id_usuario=user.id,
            id_mapa=id_mapa_recibido,
            nombre_zona=nombre,
            coordenadas_json=json.dumps(puntos)
        )

        db.session.add(nueva_zona)
        db.session.commit()
        app.logger.info("Geocerca guardada: %s", nombre)
        return json_response("Geocerca guardada correctamente.", 200, zone_id=nueva_zona.id_geocerca)

    except Exception:
        db.session.rollback()
        app.logger.exception("Error al guardar geocerca.")
        return json_response("No se pudo guardar la geocerca.", 500)

# RUTA AL PERFIL 
@app.route("/profile")
def profile():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return redirect(url_for('home'))

    if user:
        mis_zonas = Geocerca.query.filter_by(id_usuario=user.id).all()
        mis_mapas = Mapa.query.filter_by(id_usuario=user.id).all() 
        mis_dispositivos = Device.query.filter_by(user_id=user.id).all()
    else:
        mis_zonas = []
        mis_mapas = []
        mis_dispositivos = []

    return render_template('profile.html', 
                           email_html=user.email, 
                           nombre_html=build_user_display_name(user),
                           geocercas=mis_zonas,
                           mapas=mis_mapas,
                           dispositivos=mis_dispositivos)


@app.route("/api/profile", methods=["POST"])
def update_profile():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        data = get_json_body()
    except ValueError as error:
        return json_response(str(error), 400)

    nombre = normalize_text(data.get("nombre"))
    apellido_paterno = normalize_text(data.get("apellido_paterno"))
    apellido_materno = normalize_text(data.get("apellido_materno"))
    telefono = normalize_text(data.get("telefono"))

    if not nombre or not apellido_paterno or not telefono:
        return json_response("Nombre, apellido paterno y teléfono son obligatorios.", 400)

    if len(nombre) > 100 or len(apellido_paterno) > 100 or len(apellido_materno) > 100:
        return json_response("Alguno de los campos de nombre es demasiado largo.", 400)

    if len(telefono) > 20:
        return json_response("El teléfono no puede exceder 20 caracteres.", 400)

    user.nombre = nombre
    user.apellido_paterno = apellido_paterno
    user.apellido_materno = apellido_materno
    user.telefono = telefono
    session["user_name"] = build_user_display_name(user)

    try:
        db.session.commit()
        return json_response(
            "Perfil actualizado correctamente.",
            200,
            profile={
                "nombre": user.nombre,
                "apellido_paterno": user.apellido_paterno,
                "apellido_materno": user.apellido_materno or "",
                "telefono": user.telefono,
                "email": user.email,
                "display_name": build_user_display_name(user),
                "initials": build_user_initials(user),
            },
        )
    except Exception:
        db.session.rollback()
        app.logger.exception("Error al actualizar perfil.")
        return json_response("No se pudo actualizar el perfil.", 500)


@app.route("/api/delete_zone/<int:id_zona>", methods=['POST'])
def delete_zone(id_zona):
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        zona = Geocerca.query.filter_by(id_geocerca=id_zona, id_usuario=user.id).first()
        
        if not zona:
            return json_response("La geocerca no existe o ya fue eliminada.", 404)

        db.session.delete(zona)
        db.session.commit()
        app.logger.info("Geocerca eliminada: %s", id_zona)
        return json_response("Geocerca eliminada correctamente.", 200)

    except Exception:
        db.session.rollback()
        app.logger.exception("Error al eliminar geocerca.")
        return json_response("No se pudo eliminar la geocerca.", 500)


@app.route("/api/delete_map/<int:id_mapa>", methods=['POST'])
def delete_map(id_mapa):
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        mapa = Mapa.query.filter_by(id_mapa=id_mapa, id_usuario=user.id).first()
        if not mapa:
            return json_response("El mapa no existe o ya fue eliminado.", 404)

        for zona in mapa.geocercas:
            zona.id_mapa = None

        db.session.delete(mapa)
        db.session.commit()
        app.logger.info("Mapa eliminado: %s", id_mapa)
        return json_response("Mapa eliminado correctamente.", 200)
    except Exception:
        db.session.rollback()
        app.logger.exception("Error al eliminar mapa.")
        return json_response("No se pudo eliminar el mapa.", 500)
    
@app.route("/api/delete_device/<int:id_device>", methods=['POST'])
def delete_device(id_device):
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        # Buscamos el dispositivo asegurando que pertenece a quien inició sesión
        dispositivo = Device.query.filter_by(id=id_device, user_id=user.id).first()
        
        if not dispositivo:
            return json_response("El dispositivo no existe o ya fue desvinculado.", 404)

        db.session.delete(dispositivo)
        db.session.commit()
        app.logger.info("Dispositivo eliminado: %s", id_device)
        return json_response("Dispositivo desvinculado correctamente.", 200)

    except Exception:
        db.session.rollback()
        app.logger.exception("Error al eliminar dispositivo.")
        return json_response("No se pudo desvincular el dispositivo.", 500)
    
# ----- RUTAS DE MAPAS (ARTURO) -----------
@app.route("/api/get_next_map_name", methods=['GET'])
def get_next_map_name():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    cantidad_mapas = Mapa.query.filter_by(id_usuario=user.id).count()
    siguiente_nombre = f"Mapa {cantidad_mapas + 1}"
    
    return jsonify({"nextName": siguiente_nombre}), 200


@app.route("/api/save_map", methods=['POST'])
def save_map():
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    try:
        data = get_json_body()
    except ValueError as error:
        return json_response(str(error), 400)

    map_id = data.get('map_id')
    name = normalize_text(data.get('name'))

    if not name:
        return json_response("El mapa debe tener un nombre.", 400)

    try:
        if not map_id:
            nuevo_mapa = Mapa(id_usuario=user.id, nombre_mapa=name)
            db.session.add(nuevo_mapa)
            db.session.flush()
            map_id = nuevo_mapa.id_mapa
        else:
            mapa_existente = Mapa.query.filter_by(id_mapa=map_id, id_usuario=user.id).first()
            if not mapa_existente:
                return json_response("El mapa que intentas actualizar no existe.", 404)
            mapa_existente.nombre_mapa = name

        zonas_sueltas = Geocerca.query.filter_by(id_usuario=user.id, id_mapa=None).all()
        for zona in zonas_sueltas:
            zona.id_mapa = map_id

        db.session.commit()
        return json_response("Mapa guardado correctamente.", 200, new_map_id=map_id)

    except Exception:
        db.session.rollback()
        app.logger.exception("Error al guardar mapa.")
        return json_response("No se pudo guardar el mapa.", 500)
    
@app.route("/api/get_map_zones/<int:id_mapa>", methods=['GET'])
def get_map_zones(id_mapa):
    user, auth_error = get_authenticated_user()
    if auth_error:
        return auth_error

    mapa = Mapa.query.filter_by(id_mapa=id_mapa, id_usuario=user.id).first()
    
    if not mapa:
        return json_response("Mapa no encontrado.", 404)
    
    zonas_data = []
    # Sacamos todas las geocercas que pertenecen a este mapa
    for zona in mapa.geocercas:
        zonas_data.append({
            "nombre": zona.nombre_zona,
            "puntos": json.loads(zona.coordenadas_json)
        })
    
    return jsonify({
        "nombre_mapa": mapa.nombre_mapa,
        "zonas": zonas_data
    }), 200

# --- CONFIGURACIÓN DE TELEGRAM ---
TELEGRAM_BOT_TOKEN = '1'
TELEGRAM_CHAT_ID = '2'

def enviar_alerta_telegram(mensaje):
    """Envía un mensaje de texto a través del bot de Telegram"""
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": mensaje,
            "parse_mode": "HTML" 
        }
        response = requests.post(url, json=payload, timeout=5)
        
        if response.status_code == 200:
            app.logger.info("Notificación de Telegram enviada con éxito.")
        else:
            app.logger.warning(f"Error al enviar Telegram: {response.text}")
    except Exception as e:
        app.logger.error(f"Falla de conexión con la API de Telegram: {str(e)}")

# --- ESTO SIEMPRE DEBE IR HASTA EL FINAL DEL ARCHIVO ---
if __name__ == "__main__":
    if os.getenv("AUTO_CREATE_TABLES") == "1":
        with app.app_context():
            db.create_all()
    port = int(os.getenv("PORT", "5000"))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)

    
