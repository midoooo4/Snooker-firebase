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
        pottedBalls: [[], []], // Track balls potted in current frame: [player1Balls, player2Balls]
        lastFrameWinner: null,
        lastFoul: null, // { player: string, points: number, timestamp: number }
        isWaitingForMatch: true,
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
    state.isFreeballAvailable = false; // Reset freeball on switch player
    if (state.phase === 'REDS') {
        state.isColorTurn = false; // Next player always starts with a RED if in REDS phase
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
            if (state.remainingReds > 0) {
                state.remainingReds--;
            }
            state.scores[state.activePlayer] += BALL_VALUES.RED;
            state.currentBreak += BALL_VALUES.RED;
            state.pottedBalls[state.activePlayer].push('RED');

            // Advance phase merely for display purposes
            if (state.remainingReds === 0 && state.phase === 'REDS') {
                state.phase = 'COLORS';
            }
            break;

        case 'POT_COLOR':
            state.lastFrameWinner = null;
            state.lastFoul = null;
            state.isWaitingForMatch = false;
            const value = payload.value; // Expected ball value
            state.scores[state.activePlayer] += value;
            state.currentBreak += value;

            // Find the ball type by value for the pottedBalls tracker
            const ballType = Object.keys(BALL_VALUES).find(key => BALL_VALUES[key] === value);
            if (ballType) state.pottedBalls[state.activePlayer].push(ballType);

            if (state.currentBreak > state.bestBreaks[state.activePlayer]) {
                state.bestBreaks[state.activePlayer] = state.currentBreak;
            }
            break;

        case 'FOUL':
            const foulPoints = Math.max(4, payload.foulValue || 4);
            const opponent = state.activePlayer === 0 ? 1 : 0;
            state.scores[opponent] += foulPoints;

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
            state.pottedBalls = [[], []];
            state.isFreeballAvailable = false;

            if (isMatchOver) {
                state.isWaitingForMatch = true;
            }

            state.history = [];
            state.history.push({ ...cloneState(state), history: [] });
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
