import re
import requests
from telethon import TelegramClient, events

# ========================================================
# CONFIGURACIÓN DE CREDENCIALES (Coloca tus datos aquí)
# ========================================================
API_ID = 00000       # Tu api_id numérico (sin comillas)
API_HASH = 'nada'  # Tu api_hash (debe ir entre comillas)

# ID del chat o grupo de Telegram donde llegan los datos del LILYGO
# Puede ser tu chat_id personal ('6095639548') o el del grupo (ej: '-5120428139')
CHAT_A_ESCUCHAR = 0000000

# Ruta local de tu Flask (usamos localhost porque corre en tu misma PC)
URL_FLASK = "http://127.0.0.1:5000/api/update_lilygo_location"

# Inicializamos el cliente de Telegram
client = TelegramClient('sesion_puente', API_ID, API_HASH)

# ========================================================
# CONFIGURACIÓN DEL DISPOSITIVO
# ========================================================
# Define aquí el ID único que tendrá tu LILYGO. 
# Este mismo texto exacto es el que registrarás en la página web.
DEVICE_ID_VINCULADO = "LILY-001" 

@client.on(events.NewMessage(chats=CHAT_A_ESCUCHAR))
async def procesar_mensaje(event):
    texto = event.raw_text
    print(f"\n[Telegram] Mensaje recibido: {repr(texto)}")
    
    # Expresión regular para buscar coordenadas en el mensaje de la placa
    patron = r"LAT:([-0-9.]+)\s+LNG:([-0-9.]+)"
    match = re.search(patron, texto)
    
    if match:
        lat = float(match.group(1))
        lng = float(match.group(2))
        
        # --- MODIFICACIÓN: Agregamos el device_id requerido por el backend ---
        payload = {
            "lat": lat,
            "lng": lng,
            "device_id": DEVICE_ID_VINCULADO
        }
        
        print(f"[Puente] Coordenadas detectadas -> Lat: {lat}, Lng: {lng}")
        print(f"[Puente] Asociando ID '{DEVICE_ID_VINCULADO}' y reenviando localmente...")
        
        try:
            # Enviamos el POST al endpoint exclusivo de la LILYGO
            respuesta = requests.post(URL_FLASK, json=payload)
            
            if respuesta.status_code == 200:
                print("🟢 [Éxito] Coordenadas inyectadas en el Monitor Web.")
            else:
                print(f"🔴 [Error] Flask respondió con código: {respuesta.status_code}")
                print(f"Detalle del servidor: {respuesta.text}")
                
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