import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import './TvView.css';

const API_URL = import.meta.env.PROD ? 'https://ero0ck-snooker-live.hf.space' : 'http://localhost:3001';

export default function TvView() {
    const { roomCode } = useParams<{ roomCode: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { socket, gameState, connected, sendAction } = useSocket(roomCode || '');

    // Theme Sync Logic
    useEffect(() => {
        const applyTheme = (theme: string) => {
            document.body.setAttribute('data-theme', theme);
            document.documentElement.setAttribute('data-theme', theme);
        };

        // Fetch initial theme explicitly on TvView mount
        fetch(`${API_URL}/api/config/tables`)
            .then(res => res.json())
            .then(data => {
                if (data && data.appTheme) applyTheme(data.appTheme);
            });

        if (!socket) return;
        
        socket.on('config_updated', (data: { appTheme?: string }) => {
            if (data && data.appTheme) applyTheme(data.appTheme);
        });

        return () => {
            if (socket) socket.off('config_updated');
            document.body.removeAttribute('data-theme');
            document.documentElement.removeAttribute('data-theme');
        };
    }, [socket]);

    // Send configuration if we just joined from home with params
    useEffect(() => {
        if (connected && searchParams.has('p1') && searchParams.has('p2')) {
            sendAction('SET_MATCH_CONFIG', {
                players: [searchParams.get('p1'), searchParams.get('p2')],
                matchType: searchParams.get('type') || 'FRAME_UNIQUE'
            });
            // Clear params from URL so we don't keep sending them on refresh
            setSearchParams({}, { replace: true });
        }
    }, [connected, searchParams, sendAction, setSearchParams]);

    // Timer state decoupled from gameState re-renders
    const [currentTime, setCurrentTime] = useState(Date.now());
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // --- Persistent victory message (stays at least 5 seconds) ---
    const [victoryMessage, setVictoryMessage] = useState<{ label: string; value: string; badge: string } | null>(null);
    const [foulOverlay, setFoulOverlay] = useState<{ player: string; points: number } | null>(null);
    const victoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const foulTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!gameState) return;

        let msg: { label: string; value: string; badge: string } | null = null;

        if (gameState.isMatchOver && gameState.matchWinner) {
            msg = { label: 'Victoire', value: gameState.matchWinner, badge: 'MATCH TERMINÉ 🎉' };
        } else if (gameState.lastFrameWinner && !gameState.isMatchOver) {
            msg = {
                label: gameState.lastFrameWinner === 'Draw' ? 'Match Nul' : 'Victoire',
                value: gameState.lastFrameWinner !== 'Draw' ? gameState.lastFrameWinner : '',
                badge: 'FIN DE FRAME 🎉'
            };
        }

        if (msg) {
            // New victory detected — show it and start/reset the timer
            setVictoryMessage(msg);
            if (victoryTimerRef.current) clearTimeout(victoryTimerRef.current);
            victoryTimerRef.current = setTimeout(() => {
                setVictoryMessage(null);
                victoryTimerRef.current = null;
            }, 7000); // 7 seconds
        }
    }, [gameState?.lastFrameWinner, gameState?.isMatchOver, gameState?.matchWinner]);

    useEffect(() => {
        if (gameState?.lastFoul) {
            setFoulOverlay(gameState.lastFoul);
            if (foulTimerRef.current) clearTimeout(foulTimerRef.current);
            foulTimerRef.current = setTimeout(() => {
                setFoulOverlay(null);
                foulTimerRef.current = null;
            }, 7000); // 7 seconds
        }
    }, [gameState?.lastFoul?.timestamp]);

    // Clear foul overlay if scoring starts
    useEffect(() => {
        if (gameState?.currentBreak && gameState.currentBreak > 0) {
            setFoulOverlay(null);
        }
    }, [gameState?.currentBreak]);

    const elapsed = gameState?.matchStartTime && !gameState.isWaitingForMatch ? currentTime - gameState.matchStartTime : 0;

    if (!connected || !gameState) {
        return (
            <div className="tv-app flex-center">
                <h1 className="connecting-text">WAITING FOR MATCH (ROOM {roomCode})...</h1>
            </div>
        );
    }

    // Animation logic for high breaks
    const isCentury = gameState!.currentBreak >= 100;
    const isHalfCentury = gameState!.currentBreak >= 50 && gameState!.currentBreak < 100;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');

    // Calculate points remaining on table
    const calculateRemaining = () => {
        if (gameState!.phase === 'REDS') {
            let total = (gameState!.remainingReds * 8) + 27;
            if (gameState!.isColorTurn) total += 7;
            return total;
        } else {
            const colors = [2, 3, 4, 5, 6, 7];
            let total = 0;
            for (let i = (gameState!.currentColorIndex || 0); i < colors.length; i++) {
                total += colors[i];
            }
            return total;
        }
    };

    const pointsRemaining = calculateRemaining();

    // Calculate "Pots to Win" (Target Ball)
    const getPotsToWin = () => {
        const activeIdx = gameState!.activePlayer;
        const opponentIdx = activeIdx === 0 ? 1 : 0;
        const currentLead = gameState!.scores[activeIdx] - gameState!.scores[opponentIdx];
        const colorNames = ["YELLOW", "GREEN", "BROWN", "BLUE", "PINK", "BLACK"];
        const colorValues = [2, 3, 4, 5, 6, 7];

        if (currentLead > pointsRemaining) return null;

        let simLead = currentLead;
        let simRem = pointsRemaining;
        let simReds = gameState!.remainingReds;

        // 1. Simulation for REDS phase (if applicable)
        if (gameState!.phase === 'REDS') {
            const redsAvailable = simReds;
            for (let r = 1; r <= redsAvailable; r++) {
                // Pot the Red
                simLead += 1;
                simRem -= 1;
                if (simLead > simRem) return r === 1 ? "NEXT RED" : `${r} REDS`;

                // Try each color to see if it clinches
                for (let i = 0; i < 6; i++) {
                    if (simLead + colorValues[i] > simRem - colorValues[i]) {
                        return r === 1 ? `RED + ${colorNames[i]}` : `${r} REDS + ${colorNames[i]}`;
                    }
                }
                
                // Not safe even with black? Assume black and continue to next red.
                simLead += 7;
                simRem -= 7;
            }
        }

        // 2. Simulation for COLORS phase (or if reds didn't clinch)
        // Reset simulation lead if it was modified by reds loop above to be accurate for sequence
        simLead = currentLead;
        simRem = pointsRemaining;
        for (let i = (gameState!.currentColorIndex || 0); i < 6; i++) {
            simLead += colorValues[i];
            simRem -= colorValues[i];
            if (simLead > simRem) return `TO ${colorNames[i]}`;
        }
        return null;
    };

    const targetBall = getPotsToWin();

    let snookerValue = 4;
    if (pointsRemaining <= 7) snookerValue = 7;
    else if (pointsRemaining <= 13) snookerValue = 6;
    else if (pointsRemaining <= 18) snookerValue = 5;

    const diff = Math.abs(gameState!.scores[0] - gameState!.scores[1]);
    const needsSnookers = diff > pointsRemaining && pointsRemaining > 0;
    const snookersRequired = needsSnookers ? Math.ceil((diff - pointsRemaining) / snookerValue) : 0;
    const trailingPlayerIndex = gameState!.scores[0] < gameState!.scores[1] ? 0 : (gameState!.scores[1] < gameState!.scores[0] ? 1 : -1);

    return (
        <div className="tv-app" style={{ overflow: 'hidden' }}>
            <div className="tv-layout centered-layout">
                {/* Scoreboard Area */}
                <div className="scoreboard-container flex-center">
                    <div className={`player-card ${gameState!.activePlayer === 0 ? 'active' : ''}`}>
                        <div className="player-name">{gameState!.players[0]}</div>

                        {/* Potted Balls Tracker */}
                        <div className="potted-balls-container">
                            {gameState!.pottedBalls && gameState!.pottedBalls[0] && (gameState!.pottedBalls[0] as string[]).map((ball: string, idx: number) => {
                                if (ball.startsWith('FOUL_')) {
                                    const pts = ball.split('_')[1];
                                    const colorClass = pts === '4' ? 'ball-brown' : pts === '5' ? 'ball-blue' : pts === '6' ? 'ball-pink' : 'ball-black';
                                    return (
                                        <div key={idx} className={`mini-ball ${colorClass} foul-ball`}>
                                            <span className="foul-text">F</span>
                                        </div>
                                    );
                                }
                                return <div key={idx} className={`mini-ball ball-${ball.toLowerCase()}`}></div>;
                            })}
                        </div>

                        <div className="player-score">{gameState!.scores[0]}</div>
                        {gameState!.matchType && gameState!.matchType !== 'FRAME_UNIQUE' && gameState!.framesWon && (
                            <div className="frames-won">
                                Frames: {gameState!.framesWon[0]}
                            </div>
                        )}
                        <div className="player-best-break">Highest break: {gameState!.bestBreaks[0]}</div>
                        {needsSnookers && trailingPlayerIndex === 0 && (
                            <div className="snooks-badge">
                                {snookersRequired} snook{snookersRequired > 1 ? 's' : ''} req.
                            </div>
                        )}
                    </div>

                    <div className="vs-divider flex-col">
                        {gameState!.scores && (
                            <div className="match-stats-panel">
                                <div className="stat-box diff-box">
                                    <span className="stat-label">DIFFERENCE</span>
                                    <span className="stat-value">{Math.abs(gameState!.scores[0] - gameState!.scores[1])}</span>
                                </div>
                                <div className="stat-box rem-box">
                                    <span className="stat-label">REMAINING</span>
                                    <span className="stat-value" style={{
                                        color: Math.abs(gameState!.scores[0] - gameState!.scores[1]) > pointsRemaining ? 'var(--theme-danger)' : 'var(--theme-primary)'
                                    }}>
                                        {pointsRemaining}
                                    </span>
                                </div>
                                {targetBall && (
                                    <div className="stat-box pots-box">
                                        <span className="stat-label">POTS TO WIN</span>
                                        <span className="stat-value" style={{ fontSize: '1.2rem' }}>{targetBall}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {gameState!.matchType && gameState!.matchType !== 'FRAME_UNIQUE' && (
                            <div className="match-type-badge" style={{ marginTop: '1rem' }}>
                                {gameState!.matchType === '3' ? 'A2' : gameState!.matchType === '5' ? 'A3' : gameState!.matchType === '7' ? 'A4' : `BO${gameState!.matchType}`}
                            </div>
                        )}

                        {/* Overlays now placed inside vs-divider for perfect alignment */}
                        <div className="overlay-anchor">
                            {gameState!.currentBreak > 0 && !victoryMessage && !gameState!.lastFrameWinner && (
                                <div className={`break-overlay ${isCentury ? 'century-glow' : isHalfCentury ? 'half-century-glow' : ''}`}>
                                    <div className="break-label">Break</div>
                                    <div className="break-value">{gameState!.currentBreak}</div>
                                </div>
                            )}
                            {foulOverlay && !victoryMessage && (!gameState!.currentBreak || gameState!.currentBreak === 0) && (
                                <div className="break-overlay foul-overlay" style={{ border: '4px solid #ff4757', boxShadow: '0 0 50px rgba(255, 71, 87, 0.4)' }}>
                                    <div className="break-label" style={{ color: '#ff4757' }}>FAUTE !</div>
                                    <div className="break-value" style={{ color: '#ff4757' }}>{foulOverlay!.points}</div>
                                    <div className="break-badge" style={{ background: '#ff4757', color: 'white' }}>{foulOverlay!.player}</div>
                                </div>
                            )}
                            {victoryMessage && (
                                <div className="break-overlay winner-overlay century-glow">
                                    <div className="break-label">{victoryMessage!.label}</div>
                                    <div className="break-value">{victoryMessage!.value}</div>
                                    <div className="break-badge">{victoryMessage!.badge}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`player-card ${gameState!.activePlayer === 1 ? 'active' : ''}`}>
                        <div className="player-name">{gameState!.players[1]}</div>

                        {/* Potted Balls Tracker */}
                        <div className="potted-balls-container">
                            {gameState!.pottedBalls && gameState!.pottedBalls[1] && (gameState!.pottedBalls[1] as string[]).map((ball: string, idx: number) => {
                                if (ball.startsWith('FOUL_')) {
                                    const pts = ball.split('_')[1];
                                    const colorClass = pts === '4' ? 'ball-brown' : pts === '5' ? 'ball-blue' : pts === '6' ? 'ball-pink' : 'ball-black';
                                    return (
                                        <div key={idx} className={`mini-ball ${colorClass} foul-ball`}>
                                            <span className="foul-text">F</span>
                                        </div>
                                    );
                                }
                                return <div key={idx} className={`mini-ball ball-${ball.toLowerCase()}`}></div>;
                            })}
                        </div>

                        <div className="player-score">{gameState!.scores[1]}</div>
                        {gameState!.matchType && gameState!.matchType !== 'FRAME_UNIQUE' && gameState!.framesWon && (
                            <div className="frames-won">
                                Frames: {gameState!.framesWon[1]}
                            </div>
                        )}
                        <div className="player-best-break">Highest break: {gameState!.bestBreaks[1]}</div>
                        {needsSnookers && trailingPlayerIndex === 1 && (
                            <div className="snooks-badge">
                                {snookersRequired} snook{snookersRequired > 1 ? 's' : ''} req.
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {/* Enhanced Footer: Timer and Queue in one line */}
            <div className="tv-footer-container">
                <div className="footer-left">
                    <div className="footer-stat">
                        <span className="stat-label">Phase</span>
                        <span className="stat-value">{gameState!.isA2Mode ? 'A2' : gameState!.phase}</span>
                    </div>
                    <div className="footer-stat">
                        <span className="stat-label">Reds</span>
                        <span className="stat-value text-red">{gameState!.remainingReds}</span>
                    </div>
                    {gameState!.isA2Mode && (
                        <div className="footer-stat">
                            <span className="stat-label" style={{ color: '#f1c40f' }}>⭐ MODE A2</span>
                            <span className="stat-value" style={{ color: '#f1c40f', fontSize: '0.8rem' }}>Premier à 2 noires</span>
                        </div>
                    )}
                </div>

                <div className="footer-center">
                    {gameState!.queue && gameState!.queue.length > 0 && (
                        <div className="footer-queue">
                            <span className="queue-label">SUIVANTS:</span>
                            <div className="queue-list-wrapper" style={{ overflow: 'hidden', flex: 1 }}>
                                <div className="queue-list">
                                    {(gameState!.queue as string[]).map((player: string, index: number) => (
                                        <span key={`q1-${index}`} className="queue-item">
                                            <span className="queue-num">{index + 1}.</span> {player}
                                        </span>
                                    ))}
                                    {/* Duplicate for seamless effect */}
                                    {(gameState!.queue as string[]).map((player: string, index: number) => (
                                        <span key={`q2-${index}`} className="queue-item">
                                            <span className="queue-num">{index + 1}.</span> {player}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="footer-right">
                    {gameState!.matchStartTime && !gameState!.isWaitingForMatch && (
                        <div className="footer-timer">
                            ⏱ {minutes}:{seconds}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
