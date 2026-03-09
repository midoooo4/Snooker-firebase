import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import './MobileRemote.css';

export default function MobileRemote() {
    const { roomCode } = useParams<{ roomCode: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { gameState, connected, sendAction } = useSocket(roomCode || '');
    const navigate = useNavigate();
    const [showFoulModal, setShowFoulModal] = useState(false);

    // Send configuration if we just joined from home with params
    useEffect(() => {
        if (connected && searchParams.has('p1') && searchParams.has('p2')) {
            const players = [searchParams.get('p1'), searchParams.get('p2')];
            const matchType = searchParams.get('type') || 'FRAME_UNIQUE';

            // Only send config if we explicitly want a reset or if the current game is empty
            const isMatchActive = gameState && gameState.players && gameState.players[0] !== 'A';

            if (searchParams.get('reset') === 'true' || !isMatchActive) {
                if (searchParams.get('reset') === 'true') {
                    sendAction('RESET_GAME', { players, matchType });
                } else {
                    sendAction('SET_MATCH_CONFIG', { players, matchType });
                }
            }
            // Clear params from URL so we don't keep sending them on refresh
            setSearchParams({}, { replace: true });
        }
    }, [connected, searchParams, sendAction, setSearchParams, gameState]);

    if (!connected || !gameState) {
        return (
            <div className="app-container flex-center">
                <h2>Connecting to {roomCode}...</h2>
            </div>
        );
    }

    const triggerHaptic = () => {
        if (navigator.vibrate) navigator.vibrate(50);
    };

    const handleAction = (action: string, payload?: any) => {
        triggerHaptic();
        sendAction(action, payload);
    };

    const handleFoul = (foulValue: number, isRedPotted: boolean) => {
        handleAction('FOUL', { foulValue, isRedPotted });
        setShowFoulModal(false);
    };

    const toggleFullscreen = () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;

        if (isIOS && !isStandalone) {
            alert("Sur iPhone, Apple ne permet pas le plein écran via un bouton. \n\nPour une expérience complète sans barre d'adresse :\n1. Cliquez sur le bouton de partage (carré avec flèche)\n2. Sélectionnez 'Sur l'écran d'accueil'\n3. Lancez l'application depuis votre écran d'accueil !");
            return;
        }

        const doc = document.documentElement as any;
        const _document = document as any;
        // ... previous robust logic remains
        if (!document.fullscreenElement && !_document.webkitFullscreenElement && !_document.mozFullScreenElement && !_document.msFullscreenElement) {
            if (doc.requestFullscreen) { doc.requestFullscreen(); }
            else if (doc.webkitRequestFullscreen) { doc.webkitRequestFullscreen(); }
            else if (doc.mozRequestFullScreen) { doc.mozRequestFullScreen(); }
            else if (doc.msRequestFullscreen) { doc.msRequestFullscreen(); }
        } else {
            if (document.exitFullscreen) { document.exitFullscreen(); }
            else if (_document.webkitExitFullscreen) { _document.webkitExitFullscreen(); }
            else if (_document.mozCancelFullScreen) { _document.mozCancelFullScreen(); }
            else if (_document.msExitFullscreen) { _document.msExitFullscreen(); }
        }
    };

    const handleReset = () => {
        handleAction('RESET_GAME');
    };

    const balls = [
        { name: 'RED', label: 'ROUGE', color: '#ff1744', value: 1, action: 'POT_RED' },
        { name: 'YELLOW', label: 'JAUNE', color: '#f1c40f', value: 2, action: 'POT_COLOR' },
        { name: 'GREEN', label: 'VERTE', color: '#2ecc71', value: 3, action: 'POT_COLOR' },
        { name: 'BROWN', label: 'MARRON', color: '#795548', value: 4, action: 'POT_COLOR' },
        { name: 'BLUE', label: 'BLEUE', color: '#3498db', value: 5, action: 'POT_COLOR' },
        { name: 'PINK', label: 'ROSE', color: '#e84393', value: 6, action: 'POT_COLOR' },
        { name: 'BLACK', label: 'NOIRE', color: '#222f3e', value: 7, action: 'POT_COLOR' },
    ];

    return (
        <div className="mobile-app dark-theme">
            <header className="top-bar">
                <button onClick={() => navigate('/')} className="btn-back-lobby">
                    <span>⬅</span> Lobby
                </button>
                <div onClick={toggleFullscreen} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    ⛶ <span className="session-number">LIGUE</span>
                </div>
                <div onClick={() => navigate(`/tv/${roomCode}`)} className="tv-link" style={{ cursor: 'pointer' }}>
                    📺 TV
                </div>
            </header>

            <div className="score-board">
                <div
                    className={`player-score-box ${gameState.activePlayer === 0 ? 'active' : ''}`}
                    onClick={() => gameState.activePlayer !== 0 && handleAction('MISS')}
                    style={{ cursor: gameState.activePlayer !== 0 ? 'pointer' : 'default' }}
                >
                    <div className="player-label">
                        {gameState.activePlayer === 0 && <span className="play-icon">▶</span>} {gameState.players[0] || 'A'}
                    </div>
                    <div className="score-value">{gameState.scores[0]}</div>
                </div>
                <div
                    className={`player-score-box ${gameState.activePlayer === 1 ? 'active' : ''}`}
                    onClick={() => gameState.activePlayer !== 1 && handleAction('MISS')}
                    style={{ cursor: gameState.activePlayer !== 1 ? 'pointer' : 'default' }}
                >
                    <div className="player-label">
                        {gameState.activePlayer === 1 && <span className="play-icon">▶</span>} {gameState.players[1] || 'B'}
                    </div>
                    <div className="score-value score-dimmed">{gameState.scores[1]}</div>
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-item">
                    <span className="stat-title">BREAK EN COURS</span>
                    <span className="stat-num text-green">{gameState.currentBreak}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-title">MEILLEUR BREAK</span>
                    <span className="stat-num text-gold">{Math.max((gameState.bestBreaks && gameState.bestBreaks[0]) || 0, (gameState.bestBreaks && gameState.bestBreaks[1]) || 0)}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-title">ROUGES</span>
                    <span className="stat-num text-red">{gameState.remainingReds}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-title">FRAME</span>
                    <span className="stat-num text-white">{Math.max((gameState.framesWon && gameState.framesWon[0]) || 0, (gameState.framesWon && gameState.framesWon[1]) || 0) + 1}</span>
                </div>
            </div>

            <div className="target-pill-container">
                <div className="target-pill">
                    <span className="target-dot" style={{ background: gameState.remainingReds > 0 ? '#e74c3c' : '#f1c40f' }}></span>
                    {gameState.remainingReds > 0 ? 'Jouer une rouge' : 'Jouer la couleur'}
                </div>
            </div>

            <div className="balls-grid-custom">
                {balls.map(ball => (
                    <button
                        key={ball.name}
                        className="snooker-ball"
                        style={{
                            backgroundColor: ball.color,
                            boxShadow: `0 0 15px ${ball.color}40, inset -5px -5px 15px rgba(0,0,0,0.5)`
                        }}
                        onClick={() => handleAction(ball.action, { value: ball.value })}
                    >
                        <div className="ball-value">{ball.value}</div>
                        <div className="ball-label">{ball.label}</div>
                    </button>
                ))}
            </div>

            <div className="bottom-actions-grid">
                <button className="btn-action btn-foul" onClick={() => setShowFoulModal(true)}>
                    <span className="icon">⚠</span> Faute
                </button>
                <button className="btn-action btn-undo" onClick={() => handleAction('UNDO')}>
                    <span className="icon">↩</span> Annuler
                </button>
                <button className="btn-action btn-endframe" onClick={() => {
                    if (!gameState) return;
                    if (!window.confirm("Voulez-vous vraiment terminer cette frame ?")) return;
                    const winnerIndex = gameState.scores[0] > gameState.scores[1] ? 0 : (gameState.scores[1] > gameState.scores[0] ? 1 : null);

                    // Calculate if the match will be over after this frame
                    const matchTypeNum = parseInt(gameState.matchType || '0');
                    const framesToWin = matchTypeNum > 1 ? Math.ceil(matchTypeNum / 2) : 1;
                    const framesAfter = [...(gameState.framesWon || [0, 0])];
                    if (winnerIndex !== null) framesAfter[winnerIndex]++;
                    const matchOver = (gameState.matchType === 'FRAME_UNIQUE') || framesAfter[0] >= framesToWin || framesAfter[1] >= framesToWin;

                    if (matchOver) {
                        // Match is over
                        if (winnerIndex !== null) {
                            alert(`🏆 ${gameState.players[winnerIndex]} remporte le match !`);
                        } else {
                            alert('Match nul !');
                        }
                        handleAction('END_FRAME');
                        navigate('/');
                    } else {
                        // Just a frame in a best-of series
                        if (winnerIndex !== null) {
                            alert(`✅ ${gameState.players[winnerIndex]} gagne cette frame ! (${framesAfter[0]} - ${framesAfter[1]})`);
                        } else {
                            alert('Frame nulle !');
                        }
                        handleAction('END_FRAME');
                    }
                }}>
                    <span className="icon">✔</span> Fin de Frame
                </button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <button onClick={handleReset} style={{
                    background: 'transparent', border: 'none', color: '#e74c3c',
                    padding: '0.5rem', fontSize: '0.8rem', opacity: 0.5
                }}>
                    🗑️ Reset Match
                </button>
            </div>

            {showFoulModal && (
                <div className="foul-modal-overlay">
                    <div className="foul-modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>Select Foul Points</h3>
                        <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Standard Foul:</p>
                        <div className="foul-points-grid">
                            {[4, 5, 6, 7].map(val => (
                                <button key={val} className="foul-val-btn" onClick={() => handleFoul(val, false)}>
                                    {val} pts
                                </button>
                            ))}
                        </div>

                        <p style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Foul + Red Potted (-1 Red):</p>
                        <div className="foul-points-grid">
                            {[4, 5, 6, 7].map(val => (
                                <button key={`red-${val}`} className="btn-foul-red" onClick={() => handleFoul(val, true)}>
                                    {val} pts
                                </button>
                            ))}
                        </div>

                        <button className="btn-cancel-foul" onClick={() => setShowFoulModal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
