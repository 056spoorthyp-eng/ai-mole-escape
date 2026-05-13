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

const CLUES = [
  {
    title: "FRAGMENT #1 — THE SILENT CARTOGRAPHER",
    target: "map",
    challenge: {
      type: "mcq",
      answer: 1
    }
  },
  {
    title: "FRAGMENT #2 — THE FROZEN MOMENT",
    target: "frame",
    challenge: {
      type: "image",
      answer: 1
    }
  },
  {
    title: "FRAGMENT #3 — THE SILENT DANCER",
    target: "fire",
    challenge: {
      type: "cipher",
      answer: "PROMPT"
    }
  },
  {
    title: "FRAGMENT #4 — THE COVETED WEIGHT",
    target: "coins",
    challenge: {
      type: "match",
      answer: [
        ["RAG", "Grounded Q&A on internal docs"],
        ["Forecasting AI", "Treasury cash projections"],
        ["Computer Vision", "Invoice OCR & fraud"],
        ["Agent workflows", "Multi-step automation"]
      ]
    }
  },
  {
    title: "FRAGMENT #5 — THE CAPTAIN'S WHEEL",
    target: "wheel",
    challenge: {
      type: "mcq",
      answer: 1
    }
  }
];

const PREMADE_ROOMS = ["LOBBY7", "TEAM1", "TEAM2", "TEAM3"];

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
PREMADE_ROOMS.forEach((key) => rooms.set(key, createRoom(key)));

function getRoomSummary(room) {
  return {
    roomKey: room.roomKey,
    status: room.status,
    playerOrder: room.playerOrder,
    scoreBoard: room.scoreBoard,
    clueIdx: room.clueIdx,
    alerts: room.alerts,
    timeLeft: room.timeLeft,
    activeChallenge: room.activeChallenge,
    wrongThisClue: room.wrongThisClue,
    lifelines: room.lifelines,
    ended: room.ended,
    endReason: room.endReason,
    winner: room.winner
  };
}

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
  io.to(roomKey).emit("room-state", getRoomSummary(room));
  io.to(roomKey).emit("leaderboard-update", leaderboardRows(room));
}

function setScore(room, playerName, nextScore) {
  room.scoreBoard[playerName] = Math.max(0, nextScore);
}

function addScore(room, playerName, delta) {
  const current = room.scoreBoard[playerName] || 0;
  setScore(room, playerName, current + delta);
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

function validateChallenge(clueIdx, payload) {
  const challenge = CLUES[clueIdx].challenge;

  if (challenge.type === "mcq" || challenge.type === "image") {
    return Number(payload.answerIndex) === challenge.answer;
  }

  if (challenge.type === "cipher") {
    return String(payload.answerText || "").trim().toUpperCase() === challenge.answer;
  }

  if (challenge.type === "match") {
    const expected = challenge.answer
      .map((pair) => pair.join("=>"))
      .sort()
      .join("|");

    const actual = Array.isArray(payload.matchPairs)
      ? payload.matchPairs.map((pair) => pair.join("=>")).sort().join("|")
      : "";

    return actual === expected;
  }

  return false;
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status === "active" && !room.ended) {
      room.timeLeft -= 1;

      if (room.timeLeft <= 0) {
        room.timeLeft = 0;
        endRoom(room, false, "TIME EXPIRED");
      }

      emitState(room.roomKey);
    }
  }
}, 1000);

io.on("connection", (socket) => {
  socket.on("join-room", ({ playerName, roomKey }) => {
    const cleanName = String(playerName || "").trim().toUpperCase();
    const cleanRoom = String(roomKey || "").trim().toUpperCase();

    if (!cleanName || !cleanRoom) {
      socket.emit("room-error", "Enter player name and room key.");
      return;
    }

    const room = rooms.get(cleanRoom);
    if (!room) {
      socket.emit("room-error", `Room ${cleanRoom} does not exist.`);
      return;
    }

    socket.join(cleanRoom);
    socket.data.playerName = cleanName;
    socket.data.roomKey = cleanRoom;

    if (!room.playerOrder.includes(cleanName)) {
      room.playerOrder.push(cleanName);
    }
    if (room.scoreBoard[cleanName] == null) {
      room.scoreBoard[cleanName] = 0;
    }

    socket.emit("join-success", {
      playerName: cleanName,
      roomKey: cleanRoom
    });

    emitState(cleanRoom);
  });

  socket.on("start-game", () => {
    const roomKey = socket.data.roomKey;
    if (!roomKey) return;

    const room = rooms.get(roomKey);
    if (!room) return;

    startRoom(room);
    io.to(roomKey).emit("game-started");
    emitState(roomKey);
  });

  socket.on("wrong-click", ({ hotspotId }) => {
    const roomKey = socket.data.roomKey;
    const playerName = socket.data.playerName;
    if (!roomKey || !playerName) return;

    const room = rooms.get(roomKey);
    if (!room || room.ended || room.status !== "active") return;

    const currentTarget = CLUES[room.clueIdx]?.target;
    if (!currentTarget) return;
    if (hotspotId === currentTarget) return;
    if (room.wrongThisClue.includes(hotspotId)) return;

    room.wrongThisClue.push(hotspotId);
    room.alerts -= 1;
    addScore(room, playerName, -25);

    io.to(roomKey).emit("wrong-click-result", {
      hotspotId,
      playerName,
      alerts: room.alerts
    });

    if (room.alerts <= 0) {
      room.alerts = 0;
      endRoom(room, false, "COVER BLOWN");
    }

    emitState(roomKey);
  });

  socket.on("correct-object", ({ hotspotId }) => {
    const roomKey = socket.data.roomKey;
    if (!roomKey) return;

    const room = rooms.get(roomKey);
    if (!room || room.ended || room.status !== "active") return;

    const currentTarget = CLUES[room.clueIdx]?.target;
    if (hotspotId !== currentTarget) return;
    if (room.activeChallenge) return;

    room.activeChallenge = true;
    io.to(roomKey).emit("open-challenge", { clueIdx: room.clueIdx });
    emitState(roomKey);
  });

  socket.on("submit-challenge", (payload) => {
    const roomKey = socket.data.roomKey;
    const playerName = socket.data.playerName;
    if (!roomKey || !playerName) return;

    const room = rooms.get(roomKey);
    if (!room || room.ended || !room.activeChallenge) return;

    const ok = validateChallenge(room.clueIdx, payload);

    if (!ok) {
      addScore(room, playerName, -20);
      io.to(roomKey).emit("challenge-result", {
        ok: false,
        playerName
      });
      emitState(roomKey);
      return;
    }

    addScore(room, playerName, 100);
    room.activeChallenge = false;
    room.wrongThisClue = [];

    if (room.clueIdx >= CLUES.length - 1) {
      addScore(room, playerName, room.timeLeft);
      endRoom(room, true, "MOLE IDENTIFIED");
      io.to(roomKey).emit("challenge-result", {
        ok: true,
        playerName
      });
      emitState(roomKey);
      return;
    }

    room.clueIdx += 1;

    io.to(roomKey).emit("challenge-result", {
      ok: true,
      playerName
    });
    emitState(roomKey);
  });

  socket.on("use-lifeline", ({ type }) => {
    const roomKey = socket.data.roomKey;
    const playerName = socket.data.playerName;
    if (!roomKey || !playerName) return;

    const room = rooms.get(roomKey);
    if (!room || room.ended || room.status !== "active") return;
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

    io.to(roomKey).emit("lifeline-used", {
      type,
      playerName
    });
    emitState(roomKey);
  });

  socket.on("admin-unlock", () => {
    const roomKey = socket.data.roomKey;
    if (!roomKey) return;

    const room = rooms.get(roomKey);
    if (!room || room.ended) return;

    room.activeChallenge = false;
    room.wrongThisClue = [];

    if (room.clueIdx >= CLUES.length - 1) {
      endRoom(room, true, "MOLE IDENTIFIED");
    } else {
      room.clueIdx += 1;
    }

    emitState(roomKey);
  });

  socket.on("admin-reset", () => {
    const roomKey = socket.data.roomKey;
    if (!roomKey) return;

    const current = rooms.get(roomKey);
    if (!current) return;

    const next = createRoom(roomKey);
    next.playerOrder = [...current.playerOrder];
    current.playerOrder.forEach((name) => {
      next.scoreBoard[name] = 0;
    });

    rooms.set(roomKey, next);
    emitState(roomKey);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
