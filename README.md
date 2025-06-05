# Backend Batalla Naval

Este es el backend para el juego Batalla Naval, un clásico de estrategia donde dos o más jugadores colocan barcos en un tablero y tratan de hundir los barcos del oponente adivinando sus posiciones. Este backend está diseñado para funcionar con el frontend de Batalla Naval 

## Objetivo del Juego

Coloca tus barcos estratégicamente en el tablero y ataca las posiciones del oponente. Gana el jugador o equipo que logre hundir todos los barcos enemigos antes que el rival.

## Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/jgarcia691/Backend_BatallaNaval
   cd Backend_BatallaNaval
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```

## Ejecución

Inicia el servidor backend con:

```bash
npm start
```

El servidor se ejecutará usando Express y Socket.io en el puerto configurado (por defecto 3000).

## Uso con el Frontend

Para jugar en local, asegúrate de tener este backend corriendo y luego sigue las instrucciones del repositorio del frontend:

- [Repositorio Frontend Batalla Naval](https://github.com/Jennorg/batalla-naval)


## Endpoints y Websockets

Toda la comunicación del juego se realiza mediante eventos de Socket.io. El backend gestiona la lógica de emparejamiento, turnos, ataques y sincronización de estado entre los jugadores.

