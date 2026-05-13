const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const lobbies = {}; // Stores room data: { roomCode: { players: { socketId: { name, score, finished } } } }

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create or Join Room
    socket.on('joinRoom', ({ roomCode, username }) => {
        socket.join(roomCode);
        
        if (!lobbies[roomCode]) {
            lobbies[roomCode] = { players: {} };
        }

        lobbies[roomCode].players[socket.id] = {
            name: username,
            score: 0,
            finished: false
        };

        // Notify everyone in the room about the updated player list
        io.to(roomCode).emit('roomUpdate', Object.values(lobbies[roomCode].players));
    });

    // Track Player Progress (e.g., solved a riddle)
    socket.on('playerProgress', ({ roomCode, score }) => {
        if (lobbies[roomCode] && lobbies[roomCode].players[socket.id]) {
            lobbies[roomCode].players[socket.id].score = score;
            io.to(roomCode).emit('roomUpdate', Object.values(lobbies[roomCode].players));
        }
    });

    // Player Escaped
    socket.on('playerEscaped', ({ roomCode, finalTime }) => {
        if (lobbies[roomCode] && lobbies[roomCode].players[socket.id]) {
            lobbies[roomCode].players[socket.id].finished = true;
            lobbies[roomCode].players[socket.id].finalTime = finalTime;
            
            io.to(roomCode).emit('roomUpdate', Object.values(lobbies[roomCode].players));
            io.to(roomCode).emit('systemAlert', `${lobbies[roomCode].players[socket.id].name} HAS ESCAPED PROTOCOL!`);
        }
    });

    // Handle Disconnects
    socket.on('disconnect', () => {
        for (const roomCode in lobbies) {
            if (lobbies[roomCode].players[socket.id]) {
                const name = lobbies[roomCode].players[socket.id].name;
                delete lobbies[roomCode].players[socket.id];
                
                io.to(roomCode).emit('roomUpdate', Object.values(lobbies[roomCode].players));
                io.to(roomCode).emit('systemAlert', `${name} disconnected.`);
                
                if (Object.keys(lobbies[roomCode].players).length === 0) {
                    delete lobbies[roomCode];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
