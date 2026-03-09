import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import './TvView.css';

export default function TvView() {
    const { roomCode } = useParams<{ roomCode: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { gameState, connected, sendAction } = useSocket(roomCode || '');

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
            }, 6000); // 6 seconds
        }
    }, [gameState?.lastFrameWinner, gameState?.isMatchOver, gameState?.matchWinner]);

    useEffect(() => {
        if (gameState?.lastFoul) {
            setFoulOverlay(gameState.lastFoul);
            if (foulTimerRef.current) clearTimeout(foulTimerRef.current);
            foulTimerRef.current = setTimeout(() => {
                setFoulOverlay(null);
                foulTimerRef.current = null;
            }, 6000); // 6 seconds
        } else {
            setFoulOverlay(null);
        }
    }, [gameState?.lastFoul?.timestamp]);

    const elapsed = gameState?.matchStartTime && !gameState.isWaitingForMatch ? currentTime - gameState.matchStartTime : 0;

    if (!connected || !gameState) {
        return (
            <div className="tv-app flex-center">
                <h1 className="connecting-text">WAITING FOR MATCH (ROOM {roomCode})...</h1>
            </div>
        );
    }

    // Animation logic for high breaks
    const isCentury = gameState.currentBreak >= 100;
    const isHalfCentury = gameState.currentBreak >= 50 && gameState.currentBreak < 100;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');

    return (
        <div className="tv-app" style={{ overflow: 'hidden' }}>
            <div className="tv-layout centered-layout">
                {/* Scoreboard Area */}
                <div className="scoreboard-container flex-center">
                    <div className={`player-card ${gameState.activePlayer === 0 ? 'active' : ''}`}>
                        <div className="player-name">{gameState.players[0]}</div>

                        {/* Potted Balls Tracker */}
                        <div className="potted-balls-container">
                            {gameState.pottedBalls && gameState.pottedBalls[0] && gameState.pottedBalls[0].map((ball: string, idx: number) => (
                                <div key={idx} className={`mini-ball ball-${ball.toLowerCase()}`}></div>
                            ))}
                        </div>

                        <div className="player-score">{gameState.scores[0]}</div>
                        {gameState.matchType && gameState.matchType !== 'FRAME_UNIQUE' && gameState.framesWon && (
                            <div className="frames-won">
                                Frames: {gameState.framesWon[0]}
                            </div>
                        )}
                        <div className="player-best-break">Highest break: {gameState.bestBreaks[0]}</div>
                    </div>

                    <div className="vs-divider flex-col">
                        <div className="vs-circle">VS</div>
                        {gameState.scores && (
                            <div className="score-diff-badge">
                                Difference: {Math.abs(gameState.scores[0] - gameState.scores[1])}
                            </div>
                        )}
                        {gameState.matchType && gameState.matchType !== 'FRAME_UNIQUE' && (
                            <div className="match-type-badge">
                                {gameState.matchType === '3' ? 'A2' : gameState.matchType === '5' ? 'A3' : gameState.matchType === '7' ? 'A4' : `BO${gameState.matchType}`}
                            </div>
                        )}
                    </div>

                    <div className={`player-card ${gameState.activePlayer === 1 ? 'active' : ''}`}>
                        <div className="player-name">{gameState.players[1]}</div>

                        {/* Potted Balls Tracker */}
                        <div className="potted-balls-container">
                            {gameState.pottedBalls && gameState.pottedBalls[1] && gameState.pottedBalls[1].map((ball: string, idx: number) => (
                                <div key={idx} className={`mini-ball ball-${ball.toLowerCase()}`}></div>
                            ))}
                        </div>

                        <div className="player-score">{gameState.scores[1]}</div>
                        {gameState.matchType && gameState.matchType !== 'FRAME_UNIQUE' && gameState.framesWon && (
                            <div className="frames-won">
                                Frames: {gameState.framesWon[1]}
                            </div>
                        )}
                        <div className="player-best-break">Highest break: {gameState.bestBreaks[1]}</div>
                    </div>
                </div>

                {/* Overlays (Centred when active) */}
                {gameState.currentBreak > 0 && !victoryMessage && !gameState.lastFrameWinner && (
                    <div className={`break-overlay ${isCentury ? 'century-glow' : isHalfCentury ? 'half-century-glow' : ''}`}>
                        <div className="break-label">Break</div>
                        <div className="break-value">{gameState.currentBreak}</div>
                    </div>
                )}
                {/* Foul Overlay */}
                {foulOverlay && !victoryMessage && (
                    <div className="break-overlay foul-overlay" style={{ border: '4px solid #ff4757', boxShadow: '0 0 50px rgba(255, 71, 87, 0.4)' }}>
                        <div className="break-label" style={{ color: '#ff4757' }}>FAUTE !</div>
                        <div className="break-value" style={{ color: '#ff4757' }}>{foulOverlay.points}</div>
                        <div className="break-badge" style={{ background: '#ff4757', color: 'white' }}>{foulOverlay.player}</div>
                    </div>
                )}
                {/* Persistent Victory Overlay (stays 6 seconds) */}
                {victoryMessage && (
                    <div className="break-overlay winner-overlay century-glow">
                        <div className="break-label">{victoryMessage.label}</div>
                        <div className="break-value">{victoryMessage.value}</div>
                        <div className="break-badge">{victoryMessage.badge}</div>
                    </div>
                )}
            </div>

            {/* Enhanced Footer: Timer and Queue in one line */}
            <div className="tv-footer-container">
                <div className="footer-left">
                    <div className="footer-stat">
                        <span className="stat-label">Phase</span>
                        <span className="stat-value">{gameState.phase}</span>
                    </div>
                    <div className="footer-stat">
                        <span className="stat-label">Reds</span>
                        <span className="stat-value text-red">{gameState.remainingReds}</span>
                    </div>
                </div>

                <div className="footer-center">
                    {gameState.queue && gameState.queue.length > 0 && (
                        <div className="footer-queue">
                            <span className="queue-label">SUIVANTS:</span>
                            <div className="queue-list-wrapper" style={{ overflow: 'hidden', flex: 1 }}>
                                <div className="queue-list">
                                    {gameState.queue.map((player: string, index: number) => (
                                        <span key={`q1-${index}`} className="queue-item">
                                            <span className="queue-num">{index + 1}.</span> {player}
                                        </span>
                                    ))}
                                    {/* Duplicate for seamless effect */}
                                    {gameState.queue.map((player: string, index: number) => (
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
                    {gameState.matchStartTime && !gameState.isWaitingForMatch && (
                        <div className="footer-timer">
                            ⏱ {minutes}:{seconds}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
