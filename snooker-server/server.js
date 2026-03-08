const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoom, getRoom, joinRoom, leaveRoom, initRooms, persistGameState } = require('./src/roomManager');
const { createGame, handleAction } = require('./src/gameMachine');
const { getPlayerStats, recordMatchResult, clearAllStats, markPlayerPaid } = require('./src/statsManager');
const { initTournament, getTournament, createTournament, assignMatchToTable, clearTournament, handleMatchWinner } = require('./src/tournamentManager');
const cookieParser = require('cookie-parser');
const { generateAdminToken, verifyAdminToken, ADMIN_PASSWORD } = require('./src/adminAuth');

const app = express();
const fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

const PORT = process.env.PORT || 7860;

console.log('--- SERVER STARTING ---');
console.log('Port:', PORT);
console.log('Directory:', __dirname);

app.use(express.json());

app.get('/api/version', (req, res) => {
    console.log('[API] /api/version called');
    res.json({ version: 2, status: 'ok', timestamp: new Date().toISOString() });
});
// REST API for stats
app.get('/api/stats', async (req, res) => {
    console.log('[API] /api/stats called');
    const stats = await getPlayerStats();
    res.json(stats);
});

app.delete('/api/stats', verifyAdminToken, async (req, res) => {
    await clearAllStats();
    res.json({ success: true });
});

// Admin Auth Endpoints
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = generateAdminToken();
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: true, // Always true for cross-domain cookies
            sameSite: 'none', // Required for cross-domain cookies (Vercel -> HF)
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.json({ success: true, token, v: 2 });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

app.get('/api/admin/check', verifyAdminToken, (req, res) => {
    res.json({ success: true, loggedIn: true });
});

app.post('/api/admin/stats/pay', verifyAdminToken, async (req, res) => {
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ error: 'Player name required' });

    const success = await markPlayerPaid(playerName);
    if (success) {
        res.json({ success: true });
    } else {
        console.error(`[ADMIN] Failed to mark player ${playerName} as paid.`);
        res.status(500).json({ error: 'Failed to mark player paid' });
    }
});

app.post('/api/queue', (req, res) => {
    const { roomCode, playerName } = req.body;
    if (!roomCode || !playerName) return res.status(400).json({ error: 'roomCode and playerName required' });
    let room = getRoom(roomCode);
    if (!room) {
        room = createRoom(roomCode);
        room.gameState = createGame();
    }
    if (!room.gameState.queue) room.gameState.queue = [];
    room.gameState.queue.push(playerName);
    persistGameState(roomCode, room.gameState);

    // Attempt to broadcast if io exists (it will be hoisted naturally, but we can do it via a global getter or just let the client refresh if it's on TvView. Since io is declared below... wait, we will move this logic below or just shift io up.)
    // For now we'll just handle it.
    if (global.io) global.io.to(roomCode).emit('game_state_update', room.gameState);

    res.json({ success: true, queue: room.gameState.queue });
});

app.post('/api/queue/remove', (req, res) => {
    const { roomCode, index } = req.body;
    const room = getRoom(roomCode);
    if (room && room.gameState.queue) {
        room.gameState.queue.splice(index, 1);
        persistGameState(roomCode, room.gameState);
        if (global.io) global.io.to(roomCode).emit('game_state_update', room.gameState);
        return res.json({ success: true, queue: room.gameState.queue });
    }
    res.status(404).json({ error: 'Room or queue not found' });
});

app.post('/api/queue/reorder', (req, res) => {
    const { roomCode, startIndex, endIndex } = req.body;
    const room = getRoom(roomCode);
    if (room && room.gameState.queue) {
        const result = Array.from(room.gameState.queue);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);

        room.gameState.queue = result;
        persistGameState(roomCode, room.gameState);
        if (global.io) global.io.to(roomCode).emit('game_state_update', room.gameState);
        return res.json({ success: true, queue: room.gameState.queue });
    }
    res.status(404).json({ error: 'Room or queue not found' });
});

app.post('/api/queue/edit', (req, res) => {
    const { roomCode, index, newName } = req.body;
    const room = getRoom(roomCode);
    if (room && room.gameState.queue && room.gameState.queue[index] !== undefined) {
        room.gameState.queue[index] = newName;
        persistGameState(roomCode, room.gameState);
        if (global.io) global.io.to(roomCode).emit('game_state_update', room.gameState);
        return res.json({ success: true, queue: room.gameState.queue });
    }
    res.status(404).json({ error: 'Room or player not found' });
});

app.post('/api/admin/daily-archive', verifyAdminToken, async (req, res) => {
    try {
        const stats = await getPlayerStats();
        if (Object.keys(stats).length === 0) return res.json({ success: true, message: 'No stats to archive' });

        const { db } = require('./src/firebaseConfig');
        const reportDate = new Date().toISOString().split('T')[0];

        await db.collection('daily_reports').doc(reportDate).set({
            timestamp: Date.now(),
            statsSnapshot: stats
        });

        await clearAllStats();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to archive stats' });
    }
});

app.get('/api/tournament', (req, res) => {
    res.json(getTournament());
});

// --- Persistent Config ---
const CONFIG_FILE = path.join(__dirname, 'data/config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading config file:', e);
    }
    return { activeTablesCount: 1, pricePerFrame: 20 };
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ activeTablesCount, pricePerFrame }, null, 2));
    } catch (e) {
        console.error('Error saving config file:', e);
    }
}

const savedConfig = loadConfig();
let activeTablesCount = savedConfig.activeTablesCount || 1;
let pricePerFrame = savedConfig.pricePerFrame || 20;
console.log(`[CONFIG] Loaded: ${activeTablesCount} tables, ${pricePerFrame} DH/frame`);

app.get('/api/config/tables', (req, res) => {
    res.json({ count: activeTablesCount, pricePerFrame });
});

app.post('/api/admin/config/tables', verifyAdminToken, (req, res) => {
    const { count } = req.body;
    if (count && count >= 1 && count <= 10) {
        activeTablesCount = count;
        saveConfig();
        if (global.io) global.io.emit('config_updated', { activeTablesCount, pricePerFrame });
        res.json({ success: true, count: activeTablesCount });
    } else {
        res.status(400).json({ error: 'Invalid count. Must be 1-10.' });
    }
});

app.post('/api/admin/config/price', verifyAdminToken, (req, res) => {
    const { price } = req.body;
    if (price && price >= 5 && price <= 500) {
        pricePerFrame = price;
        saveConfig();
        if (global.io) global.io.emit('config_updated', { activeTablesCount, pricePerFrame });
        res.json({ success: true, pricePerFrame });
    } else {
        res.status(400).json({ error: 'Invalid price. Must be between 5 and 500 DH.' });
    }
});

app.post('/api/admin/tournament/create', verifyAdminToken, (req, res) => {
    const { players } = req.body;
    console.log('[ADMIN] Creating tournament for players:', players);
    if (!players || !Array.isArray(players)) return res.status(400).json({ error: 'Players array required' });
    try {
        const tournament = createTournament(players);
        if (global.io) global.io.emit('tournament_updated', tournament);
        res.json({ success: true, tournament });
    } catch (err) {
        console.error('[ADMIN] Failed to create tournament:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/tournament/assign', verifyAdminToken, (req, res) => {
    const { matchId, tableId } = req.body;
    const match = assignMatchToTable(matchId, tableId);
    if (match) {
        let room = getRoom(tableId);
        if (!room) {
            room = createRoom(tableId);
        }
        const newGame = require('./src/gameMachine').createGame([match.player1, match.player2], 'FRAME_UNIQUE');
        room.gameState = newGame;
        persistGameState(tableId, room.gameState);
        if (global.io) {
            global.io.emit('tournament_updated', getTournament());
            global.io.to(tableId).emit('game_state_update', room.gameState);
        }
        res.json({ success: true, match });
    } else {
        res.status(400).json({ error: 'Failed to assign match' });
    }
});

app.post('/api/admin/tournament/clear', verifyAdminToken, (req, res) => {
    clearTournament();
    if (global.io) global.io.emit('tournament_updated', null);
    res.json({ success: true });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
global.io = io; // Expose securely for the REST API queue push

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (roomCode) => {
        socket.join(roomCode);
        let room = getRoom(roomCode);
        if (!room) {
            room = createRoom(roomCode);
            room.gameState = createGame();
            persistGameState(roomCode, room.gameState);
        }
        joinRoom(roomCode, socket.id);

        // Send current state to the joined client
        socket.emit('game_state_update', room.gameState);
        console.log(`User ${socket.id} joined room ${roomCode}`);
    });

    socket.on('game_action', ({ roomCode, action, payload }) => {
        console.log(`[ACTION] Room: ${roomCode}, Action: ${action}, Payload:`, payload);
        const room = getRoom(roomCode);
        if (room) {
            try {
                const prevState = room.gameState;
                room.gameState = handleAction(room.gameState, action, payload);

                // If match just ended, record the result
                if (action === 'END_FRAME' && room.gameState.isMatchOver && room.gameState.matchWinner) {
                    const winnerName = room.gameState.matchWinner;
                    const loserName = prevState.players.find(p => p !== winnerName) || '';
                    if (winnerName && loserName) {
                        // Total frames played = sum of both players' frames won
                        const framesPlayed = (room.gameState.framesWon?.[0] || 0) + (room.gameState.framesWon?.[1] || 0);
                        recordMatchResult(winnerName.trim(), loserName.trim(), room.gameState.matchType, framesPlayed, pricePerFrame);
                        console.log(`[STATS] Match recorded: ${winnerName} beat ${loserName} (${framesPlayed} frames @ ${pricePerFrame} DH)`);

                        // Winner Stays On Logic - with delay to show the "Victory Overlay"
                        if (room.gameState.queue && room.gameState.queue.length > 0) {
                            setTimeout(() => {
                                const currentRoom = getRoom(roomCode);
                                if (!currentRoom || !currentRoom.gameState.isMatchOver) return;

                                const nextPlayer = currentRoom.gameState.queue.shift(); // Pull next player
                                const newMatchPlayers = [winnerName, nextPlayer];
                                // Re-init game for the new match
                                const newGame = require('./src/gameMachine').createGame(newMatchPlayers, currentRoom.gameState.matchType);
                                newGame.queue = currentRoom.gameState.queue; // keep queue
                                currentRoom.gameState = newGame;
                                console.log(`[QUEUE] Starting new match: ${winnerName} vs ${nextPlayer}`);
                                persistGameState(roomCode, currentRoom.gameState);
                                io.to(roomCode).emit('game_state_update', currentRoom.gameState);
                            }, 5000); // 5 seconds delay
                        }

                        // TOURNAMENT LOGIC
                        const tournamentUpdated = handleMatchWinner(room.gameState, winnerName);
                        if (tournamentUpdated) {
                            const updatedTournament = getTournament();
                            io.emit('tournament_updated', updatedTournament);

                            // Auto-assign next pending match to the freed table after a short delay
                            setTimeout(() => {
                                const nextTournament = getTournament();
                                if (!nextTournament || nextTournament.status !== 'ACTIVE') return;

                                // Find next PENDING match with real players (not BYE, not yet assigned)
                                let nextMatch = null;
                                for (const round of nextTournament.bracket) {
                                    const found = round.find(m =>
                                        m.status === 'PENDING' &&
                                        m.player1 && m.player2 &&
                                        m.player1 !== 'BYE' && m.player2 !== 'BYE' &&
                                        !m.tableId
                                    );
                                    if (found) { nextMatch = found; break; }
                                }

                                if (nextMatch) {
                                    const assigned = assignMatchToTable(nextMatch.id, roomCode);
                                    if (assigned) {
                                        let nextRoom = getRoom(roomCode);
                                        if (!nextRoom) nextRoom = createRoom(roomCode);
                                        const newGame = require('./src/gameMachine').createGame([assigned.player1, assigned.player2], 'FRAME_UNIQUE');
                                        nextRoom.gameState = newGame;
                                        persistGameState(roomCode, nextRoom.gameState);
                                        io.emit('tournament_updated', getTournament());
                                        io.to(roomCode).emit('game_state_update', nextRoom.gameState);
                                        console.log(`[TOURNAMENT] Auto-assigned next match ${nextMatch.id} (${assigned.player1} vs ${assigned.player2}) to ${roomCode}`);
                                    }
                                } else {
                                    console.log(`[TOURNAMENT] No more pending matches for ${roomCode}`);
                                }
                            }, 6000); // 6 seconds delay — gives time to see winner screen
                        }
                    }
                }

                persistGameState(roomCode, room.gameState);
                io.to(roomCode).emit('game_state_update', room.gameState);
            } catch (err) {
                console.error(`[ERROR] processing action ${action}:`, err);
            }
        }
    });

    socket.on('disconnect', () => {
        // Logic to handle cleanup of user from rooms can be implemented here if needed.
        console.log('User disconnected:', socket.id);
    });

});

app.use((req, res) => {
    const indexPath = path.join(__dirname, '../snooker-client/dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend not built yet. Please wait.');
    }
});

async function startServer() {
    try {
        console.log('Initializing rooms...');
        await initRooms();
        console.log('Rooms initialized.');
        initTournament();
    } catch (e) {
        console.error('Failed to init rooms:', e);
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server is fully live on port ${PORT}`);
        console.log(`Version: 2`);
    });
}

startServer();
