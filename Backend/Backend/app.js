const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Allow local HTML files to communicate with the server
const io = new Server(server, {
    cors: { origin: '*' }
});

// Memory storage for active games
const rooms = {};

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log(`[CONNECTED] ${socket.id}`);

    // 1. Host creates a room AND joins as Player 1
    socket.on('create_room', ({ hostName }) => {
        const roomCode = generateCode();
        const name = hostName.trim() || 'Host';

        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: name }]
        };

        socket.join(roomCode);

        // Send the code to the host screen and update their player list
        socket.emit('room_created', { roomCode });
        io.to(roomCode).emit('player_list_updated', rooms[roomCode].players);
        console.log(`[ROOM CREATED] ${name} opened room ${roomCode}`);
    });

    // 2. Mobile players join the room
    socket.on('join_room', ({ roomCode, playerName }) => {
        const code = roomCode.toUpperCase();
        if (rooms[code]) {
            socket.join(code);
            rooms[code].players.push({ id: socket.id, name: playerName });

            socket.emit('joined_successfully', { roomCode: code });
            io.to(code).emit('player_list_updated', rooms[code].players);
            console.log(`[JOINED] ${playerName} joined ${code}`);
        } else {
            socket.emit('error_message', 'Room code not found.');
        }
    });

    // 3. Handle live chat messages
    socket.on('send_chat', ({ roomCode, message, senderName }) => {
        const code = roomCode.toUpperCase();
        // Broadcast the message to everyone in the room (including the sender)
        io.to(code).emit('receive_chat', {
            sender: senderName,
            text: message
        });
    });

    // 4. Handle player disconnects
    socket.on('disconnect', () => {
        console.log(`[DISCONNECTED] ${socket.id}`);

        // Loop through all active rooms to find where this socket was
        for (const roomCode in rooms) {
            const room = rooms[roomCode];

            // Check if the disconnected user is in this room's player list
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                // Remove the player from the array
                const removedPlayer = room.players.splice(playerIndex, 1)[0];
                console.log(`[LEFT] ${removedPlayer.name} left room ${roomCode}`);

                // Broadcast the updated player list to everyone remaining in the room
                io.to(roomCode).emit('player_list_updated', room.players);

                // If the host disconnects, delete the room entirely
                if (socket.id === room.host) {
                    console.log(`[ROOM CLOSED] Host left room ${roomCode}`);
                    io.to(roomCode).emit('error_message', 'Host has left the game. (eventually this will redirect to titlescreen but it doesnt right now)');
                    delete rooms[roomCode];
                }

                break; // Stop looping once found
            }
        }
    });
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`Game Server is running on port ${PORT}`);
});