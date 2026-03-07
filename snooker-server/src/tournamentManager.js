const fs = require('fs');
const path = require('path');
const { getRoom, persistGameState } = require('./roomManager');

const TOURNAMENTS_FILE = path.join(__dirname, '../data/tournaments.json');

// Memory store for tournament
let currentTournament = null;

function loadTournament() {
    try {
        if (fs.existsSync(TOURNAMENTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOURNAMENTS_FILE, 'utf8'));
            currentTournament = data;
            return true;
        }
    } catch (e) {
        console.error('Error reading local tournament:', e);
    }
    return false;
}

function saveTournament() {
    try {
        if (!fs.existsSync(path.join(__dirname, '../data'))) {
            fs.mkdirSync(path.join(__dirname, '../data'));
        }
        if (currentTournament) {
            fs.writeFileSync(TOURNAMENTS_FILE, JSON.stringify(currentTournament, null, 2));
        } else if (fs.existsSync(TOURNAMENTS_FILE)) {
            fs.unlinkSync(TOURNAMENTS_FILE);
        }
    } catch (e) {
        console.error('Error saving local tournament:', e);
    }
}

// Fisher-Yates shuffle algorithm for random draw
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function createBracket(players) {
    // Generate empty bracket based on power of 2
    const numPlayers = players.length;
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numPlayers || 1)));

    // We'll create a basic single-elimination bracket
    // For now, assume we fill the base round, with 'BYE' for missing players

    // Seed players randomly first, then we'll interleave BYEs uniformly
    let randomizedPlayers = shuffleArray([...players]);
    let baseRoundPlayers = [];

    const numByes = nextPowerOf2 - numPlayers;

    // Simplest distribution: alternate player then BYE if BYEs are available
    // Better algorithm for fair brackets places BYEs far apart, but for simplicity
    // we just want to avoid BYE vs BYE. So we'll pair [Player, BYE], [Player, BYE]...
    // then [Player, Player] for the rest.

    for (let i = 0; i < nextPowerOf2 / 2; i++) {
        // First slot of the match gets a player (since we have at least nextPowerOf2 / 2 players if numPlayers >= nextPowerOf2/2, 
        // wait, if numPlayers < nextPowerOf2 / 2, it's not possible because nextPowerOf2 is derived from numPlayers)
        baseRoundPlayers.push(randomizedPlayers.shift() || 'BYE');

        // Second slot gets a BYE if we still have BYEs to give, otherwise a player
        if (i < numByes) {
            baseRoundPlayers.push('BYE');
        } else {
            baseRoundPlayers.push(randomizedPlayers.shift() || 'BYE');
        }
    }

    const rounds = [];

    // Round 1
    const round1Matches = [];
    let matchIdCounter = 1;
    for (let i = 0; i < nextPowerOf2; i += 2) {
        round1Matches.push({
            id: `M${matchIdCounter++}`,
            player1: baseRoundPlayers[i],
            player2: baseRoundPlayers[i + 1],
            winner: null,
            tableId: null, // Assigned later
            status: (baseRoundPlayers[i] === 'BYE' || baseRoundPlayers[i + 1] === 'BYE') ? 'COMPLETED' : 'PENDING'
        });

        // Auto-advance if BYE
        if (baseRoundPlayers[i] === 'BYE') {
            round1Matches[round1Matches.length - 1].winner = baseRoundPlayers[i + 1];
        } else if (baseRoundPlayers[i + 1] === 'BYE') {
            round1Matches[round1Matches.length - 1].winner = baseRoundPlayers[i];
        }
    }
    rounds.push(round1Matches);

    // Subsequent rounds
    let currentRoundMatchesSize = nextPowerOf2 / 2;
    let prevRoundMatchIndexOffset = 1;

    while (currentRoundMatchesSize > 1) {
        currentRoundMatchesSize = currentRoundMatchesSize / 2;
        const roundMatches = [];
        for (let i = 0; i < currentRoundMatchesSize; i++) {
            roundMatches.push({
                id: `M${matchIdCounter++}`,
                player1: null, // Derived from previous round
                player2: null, // Derived from previous round
                winner: null,
                tableId: null,
                status: 'PENDING',
                dependsOn: [
                    prevRoundMatchIndexOffset + i * 2,
                    prevRoundMatchIndexOffset + i * 2 + 1
                ]
            });
        }
        rounds.push(roundMatches);
        prevRoundMatchIndexOffset += currentRoundMatchesSize * 2;
    }

    // Process auto-advances from Round 1
    return propagateWinners(rounds);
}

function propagateWinners(rounds) {
    // Update player1/player2 of next rounds based on previous round winners
    for (let r = 1; r < rounds.length; r++) {
        for (let m = 0; m < rounds[r].length; m++) {
            const match = rounds[r][m];
            if (match.dependsOn) {
                // Find the earlier matches
                const dep1Id = `M${match.dependsOn[0]}`;
                const dep2Id = `M${match.dependsOn[1]}`;

                let w1 = null;
                let w2 = null;

                // search all previous rounds
                for (let prevR = 0; prevR < r; prevR++) {
                    const m1 = rounds[prevR].find(x => x.id === dep1Id);
                    if (m1 && m1.winner) w1 = m1.winner;

                    const m2 = rounds[prevR].find(x => x.id === dep2Id);
                    if (m2 && m2.winner) w2 = m2.winner;
                }

                match.player1 = w1;
                match.player2 = w2;

                // Auto-advance if BYE meets BYE or Player meets BYE (edge cases depending on seeding)
                if (match.player1 === 'BYE' && match.player2 === 'BYE') {
                    match.winner = 'BYE';
                    match.status = 'COMPLETED';
                } else if (match.player1 && match.player2 === 'BYE') {
                    match.winner = match.player1;
                    match.status = 'COMPLETED';
                } else if (match.player1 === 'BYE' && match.player2) {
                    match.winner = match.player2;
                    match.status = 'COMPLETED';
                }
            }
        }
    }
    return rounds;
}

function handleMatchWinner(state, winnerName) {
    if (!currentTournament || currentTournament.status !== 'ACTIVE') return false;

    let updated = false;

    // Find active match on table
    // Simplification: We look for IN_PROGRESS matches that have this winner
    const rounds = currentTournament.bracket;
    for (let r = 0; r < rounds.length; r++) {
        for (let m = 0; m < rounds[r].length; m++) {
            const match = rounds[r][m];
            if ((match.status === 'IN_PROGRESS' || match.status === 'PENDING') &&
                (match.player1 === winnerName || match.player2 === winnerName)) {

                match.winner = winnerName;
                match.status = 'COMPLETED';
                match.tableId = null; // free the table
                updated = true;
                break;
            }
        }
        if (updated) break;
    }

    if (updated) {
        currentTournament.bracket = propagateWinners(currentTournament.bracket);

        // Check if tournament is over
        const finalMatch = currentTournament.bracket[currentTournament.bracket.length - 1][0];
        if (finalMatch.winner && finalMatch.winner !== 'BYE') {
            currentTournament.status = 'COMPLETED';
            currentTournament.champion = finalMatch.winner;
        }

        saveTournament();
    }

    return updated;
}

module.exports = {
    initTournament: () => {
        loadTournament();
    },
    getTournament: () => currentTournament,
    createTournament: (players) => {
        const bracket = createBracket(players);
        currentTournament = {
            id: `TOURN_${Date.now()}`,
            status: 'ACTIVE', // ACTIVE, COMPLETED
            players,
            bracket,
            champion: null
        };
        saveTournament();
        return currentTournament;
    },
    assignMatchToTable: (matchId, tableId) => {
        if (!currentTournament) return false;
        let matchFound = null;
        for (let r = 0; r < currentTournament.bracket.length; r++) {
            const match = currentTournament.bracket[r].find(m => m.id === matchId);
            if (match) {
                matchFound = match;
                break;
            }
        }

        if (matchFound && matchFound.player1 && matchFound.player2 && matchFound.status !== 'COMPLETED') {
            matchFound.tableId = tableId;
            matchFound.status = 'IN_PROGRESS';
            saveTournament();
            return matchFound;
        }
        return false;
    },
    clearTournament: () => {
        currentTournament = null;
        saveTournament();
        return true;
    },
    handleMatchWinner
};
