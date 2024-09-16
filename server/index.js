// server/index.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Game state
let players = {};
let seats = [];
let walls = [];
let gameStarted = false;

// Map dimensions
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1200;

// Utility function to generate random seats avoiding walls
function generateSeats(numberOfSeats, mapWidth, mapHeight, walls) {
    const seats = [];
    let attempts = 0;
    while (seats.length < numberOfSeats && attempts < numberOfSeats * 10) {
        const seat = {
            id: seats.length,
            x: Math.floor(Math.random() * (mapWidth - 30)) + 15,
            y: Math.floor(Math.random() * (mapHeight - 30)) + 15,
            taken: false
        };
        // Check if seat is inside a wall
        const inWall = walls.some(wall => isPointInRect(seat.x, seat.y, wall));
        if (!inWall) {
            seats.push(seat);
        }
        attempts++;
    }
    return seats;
}

// Utility function to check if a point is inside a rectangle
function isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width &&
        y >= rect.y && y <= rect.y + rect.height;
}

// Define walls (example layout)
function defineWalls() {
    walls = [
        // Outer boundaries
        { x: 0, y: 0, width: MAP_WIDTH, height: 20 }, // Top wall
        { x: 0, y: MAP_HEIGHT - 20, width: MAP_WIDTH, height: 20 }, // Bottom wall
        { x: 0, y: 0, width: 20, height: MAP_HEIGHT }, // Left wall
        { x: MAP_WIDTH - 20, y: 0, width: 20, height: MAP_HEIGHT }, // Right wall

        // Inner walls (example office layout)
        // You can add more walls here as needed to create the map
        { x: 200, y: 100, width: 20, height: 400 }, // Vertical corridor
        { x: 400, y: 600, width: 800, height: 20 }, // Horizontal corridor
        { x: 1000, y: 200, width: 20, height: 800 }, // Vertical corridor
    ];
}

// Collision detection between player and walls
function isColliding(x, y, walls) {
    for (let wall of walls) {
        if (
            x + 15 > wall.x && // Player's right edge
            x - 15 < wall.x + wall.width && // Player's left edge
            y + 15 > wall.y && // Player's bottom edge
            y - 15 < wall.y + wall.height // Player's top edge
        ) {
            return true;
        }
    }
    return false;
}

// Handle connection
io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Handle player login
    socket.on('playerJoined', (username) => {
        players[socket.id] = {
            id: socket.id,
            username: username || `Player${Object.keys(players).length + 1}`,
            x: 50, // Starting x position
            y: 50, // Starting y position
            score: 0, // Maybe to implement a score here TODO
            hasSeat: false // boolean for if player has a seat or no.
        };
        io.emit('updatePlayers', getPlayersForGame());
        checkStartGame();
    });

    // Handle movement
    socket.on('continuousMove', (data) => {
        if (!gameStarted) return; // Prevent movement before game starts

        const player = players[socket.id];
        if (player && !player.hasSeat) {
            const { moveX, moveY } = data;
            const newX = player.x + moveX;
            const newY = player.y + moveY;

            // Boundary checks

            // Prevent moving out of bounds
            if (newX - 15 < 0 || newX + 15 > MAP_WIDTH ||
                newY - 15 < 0 || newY + 15 > MAP_HEIGHT) {
                return;
            }

            // Collision detection with walls
            if (!isColliding(newX, newY, walls)) {
                player.x = newX;
                player.y = newY;

                // Check seat collision
                checkSeatCollision(player);

                // Broadcast updated player positions
                io.emit('updatePlayers', getPlayersForGame());
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('updatePlayers', getPlayersForGame());

        if (gameStarted && Object.keys(players).length < 2) {
            // Not enough players to continue the game
            io.emit('gameOver', { message: 'Not enough players. Game has been reset.' });
            resetGame();
        }
    });
});

// Get players data for Game (including positions)
function getPlayersForGame() {
    const gamePlayers = {};
    for (let id in players) {
        gamePlayers[id] = {
            id: players[id].id,
            username: players[id].username,
            x: players[id].x,
            y: players[id].y,
            hasSeat: players[id].hasSeat
        };
    }
    return gamePlayers;
}

// Check if enough players to start the game
function checkStartGame() {
    if (!gameStarted && Object.keys(players).length >= 2) {
        startGame();
    }
}

// Start the game by generating seats and notifying players
function startGame() {
    gameStarted = true;
    // Define walls
    defineWalls();
    // Calculate number of seats: players -1
    const numberOfPlayers = Object.keys(players).length;
    const numberOfSeats = numberOfPlayers - 1;
    // Generate seats avoiding walls
    seats = generateSeats(numberOfSeats, MAP_WIDTH, MAP_HEIGHT, walls);
    io.emit('gameStarted', { seats: seats, walls: walls, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, players: getPlayersForGame() });
}

// Check if a player has reached a seat
function checkSeatCollision(player) {
    for (let seat of seats) {
        if (!seat.taken) {
            const distance = Math.hypot(player.x - seat.x, player.y - seat.y);
            if (distance < 20) { // Collision threshold
                seat.taken = true;
                player.hasSeat = true;
                player.score += 1;
                io.emit('playerReachedSeat', { playerId: player.id, seatId: seat.id });
                checkGameOver();
                break;
            }
        }
    }
}

// Check if the game is over (all seats taken)
function checkGameOver() {
    const takenSeats = seats.filter(seat => seat.taken).length;
    const requiredSeats = seats.length; // Since seats = players -1

    if (takenSeats >= requiredSeats) {
        // Collect winners
        const winners = Object.values(players).filter(player => player.hasSeat);
        io.emit('gameOver', { winners: winners });
        resetGame();
    }
}

// Reset the game state
function resetGame() {
    gameStarted = false;
    players = {};
    seats = [];
    walls = [];
    io.emit('updatePlayers', getPlayersForGame()); // Notify clients to clear player data
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
