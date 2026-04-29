import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

// ⚠️ ¡IMPORTANTE! REVISA QUE ESTA URL SEA LA QUE TE DIO NGROK HOY ⚠️
const String NGROK_URL = "tectricial-leon-unhurryingly.ngrok-free.dev";

// Helpers de protocolo
String getHttpProtocol() => NGROK_URL.contains('ngrok') ? 'https' : 'http';
String getWsProtocol() => NGROK_URL.contains('ngrok') ? 'wss' : 'ws';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Geo Tracker App',
      home: MapScreen(),
    );
  }
}

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  LatLng? _currentPosition;
  final MapController _mapController = MapController();
  LatLng? _otherUserPosition;
  late IO.Socket socket;
  bool _isConnected = false;
  Position? _initialPositionToSend;

  // --- VARIABLES NUEVAS PARA EL RASTREO ---
  StreamSubscription<Position>? _positionStreamSubscription;
  bool _isTracking = false;

  void _fitMapToBounds() {
    if (_currentPosition == null || _otherUserPosition == null) return;
    final bounds = LatLngBounds(_currentPosition!, _otherUserPosition!);
    _mapController.fitCamera(
      CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(50.0)),
    );
  }

  void _connectToSocket() {
    socket = IO.io('${getWsProtocol()}://$NGROK_URL', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
      'extraHeaders': {'ngrok-skip-browser-warning': 'true'},
    });

    socket.onConnect((_) {
      print('¡Conectado al servidor de WebSockets!');
      setState(() {
        _isConnected = true;
      });
      if (_initialPositionToSend != null) {
        print("Enviando ubicación inicial pendiente...");
        _sendLocationToServer(_initialPositionToSend!);
        _initialPositionToSend = null;
      }
    });

    socket.on('new_location', (data) {
      print('Nueva ubicación recibida por WebSocket: $data');
      setState(() {
        _otherUserPosition = LatLng(data['lat'], data['lng']);
      });
    });

    socket.onDisconnect((_) {
      print('Desconectado del servidor');
      setState(() {
        _isConnected = false;
      });
    });
  }

  // --- FUNCIÓN NUEVA: ENVÍO CONTINUO ---
  void _toggleTracking() async {
    if (_isTracking) {
      // APAGAR RASTREO
      await _positionStreamSubscription?.cancel();
      _positionStreamSubscription = null;
      setState(() {
        _isTracking = false;
      });
      print("🛑 Rastreo detenido.");
    } else {
      // ENCENDER RASTREO
      // Verificar permisos primero
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        print("❌ No hay permisos de GPS para rastrear.");
        return;
      }

      setState(() {
        _isTracking = true;
      });
      print("🚀 Iniciando rastreo continuo...");

      // Configuración: Solo avisa si te mueves 5 metros
      const LocationSettings locationSettings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      );

      _positionStreamSubscription =
          Geolocator.getPositionStream(
            locationSettings: locationSettings,
          ).listen((Position position) {
            // ESTO SE EJECUTA CADA VEZ QUE CAMINAS
            print(
              "📍 Movimiento detectado: ${position.latitude}, ${position.longitude}",
            );

            // 1. Actualizamos el mapa local
            setState(() {
              _currentPosition = LatLng(position.latitude, position.longitude);
            });
            _mapController.move(
              _currentPosition!,
              15,
            ); // Mover cámara con el usuario

            // 2. Enviamos al servidor
            _sendLocationToServer(position);
          });
    }
  }

  Future<void> _sendLocationToServer(Position position) async {
    // Si no hay conexión socket, no enviamos peticiones HTTP para no saturar
    // (Opcional: puedes quitar este if si quieres enviar siempre)
    if (!_isConnected) {
      print("⚠️ Sin conexión socket, esperando...");
      return;
    }

    final url = Uri.parse(
      '${getHttpProtocol()}://$NGROK_URL/api/update_location',
    );
    try {
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'ngrok-skip-browser-warning': 'true',
        },
        body: jsonEncode({
          'lat': position.latitude,
          'lng': position.longitude,
          'user_id': 'flutter_app_1', // Puedes cambiar esto por 'iphone_basti'
        }),
      );
      if (response.statusCode == 200) {
        print('✅ Ubicación enviada al servidor.');
      } else {
        print('❌ Error servidor: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Error de conexión HTTP: $e');
    }
  }

  void _getInitialLocation() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    try {
      Position position = await Geolocator.getCurrentPosition();
      setState(() {
        _currentPosition = LatLng(position.latitude, position.longitude);
      });
      // Solo enviamos una vez al inicio para que aparezca el punto
      _sendLocationToServer(position);
    } catch (e) {
      print("Error obteniendo la ubicación: $e");
    }
  }

  @override
  void initState() {
    super.initState();
    _connectToSocket();
    _getInitialLocation();
  }

  @override
  void dispose() {
    // IMPORTANTE: Cancelar el rastreo al cerrar la app
    _positionStreamSubscription?.cancel();
    socket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rastreo en Vivo'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 20.0),
            child: Icon(
              Icons.circle,
              color: _isConnected ? Colors.green : Colors.red,
            ),
          ),
        ],
      ),
      // --- BOTÓN FLOTANTE NUEVO ---
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _toggleTracking,
        backgroundColor: _isTracking ? Colors.red : Colors.green,
        icon: Icon(_isTracking ? Icons.stop : Icons.play_arrow),
        label: Text(_isTracking ? "DETENER" : "RASTREAR"),
      ),
      body: _currentPosition == null
          ? const Center(child: CircularProgressIndicator())
          : FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: _currentPosition!,
                initialZoom: 15.0,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.mibastida.geotracker',
                ),
                MarkerLayer(
                  markers: [
                    if (_currentPosition != null)
                      Marker(
                        point: _currentPosition!,
                        width: 80,
                        height: 80,
                        child: const Icon(
                          Icons.my_location,
                          color: Colors.blue,
                          size: 40,
                        ),
                      ),
                    // Marcador del "otro usuario" (o tu propio eco si el servidor te rebota la info)
                    if (_otherUserPosition != null)
                      Marker(
                        point: _otherUserPosition!,
                        width: 80,
                        height: 80,
                        child: const Icon(
                          Icons.location_pin,
                          color: Colors.red, // Lo puse rojo para diferenciarlo
                          size: 60,
                        ),
                      ),
                  ],
                ),
              ],
            ),
    );
  }
}
