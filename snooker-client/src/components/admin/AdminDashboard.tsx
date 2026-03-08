import { useState, useEffect } from 'react';

interface PlayerStat {
    wins: number;
    losses: number;
    matches: number;
    amountOwed: number;
    totalPaid?: number;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Record<string, PlayerStat>>({});
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [showAdminLogin, setShowAdminLogin] = useState(true);

    // Admin Tabs
    const [activeTab, setActiveTab] = useState<'STATS' | 'TOURNAMENT'>('STATS');
    const [tablesCount, setTablesCount] = useState(1);
    const [pricePerFrame, setPricePerFrame] = useState(20);
    const [tournamentPlayers, setTournamentPlayers] = useState('');
    const [tournament, setTournament] = useState<any>(null);

    const API_URL = import.meta.env.PROD ? 'https://ero0ck-snooker-live.hf.space' : 'http://localhost:3001';

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/stats`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch stats', e);
        }
    };

    const checkAdminStatus = async () => {
        try {
            const token = localStorage.getItem('admin_token');
            if (!token) return;

            const res = await fetch(`${API_URL}/api/admin/check`, {
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setIsAdmin(true);
                setShowAdminLogin(false);
                fetchStats();
                fetchConfigAndTournament();
            }
        } catch (e) {
            console.error('Failed to check admin status', e);
        }
    };

    const fetchConfigAndTournament = async () => {
        try {
            const resConf = await fetch(`${API_URL}/api/config/tables`);
            const confData = await resConf.json();
            if (confData.count) setTablesCount(confData.count);
            if (confData.pricePerFrame) setPricePerFrame(confData.pricePerFrame);

            const resTour = await fetch(`${API_URL}/api/tournament`);
            const tourData = await resTour.json();
            setTournament(tourData);
        } catch (e) {
            console.error('Failed to fetch config or tournament', e);
        }
    };

    useEffect(() => {
        checkAdminStatus();
    }, []);

    const loginAdmin = async () => {
        try {
            const trimmedPassword = adminPassword.trim();
            // Cache busting URL
            const res = await fetch(`${API_URL}/api/admin/login?cb=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: trimmedPassword }),
                credentials: 'include'
            });
            const data = await res.json();
            if (res.ok) {
                if (data.token && data.v === 2) {
                    localStorage.setItem('admin_token', data.token);
                    setIsAdmin(true);
                    setShowAdminLogin(false);
                    setAdminPassword('');
                    fetchStats();
                } else {
                    alert(`Serveur obsolète détecté (V1). Attendez que Hugging Face finisse la mise à jour (V2). (DEBUG: ${JSON.stringify(data)})`);
                }
            } else {
                alert(`Mot de passe incorrect ou erreur serveur (${res.status})`);
            }
        } catch (e) {
            console.error('Failed to log in', e);
            alert('Erreur de connexion au serveur.');
        }
    };

    const logoutAdmin = async () => {
        try {
            const token = localStorage.getItem('admin_token');
            await fetch(`${API_URL}/api/admin/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            localStorage.removeItem('admin_token');
            setIsAdmin(false);
            setShowAdminLogin(true);
        } catch (e) {
            console.error(e);
        }
    };

    const markPaid = async (playerName: string) => {
        if (!confirm(`Confirmer que ${playerName} a payé ?`)) return;
        try {
            const token = localStorage.getItem('admin_token');
            if (!token) {
                alert('Erreur: Aucun token trouvé. Veuillez vous reconnecter.');
                return;
            }

            // Log exactly what is being sent for debugging
            console.log(`Sending markPaid for ${playerName} to ${API_URL}/api/admin/stats/pay`);

            const res = await fetch(`${API_URL}/api/admin/stats/pay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ playerName }),
                credentials: 'include'
            });

            if (res.ok) {
                fetchStats();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erreur Serveur (${res.status}): ${JSON.stringify(errorData)}`);
            }
        } catch (e) {
            console.error('Network Error marking paid:', e);
            alert(`Erreur Réseau: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const archiveDailyReports = async () => {
        if (!confirm('Voulez-vous vraiment archiver la journée ? Cela remettra toutes les statistiques (victoires, défaites) et fermera la session du jour !')) return;
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/daily-archive`, {
                method: 'POST',
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                alert('Journée archivée avec succès !');
                fetchStats();
            } else {
                alert('Erreur lors de l’archivage.');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const resetAllStats = async () => {
        if (!confirm('Voulez-vous vraiment réinitialiser toutes les statistiques ? Cette action est irréversible.')) return;
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/stats`, {
                method: 'DELETE',
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                alert('Statistiques réinitialisées avec succès !');
                fetchStats();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erreur (${res.status}): ${errorData.error || 'Impossible de réinitialiser.'}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Erreur de connexion: ${e instanceof Error ? e.message : 'Erreur réseau'}`);
        }
    };

    const saveTablesCount = async () => {
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/config/tables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ count: tablesCount })
            });
            if (res.ok) {
                alert('Nombre de tables mis à jour !');
                fetchConfigAndTournament();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const savePricePerFrame = async () => {
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/config/price`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ price: pricePerFrame })
            });
            if (res.ok) alert(`Tarif mis à jour : ${pricePerFrame} DH / frame !`);
        } catch (e) {
            console.error(e);
        }
    };

    const startTournament = async () => {
        const players = tournamentPlayers.split(',').map(p => p.trim()).filter(p => p.length > 0);
        if (players.length < 2) return alert('Entrez au moins 2 joueurs séparés par des virgules.');
        if (!confirm('Tirer au sort et commencer le tournoi ?')) return;

        try {
            console.log(`[DEBUG] Starting tournament with players:`, players);
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/tournament/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ players })
            });

            if (res.ok) {
                alert('Tournoi démarré avec succès !');
                fetchConfigAndTournament();
            } else {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert(`Erreur lors du démarrage du tournoi (${res.status}): ${err.error || 'Erreur inconnue'}`);
            }
        } catch (e) {
            console.error('[DEBUG] startTournament catch:', e);
            alert(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const clearTournament = async () => {
        if (!confirm('Are you sure you want to clear the active tournament?')) return;
        try {
            const token = localStorage.getItem('admin_token');
            await fetch(`${API_URL}/api/admin/tournament/clear`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchConfigAndTournament();
        } catch (e) {
            console.error(e);
        }
    };

    const assignMatch = async (matchId: string) => {
        const tableStr = prompt(`Assigner le match ${matchId} à quelle table ? (ex: 1 pour TABLE1, ou laissez vide pour la premiere dispo)`);
        if (!tableStr) return;
        const tableId = `TABLE${tableStr}`;
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/tournament/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ matchId, tableId })
            });
            if (res.ok) {
                fetchConfigAndTournament();
                alert(`Match assigné à ${tableId}`);
            } else {
                alert('Erreur: Impossible d\'assigner ce match.');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const statEntries = Object.entries(stats);
    const totalOwed = statEntries.reduce((sum, [, s]) => sum + s.amountOwed, 0);
    // Total frames played across all players / 2 (since each frame is recorded for both players)
    const totalFramesPlayed = Math.floor(statEntries.reduce((sum, [, s]) => sum + s.matches, 0) / 2);
    const calculatedTotalEarnings = totalFramesPlayed * pricePerFrame;

    if (showAdminLogin && !isAdmin) {
        return (
            <div className="app-container flex-center" style={{ minHeight: '100vh' }}>
                <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
                    <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🔐 Admin Login</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            type="password"
                            placeholder="Mot de passe"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && loginAdmin()}
                            style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 'var(--radius-sm)' }}
                        />
                        <button onClick={loginAdmin} style={{ padding: '1rem', background: 'var(--color-accent-green)', color: 'black', fontWeight: 'bold', borderRadius: 'var(--radius-full)', border: 'none' }}>Accéder au Panneau</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container" style={{ padding: '1.5rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ margin: 0 }}>🛡️ Panneau Administration</h1>
                    <button onClick={() => { fetchStats(); fetchConfigAndTournament(); }} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>🔄 Rafraîchir</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', marginBottom: '2rem' }}>
                    <button
                        onClick={() => setActiveTab('STATS')}
                        style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'STATS' ? '#3498db' : 'gray', borderBottom: activeTab === 'STATS' ? '2px solid #3498db' : 'none', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                        STATISTIQUES
                    </button>
                    <button
                        onClick={() => setActiveTab('TOURNAMENT')}
                        style={{ padding: '1rem', background: 'none', border: 'none', color: activeTab === 'TOURNAMENT' ? '#f1c40f' : 'gray', borderBottom: activeTab === 'TOURNAMENT' ? '2px solid #f1c40f' : 'none', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                        🏆 TOURNOIS & TABLES
                    </button>
                </div>

                {activeTab === 'STATS' && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
                                <div style={{ fontSize: '0.7rem', color: '#2ecc71', opacity: 0.8, textTransform: 'uppercase', fontWeight: 'bold' }}>REVENUS TOTAUX</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2ecc71', marginTop: '0.25rem' }}>{calculatedTotalEarnings} DH</div>
                            </div>
                            <div style={{ background: 'rgba(241, 196, 15, 0.1)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(241, 196, 15, 0.2)' }}>
                                <div style={{ fontSize: '0.7rem', color: '#f1c40f', opacity: 0.8, textTransform: 'uppercase', fontWeight: 'bold' }}>À ENCAISSER</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f1c40f', marginTop: '0.25rem' }}>{totalOwed} DH</div>
                            </div>
                            <div style={{ background: 'rgba(52, 152, 219, 0.1)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(52, 152, 219, 0.2)' }}>
                                <div style={{ fontSize: '0.7rem', color: '#3498db', opacity: 0.8, textTransform: 'uppercase', fontWeight: 'bold' }}>FRAMES JOUÉES</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3498db', marginTop: '0.25rem' }}>{totalFramesPlayed}</div>
                            </div>
                            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 'bold' }}>PAIEMENTS</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.25rem' }}>
                                    <span style={{ color: '#2ecc71' }}>{statEntries.filter(([, s]) => s.losses > 0 && s.amountOwed === 0).length} PAID</span>
                                    <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }}>|</span>
                                    <span style={{ color: '#e74c3c' }}>{statEntries.filter(([, s]) => s.amountOwed > 0).length} Dus</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ width: '100%', marginBottom: '2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.5fr 0.5fr 1fr 1.5fr', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                <div>Joueur</div>
                                <div style={{ textAlign: 'center', color: '#2ecc71' }}>V</div>
                                <div style={{ textAlign: 'center', color: '#e74c3c' }}>D</div>
                                <div style={{ textAlign: 'center' }}>Status</div>
                                <div style={{ textAlign: 'right', color: '#f1c40f' }}>Tarif</div>
                            </div>
                            {statEntries.map(([name, s]) => (
                                <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 0.5fr 0.5fr 1fr 1.5fr', alignItems: 'center', padding: '1.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{s.matches} frame{s.matches > 1 ? 's' : ''}</div>
                                    </div>
                                    <div style={{ textAlign: 'center', color: '#2ecc71', fontWeight: 'bold' }}>{s.wins}</div>
                                    <div style={{ textAlign: 'center', color: '#e74c3c', fontWeight: 'bold' }}>{s.losses}</div>
                                    <div style={{ textAlign: 'center' }}>
                                        {s.amountOwed > 0 ? (
                                            <span style={{ background: '#e74c3c', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold' }}>DUE</span>
                                        ) : (
                                            s.losses > 0 && <span style={{ background: '#2ecc71', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold' }}>PAID</span>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {s.amountOwed > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                                                <span style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: '1.1rem' }}>{s.amountOwed} DH</span>
                                                <button onClick={() => markPaid(name)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#2ecc71', color: 'black', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>✓ Marquer Payé</button>
                                            </div>
                                        ) : (
                                            <span style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: '0.9rem' }}>✓ 0 DH</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button onClick={archiveDailyReports} style={{ width: '100%', padding: '1rem', background: '#e67e22', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', cursor: 'pointer' }}>
                                🌅 Archiver la Journée (Nouvelle Session)
                            </button>
                            <button onClick={resetAllStats} style={{ width: '100%', padding: '1rem', background: '#c0392b', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 'bold', cursor: 'pointer' }}>
                                🗑️ Réinitialiser toutes les statistiques
                            </button>
                        </div>
                    </>
                )}

                {activeTab === 'TOURNAMENT' && (
                    <>
                        <div style={{ marginBottom: '2rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ marginTop: 0 }}>⚙️ Configuration des Tables</h3>
                            <div className="config-row">
                                <label style={{ minWidth: '180px' }}>Nombre de tables actives :</label>
                                <div className="config-actions">
                                    <input type="number" min="1" max="10" value={tablesCount} onChange={e => setTablesCount(parseInt(e.target.value) || 1)} style={{ padding: '0.5rem', width: '60px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white' }} />
                                    <button onClick={saveTablesCount} style={{ padding: '0.5rem 1rem', background: '#f1c40f', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Enregistrer</button>
                                </div>
                            </div>
                            <div className="config-row" style={{ marginBottom: 0 }}>
                                <label style={{ minWidth: '180px' }}>💰 Tarif par frame :</label>
                                <div className="config-actions">
                                    <input type="number" min="5" max="500" value={pricePerFrame} onChange={e => setPricePerFrame(parseInt(e.target.value) || 20)} style={{ padding: '0.5rem', width: '60px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white' }} />
                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>DH</span>
                                    <button onClick={savePricePerFrame} style={{ padding: '0.5rem 1rem', background: '#f1c40f', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Enregistrer</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ marginTop: 0, color: '#f1c40f' }}>🏆 Gestion du Tournoi</h3>

                            {!tournament ? (
                                <>
                                    <p style={{ fontSize: '0.9rem', color: 'gray', marginBottom: '1rem' }}>Saisissez les joueurs participant au tournoi, séparés par des virgules (,).</p>
                                    <textarea
                                        value={tournamentPlayers}
                                        onChange={e => setTournamentPlayers(e.target.value)}
                                        placeholder="Ex: Ahmed, Tarik, Yassine, Oussama, Karim"
                                        style={{ width: '100%', height: '100px', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', marginBottom: '1rem' }}
                                    />
                                    <button onClick={startTournament} style={{ width: '100%', padding: '1rem', background: '#f1c40f', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem' }}>
                                        🎲 Tirage au Sort & Démarrer le Tournoi
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h4 style={{ margin: 0, color: '#2ecc71' }}>Tournoi en Cours ({tournament.status})</h4>
                                        <button onClick={clearTournament} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Arrêter / Effacer</button>
                                    </div>

                                    {/* Unassigned pending matches */}
                                    <h5 style={{ color: 'gray', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Matchs en Attente (assignable à une table)</h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {tournament.bracket.map((round: any[]) => round.filter((m: any) => m.status === 'PENDING' && m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE').map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.5)', padding: '0.75rem', borderRadius: '4px', borderLeft: '4px solid #f1c40f', alignItems: 'center' }}>
                                                <span><strong>{m.id}</strong>: {m.player1} VS {m.player2}</span>
                                                <button onClick={() => assignMatch(m.id)} style={{ background: '#3498db', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Assigner à une Table</button>
                                            </div>
                                        )))}
                                        {tournament.bracket.flatMap((r: any[]) => r).filter((m: any) => m.status === 'PENDING' && m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE').length === 0 && (
                                            <div style={{ color: 'gray', fontStyle: 'italic', fontSize: '0.9rem' }}>Aucun match prêt à être assigné.</div>
                                        )}
                                    </div>

                                    <h5 style={{ color: 'gray', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Matchs en Cours</h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {tournament.bracket.map((round: any[]) => round.filter((m: any) => m.status === 'IN_PROGRESS').map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.5)', padding: '0.75rem', borderRadius: '4px', borderLeft: '4px solid #2ecc71', alignItems: 'center' }}>
                                                <span><strong>{m.id}</strong>: {m.player1} VS {m.player2}</span>
                                                <span style={{ fontSize: '0.8rem', background: '#e74c3c', padding: '2px 6px', borderRadius: '4px' }}>Table: {m.tableId}</span>
                                            </div>
                                        )))}
                                        {tournament.bracket.flatMap((r: any[]) => r).filter((m: any) => m.status === 'IN_PROGRESS').length === 0 && (
                                            <div style={{ color: 'gray', fontStyle: 'italic', fontSize: '0.9rem' }}>Aucun match en cours.</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '2rem', paddingTop: '1rem', textAlign: 'center' }}>
                    <button onClick={logoutAdmin} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>Déconnexion Admin</button>
                </div>
            </div>
        </div>
    );
}
