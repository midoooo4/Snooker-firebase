const { db } = require('./firebaseConfig');
const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, '../data/stats.json');
const MATCHES_FILE = path.join(__dirname, '../data/matches.json');

function readLocalMatches() {
    try {
        if (fs.existsSync(MATCHES_FILE)) {
            return JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading local matches:', e);
    }
    return [];
}

function writeLocalMatches(matches) {
    try {
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(matches, null, 2));
    } catch (e) {
        console.error('Error writing local matches:', e);
    }
}

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

async function getMatchHistory() {
    if (!db) return readLocalMatches();
    try {
        // Remove .orderBy() as it requires a manual Firestore index to be created first.
        // We'll limit to 100 to be safe and sort locally.
        const snapshot = await db.collection('matches').limit(100).get();
        const matches = [];
        snapshot.forEach(doc => {
            matches.push({ id: doc.id, ...doc.data() });
        });
        // Sort descending by timestamp
        matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return matches.slice(0, 50); // Keep only the latest 50
    } catch (err) {
        console.error('Error fetching matches from Firestore:', err);
        return readLocalMatches();
    }
}

async function recordMatchResult(winner, loser, matchType, framesPlayed, pricePerFrame) {
    if (!winner || !loser) return;

    // We now treat each frame as a "match" entry in the stats for more accurate accounting.
    // However, the framesPlayed passed here is the total frames in the match (e.g., 2+0 = 2).
    // The frames won/lost are determined by the match type or specific counts.
    // For simplicity, we assume winner and loser won their respective frames.
    // If framesPlayed is 2 (e.g. 2-0), winner gets 2 wins, loser gets 2 losses.

    // BUT, the gameMachine already tells us total framesPlayed. 
    // Let's assume the winner won all frames for revenue purposes (loser pays everything).

    const price = pricePerFrame && pricePerFrame > 0 ? pricePerFrame : 20;
    const frames = framesPlayed && framesPlayed > 0 ? framesPlayed : 1;
    const tariff = frames * price;

    if (!db) {
        const stats = readLocalStats();
        if (!stats[winner]) stats[winner] = { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };
        if (!stats[loser]) stats[loser] = { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };

        // Winner gets one "match" credit but multiple "wins" if it was best of X? 
        // No, user wants it to look like multiple matches if multiple frames played.
        stats[winner].wins += frames;
        stats[winner].matches += frames;

        stats[loser].losses += frames;
        stats[loser].matches += frames;
        stats[loser].amountOwed += tariff;

        const matchEntry = { winner, loser, matchType, frames, timestamp: Date.now() };
        const localMatches = readLocalMatches();
        localMatches.unshift(matchEntry);
        if (localMatches.length > 50) localMatches.pop(); // Keep last 50
        writeLocalMatches(localMatches);

        writeLocalStats(stats);
        console.log(`Successfully recorded match to local storage: ${winner} beat ${loser}. Loser owes ${tariff} DH (${frames} frames × ${price} DH)`);
        return;
    }

    const winnerRef = db.collection('stats').doc(winner);
    const loserRef = db.collection('stats').doc(loser);
    const matchRef = db.collection('matches').doc();

    try {
        await db.runTransaction(async (t) => {
            const winnerDoc = await t.get(winnerRef);
            const loserDoc = await t.get(loserRef);

            const wData = winnerDoc.exists ? winnerDoc.data() : { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };
            const lData = loserDoc.exists ? loserDoc.data() : { wins: 0, losses: 0, matches: 0, amountOwed: 0, totalPaid: 0 };

            wData.wins += frames;
            wData.matches += frames;

            lData.losses += frames;
            lData.matches += frames;
            lData.amountOwed += tariff;

            t.set(winnerRef, wData);
            t.set(loserRef, lData);
            t.set(matchRef, { winner, loser, matchType, frames, timestamp: Date.now() });
        });
        console.log(`Successfully recorded match to Firebase: ${winner} beat ${loser}. Loser owes ${tariff} DH (${frames} frames)`);
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
        const statsSnap = await db.collection('stats').get();
        const batch = db.batch();
        statsSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        const matchesSnap = await db.collection('matches').get();
        matchesSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log('All stats and matches cleared from Firebase.');
    } catch (err) {
        console.error('Error clearing stats:', err);
    }
}

module.exports = {
    getPlayerStats,
    getMatchHistory,
    recordMatchResult,
    clearAllStats,
    markPlayerPaid
};
