// socket.io initialization
const socket = io();

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const gameScreen = document.getElementById('gameScreen');
const joinBtn = document.getElementById('joinBtn');
const usernameInput = document.getElementById('username');
const gameCanvas = document.getElementById('gameCanvas');
const statusDiv = document.getElementById('status');
const ctx = gameCanvas.getContext('2d');

// Game elements
let players = {};
let seats = [];
let walls = [];
let myId = null;
let gameStarted = false;

// Movement state
const keysPressed = {
    left: false,
    right: false,
    up: false,
    down: false
};

// Movement speed (in pixels per second)
const SPEED = 300; // Increased speed

// Time tracking for movement updates
let lastUpdateTime = Date.now();

// Image assets
const images = {
    floor: new Image(),
    wall: new Image(),
    seat: new Image(),
    defaultAvatar: new Image(),
};

// Load Floor Texture
images.floor.src = '/images/floor/floor.png'; // Replace with your floor texture path

// Load Wall Texture
images.wall.src = '/images/walls/wall.png'; // Replace with your wall texture path

// Load Seat Icon
images.seat.src = '/images/seats/seat.png'; // Replace with your seat icon path

// Load Default Avatar
images.defaultAvatar.src = '/images/avatars/default.png'; // Replace with your default avatar path

// Handle image loading
images.floor.onload = () => {
    draw();
};

images.wall.onload = () => {
    draw();
};

images.seat.onload = () => {
    draw();
};


images.defaultAvatar.onload = () => {
    draw();
};

images.floor.onerror = () => {
    console.error('Failed to load floor texture.');
};

images.wall.onerror = () => {
    console.error('Failed to load wall texture.');
};

images.seat.onerror = () => {
    console.error('Failed to load seat icon.');
};

images.defaultAvatar.onerror = () => {
    console.error('Failed to load default avatar.');
};

// Handle joining the game
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username === '') {
        alert('Please enter a username.');
        return;
    }
    socket.emit('playerJoined', username);
    loginScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

// Listen for game start
socket.on('gameStarted', (data) => {
    seats = data.seats;
    walls = data.walls;
    players = data.players;
    gameStarted = true;
    statusDiv.innerText = 'Game Started! Find a seat!';
    draw();
    startGameLoop();
});

// Update players
socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
    if (!myId) {
        myId = socket.id;
    }
    draw();
});

// Player reached a seat
socket.on('playerReachedSeat', (data) => {
    const { playerId, seatId } = data;
    if (playerId === myId) {
        statusDiv.innerText = 'You have reached a seat!';
    } else {
        statusDiv.innerText = `${players[playerId].username} has reached a seat!`;
    }
    draw();
});

// Game Over
socket.on('gameOver', (data) => {
    if (data.winners) {
        const winners = data.winners;
        if (winners.find(w => w.id === myId)) {
            alert('You win!');
        } else {
            alert(`${winners.map(w => w.username).join(', ')} won the game!`);
        }
    } else if (data.message) {
        alert(data.message);
    }
    // Reset or redirect as needed
    resetGame();
});

// Handle disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server.');
    alert('You have been disconnected.');
    resetGame();
});

// Handle reset game
socket.on('resetGame', () => {
    resetGame();
});

// Function to load player avatars (using default avatar for all)
function loadDefaultAvatar() {
    if (images.defaultAvatar.complete) {
        // Avatar is loaded
        draw();
    } else {
        // Wait until avatar is loaded
        images.defaultAvatar.onload = () => {
            draw();
        };
    }
}

// Handle key presses for movement
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case 'ArrowLeft':
        case 'a':
            keysPressed.left = true;
            break;
        case 'ArrowRight':
        case 'd':
            keysPressed.right = true;
            break;
        case 'ArrowUp':
        case 'w':
            keysPressed.up = true;
            break;
        case 'ArrowDown':
        case 's':
            keysPressed.down = true;
            break;
        default:
            break;
    }
});

document.addEventListener('keyup', (e) => {
    switch(e.key) {
        case 'ArrowLeft':
        case 'a':
            keysPressed.left = false;
            break;
        case 'ArrowRight':
        case 'd':
            keysPressed.right = false;
            break;
        case 'ArrowUp':
        case 'w':
            keysPressed.up = false;
            break;
        case 'ArrowDown':
        case 's':
            keysPressed.down = false;
            break;
        default:
            break;
    }
});

// Function to check collision with walls (client-side)
function isPlayerColliding(newX, newY) {
    for (let wall of walls) {
        if (
            newX + 15 > wall.x && // Player's right edge
            newX - 15 < wall.x + wall.width && // Player's left edge
            newY + 15 > wall.y && // Player's bottom edge
            newY - 15 < wall.y + wall.height // Player's top edge
        ) {
            return true;
        }
    }
    return false;
}

// Start the game loop
function startGameLoop() {
    function gameLoop() {
        if (gameStarted && myId) {
            const currentTime = Date.now();
            const deltaTime = (currentTime - lastUpdateTime) / 1000; // In seconds

            // Calculate movement distance
            let moveX = 0;
            let moveY = 0;

            if (keysPressed.left) moveX -= SPEED * deltaTime;
            if (keysPressed.right) moveX += SPEED * deltaTime;
            if (keysPressed.up) moveY -= SPEED * deltaTime;
            if (keysPressed.down) moveY += SPEED * deltaTime;

            // Normalize diagonal movement
            if ((keysPressed.left || keysPressed.right) && (keysPressed.up || keysPressed.down)) {
                moveX *= Math.SQRT1_2;
                moveY *= Math.SQRT1_2;
            }

            if (moveX !== 0 || moveY !== 0) {
                const newX = players[myId] ? players[myId].x + moveX : moveX;
                const newY = players[myId] ? players[myId].y + moveY : moveY;

                // Client-side collision detection
                if (!isPlayerColliding(newX, newY)) {
                    // Send movement to the server
                    socket.emit('continuousMove', { moveX, moveY });
                }
            }

            lastUpdateTime = currentTime;
        }

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

// Draw the game state
function draw() {
    // Clear the canvas
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Draw floor
    if (images.floor.complete) {
        ctx.drawImage(images.floor, 0, 0, gameCanvas.width, gameCanvas.height);
    } else {
        // If floor image is not loaded yet, fill with a default color
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    }

    // Draw walls
    walls.forEach(wall => {
        if (images.wall.complete) {
            // Tile the wall texture to fill the wall area
            const cols = Math.ceil(wall.width / images.wall.width);
            const rows = Math.ceil(wall.height / images.wall.height);
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    ctx.drawImage(images.wall, wall.x + i * images.wall.width, wall.y + j * images.wall.height);
                }
            }
        } else {
            // If wall image is not loaded yet, fill with a default color
            ctx.fillStyle = '#8B4513'; // Brown color for walls
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        }
    });

    // Draw seats
    seats.forEach(seat => {
        if (!seat.taken) {
            if (images.seat.complete) {
                ctx.drawImage(images.seat, seat.x - 15, seat.y - 15, 30, 30);
            } else {
                // If seat image is not loaded yet, draw a default shape
                ctx.fillStyle = 'blue';
                ctx.fillRect(seat.x - 15, seat.y - 15, 30, 30);
            }
        }
    });

    // Draw players
    for (let id in players) {
        const player = players[id];
        if (id === myId) {
            // Optional: Highlight the current player
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 17, 0, 2 * Math.PI);
            ctx.stroke();
        }

        if (images.defaultAvatar.complete) {
            ctx.drawImage(images.defaultAvatar, player.x - 15, player.y - 15, 30, 30);
        } else {
            // If avatar image is not loaded yet, draw a default circle
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(player.x, player.y, 15, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Draw username
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, player.x, player.y - 20);
    }
}

// Reset the game state
function resetGame() {
    gameStarted = false;
    players = {};
    seats = [];
    walls = [];
    myId = null;
    statusDiv.innerText = '';
    gameCanvas.style.display = 'none';
    loginScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    gameCanvas.style.display = 'block';
}
