const { db } = require('./firebaseConfig');
const fs = require('fs');
const path = require('path');

const ROOMS_FILE = path.join(__dirname, '../data/rooms.json');
const rooms = new Map();

function readLocalRooms() {
    try {
        if (fs.existsSync(ROOMS_FILE)) {
            const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
            Object.entries(data).forEach(([id, roomData]) => {
                rooms.set(id, {
                    id,
                    sockets: [],
                    gameState: roomData.gameState
                });
            });
            return true;
        }
    } catch (e) {
        console.error('Error reading local rooms:', e);
    }
    return false;
}

function writeLocalRooms() {
    try {
        const data = {};
        rooms.forEach((room, id) => {
            data[id] = { gameState: room.gameState };
        });
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing local rooms:', e);
    }
}

async function initRooms() {
    if (!db) {
        if (readLocalRooms()) {
            console.log(`Loaded ${rooms.size} rooms from local storage.`);
        }
        return;
    }
    try {
        const snapshot = await db.collection('rooms').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            rooms.set(doc.id, {
                id: doc.id,
                sockets: [],
                gameState: data.gameState
            });
        });
        console.log(`Loaded ${snapshot.size} active rooms from Firebase.`);
    } catch (err) {
        console.error('Failed to load rooms from Firebase:', err);
        readLocalRooms();
    }
}

function createRoom(roomId) {
    const room = {
        id: roomId,
        sockets: [],
        gameState: null
    };
    rooms.set(roomId, room);
    if (!db) writeLocalRooms();
    return room;
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function joinRoom(roomId, socketId) {
    const room = rooms.get(roomId);
    if (room && !room.sockets.includes(socketId)) {
        room.sockets.push(socketId);
    }
}

function leaveRoom(roomId, socketId) {
    const room = rooms.get(roomId);
    if (room) {
        room.sockets = room.sockets.filter(id => id !== socketId);
    }
}

async function persistGameState(roomId, gameState) {
    const room = rooms.get(roomId);
    if (room) room.gameState = gameState;

    if (!db) {
        writeLocalRooms();
        return;
    }
    try {
        await db.collection('rooms').doc(roomId).set({
            gameState,
            lastUpdated: new Date().toISOString()
        });
    } catch (err) {
        console.error(`Failed to persist room ${roomId}:`, err);
    }
}

module.exports = {
    initRooms,
    createRoom,
    getRoom,
    joinRoom,
    leaveRoom,
    persistGameState
};
