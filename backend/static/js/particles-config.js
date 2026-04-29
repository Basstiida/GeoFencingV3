particlesJS("particles-js", {
  "particles": {
    "number": { "value": 100 }, // Cantidad de puntos
    "color": { "value": "#ffffff" }, // Color de los puntos
    "shape": { "type": "circle" },
    "opacity": { "value": 0.5 },
    "size": { "value": 3 },
    "line_linked": {
      "enable": true, // Dibuja las líneas entre puntos
      "distance": 150,
      "color": "#ffffff",
      "opacity": 0.4,
      "width": 1
    },
    "move": {
      "enable": true,
      "speed": 2 // Velocidad constante
    }
  },
  "interactivity": {
    "detect_on": "window", // Cambia 'canvas' por 'window'
    "events": {
      "onhover": {
        "enable": true,
        "mode": "grab" 
      }
    },
    "modes": {
      "grab": {
        "distance": 200, // Qué tan lejos llega el brazo del cursor
        "line_linked": {
          "opacity": 1
        }
      }
    }
  },
  "retina_detect": true
});