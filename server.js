const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const GAME_SECONDS = 480;
const DEFAULT_ROOM = "SUMMIT";

const CLUES = [
  { target: "map", answer: 1 },
  { target: "frame", answer: 1 },
  { target: "fire", answer: 1 },
  { target: "ship", answer: 3 },
  { target: "books", answer: 1 }
];

function createRoom(roomKey) {
  return {
    roomKey,
    status: "waiting",
    playerOrder: [],
    scoreBoard: {},
    clueIdx: 0,
    alerts: 3,
    timeLeft: GAME_SECONDS,
    activeChallenge: false,
    wrongThisClue: [],
    lifelines: { skip: true, time: true },
    ended: false,
    endReason: "",
    winner: false
  };
}

const rooms = new Map();
rooms.set(DEFAULT_ROOM, createRoom(DEFAULT_ROOM));

function leaderboardRows(room) {
  return room.playerOrder
    .map((name) => ({
      name,
      score: room.scoreBoard[name] || 0,
      clue: room.clueIdx + 1
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function emitState(roomKey) {
  const room = rooms.get(roomKey);
  if (!room) return;
  io.to(roomKey).emit("room-state", room);
  io.to(roomKey).emit("leaderboard-update", leaderboardRows(room));
}

function addScore(room, playerName, delta) {
  const current = room.scoreBoard[playerName] || 0;
  room.scoreBoard[playerName] = Math.max(0, current + delta);
}

function startRoom(room) {
  room.status = "active";
  room.clueIdx = 0;
  room.alerts = 3;
  room.timeLeft = GAME_SECONDS;
  room.activeChallenge = false;
  room.wrongThisClue = [];
  room.lifelines = { skip: true, time: true };
  room.ended = false;
  room.endReason = "";
  room.winner = false;

  room.playerOrder.forEach((name) => {
    room.scoreBoard[name] = 0;
  });
}

function endRoom(room, winner, reason) {
  if (room.ended) return;
  room.ended = true;
  room.status = "ended";
  room.winner = winner;
  room.endReason = reason;
  room.activeChallenge = false;
}

setInterval(() => {
  const room = rooms.get(DEFAULT_ROOM);
  if (!room) return;

  if (room.status === "active" && !room.ended) {
    room.timeLeft -= 1;

    if (room.timeLeft <= 0) {
      room.timeLeft = 0;
      endRoom(room, false, "TIME EXPIRED");
    }

    emitState(DEFAULT_ROOM);
  }
}, 1000);

io.on("connection", (socket) => {
  socket.on("join-room", ({ playerName }) => {
    const cleanName = String(playerName || "").trim().toUpperCase();
    const room = rooms.get(DEFAULT_ROOM);

    if (!cleanName) {
      socket.emit("room-error", "Enter player name.");
      return;
    }

    socket.join(DEFAULT_ROOM);
    socket.data.playerName = cleanName;
    socket.data.roomKey = DEFAULT_ROOM;

    if (!room.playerOrder.includes(cleanName)) room.playerOrder.push(cleanName);
    if (room.scoreBoard[cleanName] == null) room.scoreBoard[cleanName] = 0;

    socket.emit("join-success", {
      playerName: cleanName,
      roomKey: DEFAULT_ROOM,
      status: room.status
    });

    emitState(DEFAULT_ROOM);
  });

  socket.on("start-game", () => {
    const room = rooms.get(DEFAULT_ROOM);
    if (!room) return;

    if (room.status === "waiting") {
      startRoom(room);
    }

    io.to(DEFAULT_ROOM).emit("game-started");
    emitState(DEFAULT_ROOM);
  });

  socket.on("wrong-click", ({ hotspotId }) => {
    const playerName = socket.data.playerName;
    const room = rooms.get(DEFAULT_ROOM);
    if (!playerName || !room || room.ended || room.status !== "active") return;

    const currentTarget = CLUES[room.clueIdx]?.target;
    if (!currentTarget) return;
    if (hotspotId === currentTarget) return;
    if (room.wrongThisClue.includes(hotspotId)) return;

    room.wrongThisClue.push(hotspotId);
    room.alerts -= 1;
    addScore(room, playerName, -25);

    io.to(DEFAULT_ROOM).emit("wrong-click-result", {
      hotspotId,
      playerName,
      alerts: room.alerts
    });

    if (room.alerts <= 0) {
      room.alerts = 0;
      endRoom(room, false, "COVER BLOWN");
    }

    emitState(DEFAULT_ROOM);
  });

  socket.on("correct-object", ({ hotspotId }) => {
    const room = rooms.get(DEFAULT_ROOM);
    if (!room || room.ended || room.status !== "active") return;

    const currentTarget = CLUES[room.clueIdx]?.target;
    if (hotspotId !== currentTarget) return;
    if (room.activeChallenge) return;

    room.activeChallenge = true;
    io.to(DEFAULT_ROOM).emit("open-challenge", { clueIdx: room.clueIdx });
    emitState(DEFAULT_ROOM);
  });

  socket.on("submit-challenge", ({ answerIndex }) => {
    const playerName = socket.data.playerName;
    const room = rooms.get(DEFAULT_ROOM);
    if (!playerName || !room || room.ended || !room.activeChallenge) return;

    const correctAnswer = CLUES[room.clueIdx]?.answer;
    const ok = Number(answerIndex) === correctAnswer;

    if (!ok) {
      addScore(room, playerName, -20);
      io.to(DEFAULT_ROOM).emit("challenge-result", { ok: false, playerName });
      emitState(DEFAULT_ROOM);
      return;
    }

    addScore(room, playerName, 100);
    room.activeChallenge = false;
    room.wrongThisClue = [];

    if (room.clueIdx >= CLUES.length - 1) {
      addScore(room, playerName, room.timeLeft);
      endRoom(room, true, "MOLE IDENTIFIED");
      io.to(DEFAULT_ROOM).emit("challenge-result", { ok: true, playerName });
      emitState(DEFAULT_ROOM);
      return;
    }

    room.clueIdx += 1;
    io.to(DEFAULT_ROOM).emit("challenge-result", { ok: true, playerName });
    emitState(DEFAULT_ROOM);
  });

  socket.on("use-lifeline", ({ type }) => {
    const playerName = socket.data.playerName;
    const room = rooms.get(DEFAULT_ROOM);
    if (!playerName || !room || room.ended || room.status !== "active") return;
    if (!room.lifelines[type]) return;

    room.lifelines[type] = false;
    addScore(room, playerName, -10);

    if (type === "skip") {
      room.activeChallenge = false;
      room.wrongThisClue = [];

      if (room.clueIdx >= CLUES.length - 1) {
        endRoom(room, true, "MOLE IDENTIFIED");
      } else {
        room.clueIdx += 1;
      }
    }

    if (type === "time") {
      room.timeLeft += 60;
    }

    io.to(DEFAULT_ROOM).emit("lifeline-used", { type, playerName });
    emitState(DEFAULT_ROOM);
  });

  socket.on("admin-unlock", () => {
    const room = rooms.get(DEFAULT_ROOM);
    if (!room || room.ended) return;

    room.activeChallenge = false;
    room.wrongThisClue = [];

    if (room.clueIdx >= CLUES.length - 1) {
      endRoom(room, true, "MOLE IDENTIFIED");
    } else {
      room.clueIdx += 1;
    }

    emitState(DEFAULT_ROOM);
  });

  socket.on("admin-reset", () => {
    const current = rooms.get(DEFAULT_ROOM);
    if (!current) return;

    const next = createRoom(DEFAULT_ROOM);
    next.playerOrder = [...current.playerOrder];
    current.playerOrder.forEach((name) => {
      next.scoreBoard[name] = 0;
    });

    rooms.set(DEFAULT_ROOM, next);
    emitState(DEFAULT_ROOM);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});