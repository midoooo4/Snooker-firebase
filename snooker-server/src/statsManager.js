const { db } = require('./firebaseConfig');
const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, '../data/stats.json');

function readLocalStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading local stats:', e);
    }
    return {};
}

function writeLocalStats(stats) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error('Error writing local stats:', e);
    }
}

async function getPlayerStats() {
    if (!db) return readLocalStats();
    try {
        const snapshot = await db.collection('stats').get();
        const stats = {};
        snapshot.forEach(doc => {
            stats[doc.id] = doc.data();
        });
        return stats;
    } catch (err) {
        console.error('Error fetching stats:', err);
        return readLocalStats();
    }
}

async function recordMatchResult(winner, loser, matchType, framesPlayed, pricePerFrame) {
    if (!winner || !loser) return;

    // Loser pays for all frames played in the match.
    // For a normal 1-frame match or any match, they pay framesPlayed * pricePerFrame.
    // pricePerFrame defaults to 20 if not provided.
    const price = pricePerFrame && pricePerFrame > 0 ? pricePerFrame : 20;
    const frames = framesPlayed && framesPlayed > 0 ? framesPlayed : 1;
    const tariff = frames * price;

    if (!db) {
        const stats = readLocalStats();
        if (!stats[winner]) stats[winner] = { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };
        if (!stats[loser]) stats[loser] = { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };

        stats[winner].wins++;
        stats[winner].matches++;

        stats[loser].losses++;
        stats[loser].matches++;
        stats[loser].amountOwed += tariff;

        writeLocalStats(stats);
        console.log(`Successfully recorded match to local storage: ${winner} beat ${loser}. Loser owes ${tariff} DH (${frames} frames × ${price} DH)`);
        return;
    }

    const winnerRef = db.collection('stats').doc(winner);
    const loserRef = db.collection('stats').doc(loser);

    try {
        await db.runTransaction(async (t) => {
            const winnerDoc = await t.get(winnerRef);
            const loserDoc = await t.get(loserRef);

            const wData = winnerDoc.exists ? winnerDoc.data() : { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };
            const lData = loserDoc.exists ? loserDoc.data() : { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };

            wData.wins++;
            wData.matches++;

            lData.losses++;
            lData.matches++;
            lData.amountOwed += tariff;

            t.set(winnerRef, wData);
            t.set(loserRef, lData);
        });
        console.log(`Successfully recorded match to Firebase: ${winner} beat ${loser}. Loser owes ${tariff} DH`);
    } catch (err) {
        console.error('Error recording match result:', err);
    }
}

async function markPlayerPaid(playerName) {
    if (!playerName) return false;
    if (!db) {
        const stats = readLocalStats();
        if (stats[playerName]) {
            const owed = stats[playerName].amountOwed || 0;
            stats[playerName].totalPaid = (stats[playerName].totalPaid || 0) + owed;
            stats[playerName].amountOwed = 0;
            writeLocalStats(stats);
            return true;
        }
        return false;
    }

    try {
        const playerRef = db.collection('stats').doc(playerName);
        await db.runTransaction(async (t) => {
            const doc = await t.get(playerRef);
            if (!doc.exists) return;
            const data = doc.data();
            const owed = data.amountOwed || 0;
            const totalPaid = (data.totalPaid || 0) + owed;
            t.update(playerRef, { amountOwed: 0, totalPaid: totalPaid });
        });
        return true;
    } catch (err) {
        console.error('Error marking player paid:', err);
        return false;
    }
}

async function clearAllStats() {
    if (!db) {
        writeLocalStats({});
        console.log('All local stats cleared.');
        return;
    }
    try {
        const snapshot = await db.collection('stats').get();
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log('All stats cleared from Firebase.');
    } catch (err) {
        console.error('Error clearing stats:', err);
    }
}

module.exports = {
    getPlayerStats,
    recordMatchResult,
    clearAllStats,
    markPlayerPaid
};
