import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useSocket } from './hooks/useSocket';
import type { DropResult } from '@hello-pangea/dnd';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import './App.css';

import TvView from './components/tv/TvView';
import MobileRemote from './components/mobile/MobileRemote';
import AdminDashboard from './components/admin/AdminDashboard';
import TournamentBracket from './components/tournament/TournamentBracket';

// --- StrictModeDroppable for React 18 ---

const StrictModeDroppable = ({ children, ...props }: any) => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);
  if (!enabled) {
    return null;
  }
  return <Droppable {...props}>{children}</Droppable>;
};

interface PlayerStat {
  wins: number;
  losses: number;
  matches: number;
  amountOwed: number;
  totalPaid?: number;
}

function Home() {
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [matchType, setMatchType] = useState('FRAME_UNIQUE');
  const [stats, setStats] = useState<Record<string, PlayerStat>>({});
  const [showStats, setShowStats] = useState(false);
  const [nextPlayerName, setNextPlayerName] = useState('');
  const [tablesCount, setTablesCount] = useState(1);
  const [selectedTable, setSelectedTable] = useState('TABLE1');
  const [tournament, setTournament] = useState<any>(null);
  const [isTournamentMatch, setIsTournamentMatch] = useState(false);
  const [localQueue, setLocalQueue] = useState<string[]>([]); // Optimistic UI

  const { gameState: tableState } = useSocket(selectedTable);

  const navigate = useNavigate();

  const API_URL = import.meta.env.PROD ? 'https://ero0ck-snooker-live.hf.space' : 'http://localhost:3001';

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/api/config/tables`);
      const data = await res.json();
      console.log('[DEBUG] Config fetched:', data);
      if (data && typeof data.count === 'number') {
        setTablesCount(data.count);
      }
    } catch (e) {
      console.error('Failed to fetch config', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  const fetchTournament = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tournament`);
      const data = await res.json();
      setTournament(data);
    } catch (e) {
      console.error('Failed to fetch tournament', e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchConfig();
    fetchTournament();

    // Listen for realtime config updates
    const socket = io(API_URL);
    socket.on('config_updated', (data: { activeTablesCount: number, appTheme?: string }) => {
      console.log('[DEBUG] Config updated via socket:', data);
      if (data && typeof data.activeTablesCount === 'number') {
        setTablesCount(data.activeTablesCount);
      }
    });

    socket.on('tournament_updated', (data: any) => {
      setTournament(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const location = useLocation();

  // Fullscreen toggle for TV & Remote view
  useEffect(() => {
    const isTv = location.pathname.includes('/tv/');
    const isRemote = location.pathname.includes('/remote/');
    if (isTv || isRemote) {
      document.body.classList.add('full-screen-app');
    } else {
      document.body.classList.remove('full-screen-app');
    }
  }, [location]);

  // Lobby Automation: Sync names from table state or tournament
  useEffect(() => {
    // Check if the selected table is assigned to an active tournament match
    let tournamentMatchFound = false;
    if (tournament && tournament.bracket) {
      for (const round of tournament.bracket) {
        const assignedMatch = round.find((m: any) => m.tableId === selectedTable && m.status !== 'COMPLETED');
        if (assignedMatch) {
          setPlayer1(assignedMatch.player1 || 'TBD');
          setPlayer2(assignedMatch.player2 || 'TBD');
          setIsTournamentMatch(true);
          tournamentMatchFound = true;
          break;
        }
      }
    }

    // Fallback to local table state if no tournament match is active for this table
    if (!tournamentMatchFound) {
      setIsTournamentMatch(false);
      if (tableState?.players && tableState.players.length >= 2) {
        setPlayer1(tableState.players[0] || '');
        setPlayer2(tableState.players[1] || '');
      }
    }

    // Sync local queue when tableState changes (if not dragging)
    if (tableState?.queue) {
      setLocalQueue(tableState.queue);
    }
  }, [tableState?.players, tableState?.queue, selectedTable, tournament]);

  const joinAsRemote = () => {
    const isActuallyInProgress = tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver;
    const params = new URLSearchParams();
    
    // Only force a full reset if no match is currently active on this table
    if (!isActuallyInProgress) {
      params.set('reset', 'true');
    }
    
    // Always pass names and type so we can update them without resetting the score
    params.set('p1', player1);
    params.set('p2', player2);
    params.set('type', matchType);
    
    navigate(`/remote/${selectedTable}?${params.toString()}`);
  };

  const joinAsTv = () => {
    const isActuallyInProgress = tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver;
    const params = new URLSearchParams();
    
    if (!isActuallyInProgress) {
      params.set('p1', player1);
      params.set('p2', player2);
      params.set('type', matchType);
    }
    
    navigate(`/tv/${selectedTable}?${params.toString()}`);
  };

  const addNextPlayerContext = async () => {
    if (!nextPlayerName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: selectedTable, playerName: nextPlayerName })
      });
      if (res.ok) {
        setNextPlayerName('');
      } else {
        alert('Erreur lors de l’ajout du joueur.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const removeQueuePlayer = async (index: number) => {
    try {
      const res = await fetch(`${API_URL}/api/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: selectedTable, index })
      });
      if (!res.ok) alert('Erreur lors de la suppression.');
    } catch (e) {
      console.error(e);
    }
  };

  const editQueuePlayer = async (index: number) => {
    const currentName = tableState?.queue?.[index] || '';
    const newName = prompt('Entrez le nouveau nom:', currentName);
    if (!newName || newName === currentName) return;
    try {
      const res = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: selectedTable, index, newName })
      });
      if (!res.ok) alert('Erreur lors de la modification.');
    } catch (e) {
      console.error(e);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const startIndex = result.source.index;
    const endIndex = result.destination.index;

    if (startIndex === endIndex) return;

    // --- Optimistic Update ---
    const reordered = Array.from(localQueue);
    const [removed] = reordered.splice(startIndex, 1);
    reordered.splice(endIndex, 0, removed);
    setLocalQueue(reordered);

    try {
      const res = await fetch(`${API_URL}/api/queue/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: selectedTable, startIndex, endIndex })
      });
      if (!res.ok) {
        // Rollback on error
        setLocalQueue(tableState?.queue || []);
        alert('Erreur lors de la réorganisation.');
      }
    } catch (e) {
      console.error('Failed to reorder queue', e);
      setLocalQueue(tableState?.queue || []);
    }
  };

  const statEntries = Object.entries(stats);
  const totalOwed = statEntries.reduce((sum, [, s]) => sum + s.amountOwed, 0);

  return (
    <div className="app-container premium-bg">
      <div className="home-layout">

        {/* ── MAIN MATCH CONFIG PANEL ── */}
        <div className="glass-panel main-panel">

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ margin: '0 0 1rem 0', fontSize: '2rem', fontWeight: 900, color: '#fff' }}>🎱 Snooker Pro</h1>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button className="btn-premium gold" onClick={() => navigate('/tournament')} style={{ padding: '0.6rem 1rem', fontSize: '1rem' }}>🏆 Tournoi</button>
              <button className="btn-premium secondary" onClick={() => navigate('/admin')} style={{ padding: '0.6rem 0.9rem', width: 'auto' }}>⚙️</button>
            </div>
          </div>

          {/* Table Selector */}
          {tablesCount > 1 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p className="input-label" style={{ marginBottom: '0.75rem', display: 'block' }}>🎯 Sélectionner la Table</p>
              <div className="segmented-control" style={{ width: '100%' }}>
                {Array.from({ length: tablesCount }).map((_, i) => (
                  <button
                    key={`table-${i}`}
                    className={`segment-btn ${selectedTable === `TABLE${i + 1}` ? 'active' : ''}`}
                    onClick={() => setSelectedTable(`TABLE${i + 1}`)}
                  >
                    Table {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p style={{ marginBottom: '1.75rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontSize: '0.85rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Configuration · {selectedTable}
          </p>

          {/* Players */}
          {isTournamentMatch ? (
            <div className="tournament-match-banner">
              <h3>🏆 MATCH DE TOURNOI 🏆</h3>
              <div className="tournament-vs-row">
                <span className="player left">{player1}</span>
                <span className="vs-badge">VS</span>
                <span className="player right">{player2}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="input-group">
                <label className="input-label">👤 Player 1</label>
                <input
                  type="text"
                  value={player1}
                  onChange={e => setPlayer1(e.target.value)}
                  className="input-premium"
                  placeholder="Nom du joueur"
                />
              </div>
              <div className="input-group">
                <label className="input-label" style={{ color: tableState?.queue?.length ? '#2ecc71' : undefined }}>
                  {tableState?.queue?.length ? '👤 Suivant ›' : '👤 Player 2'}
                </label>
                <input
                  type="text"
                  value={player2}
                  onChange={e => setPlayer2(e.target.value)}
                  className={`input-premium ${tableState?.queue?.length ? 'highlight' : ''}`}
                  placeholder="Nom du joueur"
                />
              </div>
            </div>
          )}

          {/* Match Format */}
          <div style={{ marginBottom: '2rem' }}>
            <label className="input-label" style={{ marginBottom: '0.75rem', display: 'block' }}>🏁 Match Format</label>
            <select value={matchType} onChange={e => setMatchType(e.target.value)} className="input-premium">
              <option value="FRAME_UNIQUE">Match Normal (1 Frame)</option>
              <option value="3">Défi A2 (Best of 3)</option>
              <option value="5">Défi A3 (Best of 5)</option>
              <option value="7">Défi A4 (Best of 7)</option>
            </select>
          </div>

          {/* Launch Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button onClick={joinAsRemote} className="btn-premium primary">
              📱 {tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver ? 'Reprendre le Match' : 'Lancer le Remote'}
            </button>
            <button onClick={joinAsTv} className="btn-premium secondary">
              📺 Affichage TV
            </button>
          </div>
        </div>
        {/* ── QUEUE PANEL ── */}
        {!isTournamentMatch && (
          <div className="glass-panel">
            <h2 className="section-header">👤 Ajouter le Joueur Suivant</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Nom du Joueur</label>
                <input
                  className="input-premium"
                  value={nextPlayerName}
                  onChange={e => setNextPlayerName(e.target.value)}
                  placeholder="Ex: Ahmed"
                />
              </div>
              <button
                className="btn-premium accent"
                onClick={addNextPlayerContext}
              >
                ➕ Ajouter à la File
              </button>
            </div>

            {tableState?.queue && (tableState.queue as string[]).length > 0 && (
              <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.85rem', marginBottom: '1.25rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  File d'Attente ({(tableState.queue as string[]).length})
                </h3>
                <DragDropContext onDragEnd={onDragEnd}>
                  <StrictModeDroppable droppableId="queue-list">
                    {(provided: any) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {localQueue.map((name: string, idx: number) => (
                          <Draggable key={`${name}-${idx}`} draggableId={`${name}-${idx}`} index={idx}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`queue-card ${snapshot.isDragging ? 'dragging' : ''}`}
                                style={{ ...provided.draggableProps.style }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span {...provided.dragHandleProps} style={{ cursor: 'grab', color: 'rgba(255,255,255,0.2)', fontSize: '1.1rem' }}>⠿</span>
                                  <span className="queue-pill-num">{idx + 1}</span>
                                  <span style={{ fontWeight: 600 }}>{name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button onClick={() => editQueuePlayer(idx)} className="action-btn edit-btn">✏️</button>
                                  <button onClick={() => removeQueuePlayer(idx)} className="action-btn delete-btn">🗑️</button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </StrictModeDroppable>
                </DragDropContext>
              </div>
            )}
          </div>
        )}

        {/* ── STATS PANEL ── */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 800 }}>📊 Statistiques <span style={{ fontSize: '0.75rem', opacity: 0.5, fontWeight: 400 }}>({statEntries.length} joueurs)</span></h2>
            <button
              className="fab-btn"
              onClick={() => { setShowStats(!showStats); if (!showStats) fetchStats(); }}
            >
              {showStats ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {showStats && (
            <>
              {statEntries.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem 0' }}>Aucune statistique disponible.</p>
              ) : (
                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Joueur</th>
                        <th className="center" style={{ color: '#2ecc71' }}>V</th>
                        <th className="center" style={{ color: '#e74c3c' }}>D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statEntries as [string, PlayerStat][]).map(([name, s]) => (
                        <tr key={name}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{s.matches} match{s.matches > 1 ? 's' : ''}</div>
                          </td>
                          <td style={{ textAlign: 'center' }} className="text-win">{s.wins}</td>
                          <td style={{ textAlign: 'center' }} className="text-loss">{s.losses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {totalOwed > 0 && (
                <div className="owed-banner">
                  <span className="amount">💰 Total à payer : {totalOwed} DH</span>
                  <span className="subtext">20 DH par match perdu</span>
                </div>
              )}
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginTop: '1.25rem', textAlign: 'center' }}>
                Accédez au panneau admin ⚙️ pour archiver ou gérer les paiements.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/remote/:roomCode" element={<MobileRemote />} />
      <Route path="/tv/:roomCode" element={<TvView />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/tournament" element={<TournamentBracket />} />
    </Routes>
  );
}

export default App;
