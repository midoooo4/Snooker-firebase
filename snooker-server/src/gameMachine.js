const BALL_VALUES = {
    RED: 1,
    YELLOW: 2,
    GREEN: 3,
    BROWN: 4,
    BLUE: 5,
    PINK: 6,
    BLACK: 7
};

const COLOR_SEQUENCE = [
    BALL_VALUES.YELLOW,
    BALL_VALUES.GREEN,
    BALL_VALUES.BROWN,
    BALL_VALUES.BLUE,
    BALL_VALUES.PINK,
    BALL_VALUES.BLACK
];

function createGame(players = ['Player 1', 'Player 2'], matchType = 'FRAME_UNIQUE') {
    return {
        players,
        matchType, // e.g., 'FRAME_UNIQUE', 3 (Best of 3), 5 (Best of 5)
        framesWon: [0, 0],
        scores: [0, 0],
        activePlayer: 0,
        remainingReds: 15,
        phase: 'REDS', // REDS -> COLORS
        isColorTurn: false, // In REDS phase, true means next ball must be a color
        currentColorIndex: 0, // Used during COLORS phase
        currentBreak: 0,
        isFreeballAvailable: false, // Set to true after a foul (simplified implementation, normally requires being snookered)
        bestBreaks: [0, 0],
        pottedBalls: { "0": [], "1": [] }, // Track balls potted in current frame: { 0: player1Balls, 1: player2Balls }
        lastFrameWinner: null,
        lastFoul: null, // { player: string, points: number, timestamp: number }
        isWaitingForMatch: true,
        isA2Mode: false, // A2 tie-break mode: Black scores 1 point, first to 2 wins
        matchStartTime: null,
        history: [],
        queue: []
    };
}

function cloneState(state) {
    const { history, ...rest } = state;
    return JSON.parse(JSON.stringify(rest));
}

function switchPlayer(state) {
    state.activePlayer = state.activePlayer === 0 ? 1 : 0;
    state.currentBreak = 0;
    state.isFreeballAvailable = false;

    // Logic: If on colors turn and player switches, the table resets to REDS (if available) or sequence
    if (state.phase === 'REDS') {
        state.isColorTurn = false;
        // If no reds left and player missed their color turn, we MUST move to sequence
        if (state.remainingReds === 0) {
            state.phase = 'COLORS';
            state.currentColorIndex = 0;
        }
    }
}

function handleAction(prevState, action, payload) {
    // Save to history before modifying
    if (action !== 'UNDO') {
        if (!prevState.history) prevState.history = [];
        // Keep last 15 states to prevent memory bloat
        if (prevState.history.length > 15) prevState.history.shift();
        const historyEntry = cloneState(prevState);
        prevState.history.push(historyEntry);
    }

    const state = cloneState(prevState);
    state.history = prevState.history; // Maintain reference to history array

    switch (action) {
        case 'POT_RED':
            state.lastFrameWinner = null;
            state.lastFoul = null;
            state.isWaitingForMatch = false;
            
            // Only decrement remaining reds if it's NOT a freeball
            if (state.remainingReds > 0 && !payload?.isFreeball) {
                state.remainingReds--;
            }
            
            state.scores[state.activePlayer] += BALL_VALUES.RED;
            state.currentBreak += BALL_VALUES.RED;
            state.pottedBalls[state.activePlayer].push('RED');

            // After a red (or freeball acting as red), it's ALWAYS a color turn
            state.isColorTurn = true;
            break;

        case 'POT_COLOR':
            state.lastFrameWinner = null;
            state.lastFoul = null;
            state.isWaitingForMatch = false;
            const value = payload.value; // Expected ball value
            // In A2 mode, Black is worth 1 point (tracks number of blacks potted)
            const effectiveValue = (state.isA2Mode && value === BALL_VALUES.BLACK) ? 1 : value;
            state.scores[state.activePlayer] += effectiveValue;
            state.currentBreak += effectiveValue;

            // Find the ball type by value for the pottedBalls tracker
            const ballType = Object.keys(BALL_VALUES).find(key => BALL_VALUES[key] === value); // always use original value for ball type
            if (ballType) state.pottedBalls[state.activePlayer].push(ballType);

            if (state.currentBreak > state.bestBreaks[state.activePlayer]) {
                state.bestBreaks[state.activePlayer] = state.currentBreak;
            }

            // Game state progression
            if (state.phase === 'REDS') {
                state.isColorTurn = false; // Back to REDS (if reds left)
                // If this was the color after the LAST red, transition to sequence
                if (state.remainingReds === 0) {
                    state.phase = 'COLORS';
                    state.currentColorIndex = 0;
                }
            } else {
                // Already in colors phase, advance sequence ONLY IF NOT freeball and NOT A2 Mode
                if (!payload?.isFreeball && !state.isA2Mode) {
                    const index = COLOR_SEQUENCE.indexOf(value);
                    if (index !== -1 && index >= state.currentColorIndex) {
                        state.currentColorIndex = index + 1;
                    } else {
                        state.currentColorIndex++;
                    }
                }
            }
            break;

        case 'FOUL':
            const foulPoints = Math.max(4, payload.foulValue || 4);
            const opponent = state.activePlayer === 0 ? 1 : 0;
            state.scores[opponent] += foulPoints;

            state.pottedBalls[opponent].push(`FOUL_${foulPoints}`);

            state.lastFoul = {
                player: state.players[state.activePlayer],
                points: foulPoints,
                timestamp: Date.now()
            };

            if (payload.isRedPotted) {
                if (state.remainingReds > 0) state.remainingReds--;
            }

            switchPlayer(state);
            break;

        case 'MISS': // Missed pot, no foul, just pass turn
            state.lastFoul = null;
            switchPlayer(state);
            break;

        case 'UNDO':
            if (state.history && state.history.length > 0) {
                const previousState = state.history.pop();
                previousState.history = state.history; // restore history array
                return previousState;
            }
            break;

        case 'SET_MATCH_CONFIG':
            if (payload.players) state.players = payload.players;
            if (payload.matchType) state.matchType = payload.matchType;
            // Record the start time of the match when configuration is first set
            if (!state.matchStartTime) {
                state.matchStartTime = Date.now();
            }
            state.isWaitingForMatch = false;
            break;

        case 'END_FRAME':
            // Award frame to the player with the highest score
            const winner = state.scores[0] > state.scores[1] ? 0 : (state.scores[1] > state.scores[0] ? 1 : null);
            if (winner !== null) {
                state.framesWon[winner]++;
                state.lastFrameWinner = state.players[winner];
            } else {
                state.lastFrameWinner = "Draw";
            }

            // Check if the match is over (Best of X)
            const matchTypeNum = parseInt(state.matchType);
            let isMatchOver = false;
            if (!isNaN(matchTypeNum) && matchTypeNum > 1) {
                // Best of X: need ceil(X/2) frames to win
                const framesToWin = Math.ceil(matchTypeNum / 2);
                if (state.framesWon[0] >= framesToWin || state.framesWon[1] >= framesToWin) {
                    isMatchOver = true;
                    // Determine match winner
                    const matchWinner = state.framesWon[0] >= framesToWin ? 0 : 1;
                    state.matchWinner = state.players[matchWinner];
                }
            } else {
                // Single frame mode
                isMatchOver = true;
                if (winner !== null) {
                    state.matchWinner = state.players[winner];
                }
            }

            state.isMatchOver = isMatchOver;

            // Reset frame data but keep config and frames won
            state.scores = [0, 0];
            state.activePlayer = winner !== null ? (winner === 0 ? 1 : 0) : 0;
            state.remainingReds = 15;
            state.phase = 'REDS';
            state.isColorTurn = false;
            state.currentColorIndex = 0;
            state.currentBreak = 0;
            state.pottedBalls = { "0": [], "1": [] };
            state.isFreeballAvailable = false;
            state.isA2Mode = false; // MUST reset A2 mode for next frame

            if (isMatchOver) {
                state.isWaitingForMatch = true;
            }

            state.history = [];
            state.history.push({ ...cloneState(state), history: [] });
            break;

        case 'START_COLORS_ONLY':
            console.log(`[STATE] Manual reset: START_COLORS_ONLY`);
            state.scores = [0, 0];
            state.phase = 'COLORS';
            state.currentColorIndex = 0;
            state.remainingReds = 0;
            state.currentBreak = 0;
            state.pottedBalls = { "0": [], "1": [] };
            state.isColorTurn = false;
            state.lastFrameWinner = null;
            state.lastFoul = null;
            state.isWaitingForMatch = false;
            state.isA2Mode = false; // Reset just in case they were in A2
            break;

        case 'START_A2_MODE':
            console.log(`[STATE] Manual reset: START_A2_MODE (Black only mode)`);
            // "A2" - Black ball mode: Black scores 1 point, first to 2 wins
            state.scores = [0, 0];
            state.phase = 'COLORS';
            state.currentColorIndex = 5; // Black only (index 5 in COLOR_SEQUENCE)
            state.remainingReds = 0;
            state.currentBreak = 0;
            state.pottedBalls = { "0": [], "1": [] };
            state.isColorTurn = false;
            state.lastFrameWinner = null;
            state.lastFoul = null;
            state.isWaitingForMatch = false;
            state.isA2Mode = true; // Enable A2 scoring (Black = 1 pt)
            break;

        case 'RESET_GAME':
            const p = payload && payload.players ? payload.players : state.players;
            const m = payload && payload.matchType ? payload.matchType : state.matchType;
            const newGame = createGame(p, m);
            newGame.isWaitingForMatch = true;
            newGame.matchStartTime = Date.now();
            newGame.queue = [...(state.queue || [])]; // Preserve queue on reset
            newGame.history = [{ ...newGame }];
            return newGame;
    }

    return state;
}

module.exports = {
    createGame,
    handleAction,
    BALL_VALUES
};
