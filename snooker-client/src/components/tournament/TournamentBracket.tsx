import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import './TournamentBracket.css';

const API_URL = import.meta.env.PROD ? 'https://ero0ck-snooker-live.hf.space' : 'http://localhost:3001';

interface TournamentMatch {
    id: string;
    player1: string | null;
    player2: string | null;
    winner: string | null;
    tableId: string | null;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface Tournament {
    id: string;
    status: 'ACTIVE' | 'COMPLETED';
    players: string[];
    bracket: TournamentMatch[][];
    champion: string | null;
}

export default function TournamentBracket() {
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Fetch initial state
        const fetchTournament = async () => {
            try {
                const res = await fetch(`${API_URL}/api/tournament`);
                const data = await res.json();
                if (data) setTournament(data);
            } catch (e) {
                console.error('Failed to fetch tournament', e);
            }
        };
        fetchTournament();

        // Listen for live updates
        const socket = io(API_URL);
        socket.on('tournament_updated', (data: Tournament | null) => {
            setTournament(data);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    if (!tournament) {
        return (
            <div className="tournament-empty premium-bg">
                <h1>🏆 Tournoi en direct 🏆</h1>
                <p>Aucun tournoi actif pour le moment.</p>
                <button className="btn-back" onClick={() => navigate('/')}>Retour Accueil</button>
            </div>
        );
    }

    const { bracket, champion } = tournament;

    return (
        <div className="tournament-container premium-bg">
            <button className="btn-back-absolute" onClick={() => navigate('/')}>⬅ Accueil</button>
            <h1 className="tournament-title">🏆 SNOOKER CHAMPIONS 🏆</h1>
            {champion && <h2 className="champion-title">CHAMPION: {champion} 🎉</h2>}

            <div className="bracket-wrapper">
                {bracket.map((round, roundIdx) => (
                    <div className="round-column" key={`round-${roundIdx}`}>
                        {/* <h3 className="round-name">Round {roundIdx + 1}</h3> */}
                        {round.map(match => (
                            <div className={`match-card ${match.status === 'IN_PROGRESS' ? 'active' : ''}`} key={match.id}>
                                <div className={`player-slot ${match.winner === match.player1 ? 'winner' : ''} ${match.player1 ? '' : 'tbd'}`}>
                                    {match.player1 || 'TBD'}
                                </div>
                                <div className={`player-slot ${match.winner === match.player2 ? 'winner' : ''} ${match.player2 ? '' : 'tbd'}`}>
                                    {match.player2 || 'TBD'}
                                </div>
                                {match.tableId && <div className="match-table">📌 {match.tableId}</div>}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
