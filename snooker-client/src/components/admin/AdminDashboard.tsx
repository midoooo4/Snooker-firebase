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
    const [activeTab, setActiveTab] = useState<'STATS' | 'TOURNAMENT' | 'APPEARANCE'>('STATS');
    const [appTheme, setAppTheme] = useState('emerald');
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
            if (confData.appTheme) {
                setAppTheme(confData.appTheme);
            }

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

    const saveAppTheme = async (theme: string) => {
        try {
            const token = localStorage.getItem('admin_token');
            const res = await fetch(`${API_URL}/api/admin/config/theme`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ theme })
            });
            if (res.ok) {
                setAppTheme(theme);
            }
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
            <div className="premium-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="glass-panel" style={{ maxWidth: '400px', width: '90%', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔐</div>
                    <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 900 }}>Admin Login</h2>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: '2rem' }}>Accès réservé aux administrateurs</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input
                            type="password"
                            placeholder="Mot de passe"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && loginAdmin()}
                            className="input-premium"
                            style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '0.2em' }}
                        />
                        <button onClick={loginAdmin} className="launch-btn launch-btn-remote">
                            Accéder au Panneau
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="premium-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '1.5rem' }}>
            <div className="glass-panel main-panel" style={{ maxWidth: '800px', width: '100%' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>🛡️ Panneau Administration</h1>
                    <button
                        className="fab-btn"
                        onClick={() => { fetchStats(); fetchConfigAndTournament(); }}
                    >
                        🔄 Rafraîchir
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="segmented-control" style={{ width: '100%', marginBottom: '2rem' }}>
                    <button
                        className={`segment-btn ${activeTab === 'STATS' ? 'active' : ''}`}
                        onClick={() => setActiveTab('STATS')}
                        style={activeTab === 'STATS' ? { background: '#3498db', boxShadow: '0 4px 15px rgba(52,152,219,0.4)' } : {}}
                    >
                        📊 Statistiques
                    </button>
                    <button
                        className={`segment-btn ${activeTab === 'TOURNAMENT' ? 'active' : ''}`}
                        onClick={() => setActiveTab('TOURNAMENT')}
                        style={activeTab === 'TOURNAMENT' ? { background: 'linear-gradient(135deg, #f1c40f, #e67e22)', color: '#000', boxShadow: '0 4px 15px rgba(241,196,15,0.4)' } : {}}
                    >
                        🏆 Tournois & Tables
                    </button>
                    <button
                        className={`segment-btn ${activeTab === 'APPEARANCE' ? 'active' : ''}`}
                        onClick={() => setActiveTab('APPEARANCE')}
                        style={activeTab === 'APPEARANCE' ? { background: 'linear-gradient(135deg, #00d2ff, #f39c12)', color: '#000', boxShadow: '0 4px 15px rgba(0, 210, 255, 0.4)' } : {}}
                    >
                        🎨 Apparence
                    </button>
                </div>

                {/* ─── STATS TAB ─── */}
                {activeTab === 'STATS' && (
                    <>
                        {/* Stat Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                            {[
                                { label: 'REVENUS TOTAUX', value: `${calculatedTotalEarnings} DH`, color: '#2ecc71', bg: 'rgba(46,204,113,0.08)', border: 'rgba(46,204,113,0.2)' },
                                { label: 'À ENCAISSER', value: `${totalOwed} DH`, color: '#f1c40f', bg: 'rgba(241,196,15,0.08)', border: 'rgba(241,196,15,0.2)' },
                                { label: 'FRAMES JOUÉES', value: `${totalFramesPlayed}`, color: '#3498db', bg: 'rgba(52,152,219,0.08)', border: 'rgba(52,152,219,0.2)' },
                                { label: 'PAIEMENTS', value: null, color: '#fff', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', isPayments: true },
                            ].map((card: any) => (
                                <div key={card.label} style={{ background: card.bg, padding: '1.25rem', borderRadius: '16px', border: `1px solid ${card.border}` }}>
                                    <div style={{ fontSize: '0.65rem', color: card.color, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', marginBottom: '0.4rem', opacity: 0.8 }}>{card.label}</div>
                                    {card.isPayments ? (
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem' }}>
                                            <span style={{ color: '#2ecc71' }}>{statEntries.filter(([, s]) => s.losses > 0 && s.amountOwed === 0).length} PAID</span>
                                            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }}>|</span>
                                            <span style={{ color: '#e74c3c' }}>{statEntries.filter(([, s]) => s.amountOwed > 0).length} DÛS</span>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: card.color }}>{card.value}</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Players Table */}
                        <div style={{ marginBottom: '2rem' }}>
                            {/* Header Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.5fr 0.5fr 1fr 1.5fr', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <div>Joueur</div>
                                <div style={{ textAlign: 'center', color: '#2ecc71' }}>V</div>
                                <div style={{ textAlign: 'center', color: '#e74c3c' }}>D</div>
                                <div style={{ textAlign: 'center' }}>Status</div>
                                <div style={{ textAlign: 'right', color: '#f1c40f' }}>Tarif</div>
                            </div>
                            <div className="stats-table-wrapper">
                                {statEntries.map(([name, s]) => (
                                    <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 0.5fr 0.5fr 1fr 1.5fr', alignItems: 'center', padding: '1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{name}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{s.matches} frame{s.matches > 1 ? 's' : ''}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', color: '#2ecc71', fontWeight: 800 }}>{s.wins}</div>
                                        <div style={{ textAlign: 'center', color: '#e74c3c', fontWeight: 800 }}>{s.losses}</div>
                                        <div style={{ textAlign: 'center' }}>
                                            {s.amountOwed > 0 ? (
                                                <span style={{ background: 'rgba(231,76,60,0.2)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.4)', padding: '3px 10px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 800 }}>DÛ</span>
                                            ) : (
                                                s.losses > 0 && <span style={{ background: 'rgba(46,204,113,0.2)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.4)', padding: '3px 10px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 800 }}>PAYÉ</span>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            {s.amountOwed > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                                                    <span style={{ color: '#f1c40f', fontWeight: 900, fontSize: '1.05rem' }}>{s.amountOwed} DH</span>
                                                    <button onClick={() => markPaid(name)} style={{ padding: '5px 10px', background: 'linear-gradient(135deg,#2ecc71,#27ae60)', color: 'black', border: 'none', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>✓ Marquer Payé</button>
                                                </div>
                                            ) : (
                                                <span style={{ color: '#2ecc71', fontWeight: 700 }}>✓ 0 DH</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button onClick={archiveDailyReports} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, rgba(230,126,34,0.3), rgba(211,84,0,0.3))', border: '1px solid rgba(230,126,34,0.4)', color: '#e67e22', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}>
                                🌅 Archiver la Journée (Nouvelle Session)
                            </button>
                            <button onClick={resetAllStats} style={{ width: '100%', padding: '1rem', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', color: '#e74c3c', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}>
                                🗑️ Réinitialiser toutes les statistiques
                            </button>
                        </div>
                    </>
                )}

                {/* ─── TOURNAMENT TAB ─── */}
                {activeTab === 'TOURNAMENT' && (
                    <>
                        {/* Table Config */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>⚙️ Configuration des Tables</h3>
                            <div className="config-row">
                                <label style={{ minWidth: '180px', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Nombre de tables actives :</label>
                                <div className="config-actions">
                                    <input type="number" min="1" max="10" value={tablesCount} onChange={e => setTablesCount(parseInt(e.target.value) || 1)} className="input-premium" style={{ width: '70px', textAlign: 'center', padding: '0.6rem' }} />
                                    <button onClick={saveTablesCount} className="fab-btn gold">Enregistrer</button>
                                </div>
                            </div>
                            <div className="config-row" style={{ marginBottom: 0 }}>
                                <label style={{ minWidth: '180px', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>💰 Tarif par frame :</label>
                                <div className="config-actions">
                                    <input type="number" min="5" max="500" value={pricePerFrame} onChange={e => setPricePerFrame(parseInt(e.target.value) || 20)} className="input-premium" style={{ width: '70px', textAlign: 'center', padding: '0.6rem' }} />
                                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>DH</span>
                                    <button onClick={savePricePerFrame} className="fab-btn gold">Enregistrer</button>
                                </div>
                            </div>
                        </div>

                        {/* Tournament Management */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(241,196,15,0.15)' }}>
                            <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', fontWeight: 800, color: '#f1c40f' }}>🏆 Gestion du Tournoi</h3>

                            {!tournament ? (
                                <>
                                    <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem' }}>Saisissez les joueurs séparés par des virgules (,).</p>
                                    <textarea
                                        value={tournamentPlayers}
                                        onChange={e => setTournamentPlayers(e.target.value)}
                                        placeholder="Ex: Ahmed, Tarik, Yassine, Oussama, Karim"
                                        style={{ width: '100%', height: '80px', padding: '0.85rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', marginBottom: '1rem', boxSizing: 'border-box', resize: 'none', fontSize: '0.9rem' }}
                                    />
                                    <button onClick={startTournament} className="launch-btn" style={{ background: 'linear-gradient(135deg,#f1c40f,#e67e22)', color: '#000', fontWeight: 900, boxShadow: '0 8px 20px rgba(241,196,15,0.3)' }}>
                                        🎲 Tirage au Sort & Démarrer le Tournoi
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div>
                                            <h4 style={{ margin: 0, color: '#2ecc71', fontSize: '1rem' }}>Tournoi en Cours</h4>
                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{tournament.status}</span>
                                        </div>
                                        <button onClick={clearTournament} style={{ background: 'rgba(231,76,60,0.2)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Arrêter / Effacer</button>
                                    </div>

                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.6rem' }}>Matchs en Attente</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                        {tournament.bracket.map((round: any[]) => round.filter((m: any) => m.status === 'PENDING' && m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE').map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '0.8rem 1rem', borderRadius: '10px', borderLeft: '3px solid #f1c40f', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.9rem' }}><strong style={{ color: '#f1c40f' }}>{m.id}</strong> · {m.player1} <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span> {m.player2}</span>
                                                <button onClick={() => assignMatch(m.id)} style={{ background: 'rgba(52,152,219,0.2)', color: '#3498db', border: '1px solid rgba(52,152,219,0.3)', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>Assigner →</button>
                                            </div>
                                        )))}
                                        {tournament.bracket.flatMap((r: any[]) => r).filter((m: any) => m.status === 'PENDING' && m.player1 && m.player2 && m.player1 !== 'BYE' && m.player2 !== 'BYE').length === 0 && (
                                            <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: '0.9rem', padding: '0.5rem 0' }}>Aucun match prêt à être assigné.</div>
                                        )}
                                    </div>

                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.6rem' }}>Matchs en Cours</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {tournament.bracket.map((round: any[]) => round.filter((m: any) => m.status === 'IN_PROGRESS').map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '0.8rem 1rem', borderRadius: '10px', borderLeft: '3px solid #2ecc71', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.9rem' }}><strong style={{ color: '#2ecc71' }}>{m.id}</strong> · {m.player1} <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span> {m.player2}</span>
                                                <span style={{ fontSize: '0.75rem', background: 'rgba(231,76,60,0.2)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)', padding: '3px 10px', borderRadius: '20px', fontWeight: 700 }}>{m.tableId}</span>
                                            </div>
                                        )))}
                                        {tournament.bracket.flatMap((r: any[]) => r).filter((m: any) => m.status === 'IN_PROGRESS').length === 0 && (
                                            <div style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: '0.9rem', padding: '0.5rem 0' }}>Aucun match en cours.</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* ─── APPEARANCE TAB ─── */}
                {activeTab === 'APPEARANCE' && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--theme-primary)' }}>🎨 Thème de l'Application</h3>
                        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>Sélectionnez l'ambiance visuelle pour les écrans et la TV.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                            {[
                                { id: 'emerald', label: 'Emerald', colors: ['#2ecc71', '#0d1218'] },
                                { id: 'ocean', label: 'Ocean', colors: ['#00d2ff', '#0f2027'] },
                                { id: 'gold', label: 'Gold', colors: ['#f1c40f', '#000000'] },
                                { id: 'midnight', label: 'Midnight', colors: ['#7f8fa6', '#111111'] },
                                { id: 'triangle', label: 'Triangle', colors: ['#00d2ff', '#ff0080'] },
                                { id: 'waves', label: 'Waves', colors: ['#00d2ff', '#0080ff'] },
                                { id: 'grid', label: 'Grid', colors: ['#ff2d55', '#00b894'] },
                                { id: 'carbon', label: 'Carbon', colors: ['#ff6b21', '#333333'] },
                                { id: 'city', label: 'City', colors: ['#00d2ff', '#ff7675'] },
                                { id: 'abstract', label: 'Abstract', colors: ['#4a69bd', '#1e3799'] },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => saveAppTheme(t.id)}
                                    style={{
                                        position: 'relative',
                                        background: `linear-gradient(135deg, ${t.colors[1]}, #000)`,
                                        border: `2px solid ${appTheme === t.id ? t.colors[0] : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '12px',
                                        padding: '1.5rem 1rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.8rem',
                                        boxShadow: appTheme === t.id ? `0 0 15px ${t.colors[0]}40` : 'none'
                                    }}
                                >
                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.colors[0], boxShadow: `0 0 10px ${t.colors[0]}`, opacity: 0.9 }} />
                                    <span style={{ color: appTheme === t.id ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{t.label}</span>
                                    {appTheme === t.id && (
                                        <div style={{ position: 'absolute', top: '8px', right: '8px', color: t.colors[0] }}>✓</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '2rem', paddingTop: '1.25rem', textAlign: 'center' }}>
                    <button onClick={logoutAdmin} style={{ background: 'transparent', color: 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', transition: 'color 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#e74c3c')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                    >
                        Déconnexion Admin
                    </button>
                </div>
            </div>
        </div>
    );
}
