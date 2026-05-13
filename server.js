const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

// Tracks room states: { roomCode: { players: { socketId: { name, score, clue, finished } } } }
const lobbies = {}; 

io.on('connection', (socket) => {
    console.log(`Agent connected to deck: ${socket.id}`);

    // Handles Room Handshake Lifecycle
    socket.on('joinRoom', ({ roomCode, username }) => {
        const cleanRoom = roomCode.trim().toUpperCase();
        const cleanName = username.trim();
        
        socket.join(cleanRoom);
        
        if (!lobbies[cleanRoom]) {
            lobbies[cleanRoom] = { players: {} };
        }

        lobbies[cleanRoom].players[socket.id] = {
            name: cleanName,
            score: 0,
            clue: 1,
            finished: false,
            updatedAt: Date.now()
        };

        // Broadcast synced data updates to all sockets inside the sector tunnel
        const currentManifest = Object.values(lobbies[cleanRoom].players);
        io.to(cleanRoom).emit('roomUpdate', currentManifest);
        io.to(cleanRoom).emit('systemAlert', `${cleanName.toUpperCase()} ESTABLISHED SECTOR CONNECTION.`);
    });

    // Handles Game Progress Metric Overrides
    socket.on('playerProgress', ({ roomCode, score, clue }) => {
        const cleanRoom = roomCode.trim().toUpperCase();
        if (lobbies[cleanRoom] && lobbies[cleanRoom].players[socket.id]) {
            lobbies[cleanRoom].players[socket.id].score = score;
            lobbies[cleanRoom].players[socket.id].clue = clue || 1;
            lobbies[cleanRoom].players[socket.id].updatedAt = Date.now();
            
            io.to(cleanRoom).emit('roomUpdate', Object.values(lobbies[cleanRoom].players));
        }
    });

    // Handles Execution Escape Completion Status
    socket.on('playerEscaped', ({ roomCode, score, finalTime }) => {
        const cleanRoom = roomCode.trim().toUpperCase();
        if (lobbies[cleanRoom] && lobbies[cleanRoom].players[socket.id]) {
            lobbies[cleanRoom].players[socket.id].score = score;
            lobbies[cleanRoom].players[socket.id].finished = true;
            lobbies[cleanRoom].players[socket.id].finalTime = finalTime;
            lobbies[cleanRoom].players[socket.id].updatedAt = Date.now();
            
            io.to(cleanRoom).emit('roomUpdate', Object.values(lobbies[cleanRoom].players));
            io.to(cleanRoom).emit('systemAlert', `${lobbies[cleanRoom].players[socket.id].name.toUpperCase()} ACCESSED ESCAPE NODE PROTOCOL.`);
        }
    });

    // Handles Connection Breaks Safely
    socket.on('disconnect', () => {
        for (const roomCode in lobbies) {
            if (lobbies[roomCode].players[socket.id]) {
                const lostName = lobbies[roomCode].players[socket.id].name;
                delete lobbies[roomCode].players[socket.id];
                
                io.to(roomCode).emit('roomUpdate', Object.values(lobbies[roomCode].players));
                io.to(roomCode).emit('systemAlert', `CONNECTION SECURE LOSS: ${lostName.toUpperCase()}`);
                
                if (Object.keys(lobbies[roomCode].players).length === 0) {
                    delete lobbies[roomCode];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[SYSTEM READY]: Port listener active on ${PORT}`));
