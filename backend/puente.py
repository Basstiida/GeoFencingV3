import re
import requests
from telethon import TelegramClient, events

# ========================================================
# CONFIGURACIÓN DE CREDENCIALES (Coloca tus datos aquí)
# ========================================================
API_ID = 33973670        # Tu api_id numérico (sin comillas)
API_HASH = '06d29909bc512d266a062151ca535c50'  # Tu api_hash (debe ir entre comillas)

# ID del chat o grupo de Telegram donde llegan los datos del LILYGO
# Puede ser tu chat_id personal ('6095639548') o el del grupo (ej: '-5120428139')
CHAT_A_ESCUCHAR = 8675845733

# Ruta local de tu Flask (usamos localhost porque corre en tu misma PC)
URL_FLASK = "http://127.0.0.1:5000/api/update_location"

# Inicializamos el cliente de Telegram
client = TelegramClient('sesion_puente', API_ID, API_HASH)

@client.on(events.NewMessage(chats=CHAT_A_ESCUCHAR))
async def procesar_mensaje(event):
    texto = event.raw_text
    print(f"\n[Telegram] Mensaje recibido: {repr(texto)}")
    
    # Expresión regular idéntica a la que tienes en tu Flask para buscar coordenadas
    patron = r"LAT:([-0-9.]+)\s+LNG:([-0-9.]+)"
    match = re.search(patron, texto)
    
    if match:
        lat = float(match.group(1))
        lng = float(match.group(2))
        
        # Estructuramos el JSON tal como lo espera tu función update_location()
        payload = {
            "lat": lat,
            "lng": lng
        }
        
        print(f"[Puente] Coordenadas detectadas -> Lat: {lat}, Lng: {lng}")
        print(f"[Puente] Reenviando datos localmente a Flask...")
        
        try:
            # Enviamos el POST al endpoint /api/update_location de tu Flask
            respuesta = requests.post(URL_FLASK, json=payload)
            
            if respuesta.status_code == 200:
                print("🟢 [Éxito] Coordenadas inyectadas en el Monitor Web.")
            else:
                print(f"🔴 [Error] Flask respondió con código: {respuesta.status_code}")
                
        except Exception as e:
            print(f"🔴 [Error] No se pudo conectar con el servidor Flask: {e}")
    else:
        print("[Puente] El mensaje no contiene el formato de coordenadas esperado.")

# Arrancar el cliente
print("========================================================")
print("Iniciando el puente de datos de Telegram...")
print("========================================================")
client.start()
client.run_until_disconnected()