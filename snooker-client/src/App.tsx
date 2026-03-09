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
    socket.on('config_updated', (data: { activeTablesCount: number }) => {
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
    const isSameMatch = tableState?.players?.[0] === player1 && tableState?.players?.[1] === player2;
    const isMatchActive = isSameMatch && tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver;
    const params = new URLSearchParams();
    if (!isMatchActive) {
      params.set('p1', player1);
      params.set('p2', player2);
      params.set('type', matchType);
      params.set('reset', 'true');
    }
    navigate(`/remote/${selectedTable}?${params.toString()}`);
  };

  const joinAsTv = () => {
    const isSameMatch = tableState?.players?.[0] === player1 && tableState?.players?.[1] === player2;
    const isMatchActive = isSameMatch && tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver;
    const params = new URLSearchParams();
    if (!isMatchActive) {
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
    <div className="premium-bg">
      <div className="home-layout scale-in">
        <div className="glass-panel main-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>Snooker Pro</h1>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => navigate('/tournament')}
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', width: 'auto', fontSize: '0.9rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-gold)', boxShadow: '0 4px 15px var(--color-accent-gold-glow)' }}
              >
                🏆 Tournoi
              </button>
              <button onClick={() => navigate('/admin')} className="action-btn" style={{ fontSize: '1.25rem' }}>⚙️</button>
            </div>
          </div>

          <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {Array.from({ length: tablesCount }).map((_, i) => {
              const isActive = selectedTable === `TABLE${i + 1}`;
              return (
                <button
                  key={`table-${i}`}
                  onClick={() => setSelectedTable(`TABLE${i + 1}`)}
                  className={isActive ? "btn-primary" : "btn-outline"}
                  style={{
                    padding: '0.6rem 1.25rem',
                    width: 'auto',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--radius-full)',
                    background: isActive ? 'var(--color-accent-blue)' : 'transparent',
                    boxShadow: isActive ? '0 4px 15px rgba(52, 152, 219, 0.3)' : 'none',
                    borderColor: isActive ? 'var(--color-accent-blue)' : 'var(--color-border)'
                  }}
                >
                  Table {i + 1}
                </button>
              );
            })}
          </div>

          <div style={{ marginBottom: '2rem', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            CONFIGURER LA {selectedTable}
          </div>

          {isTournamentMatch ? (
            <div style={{ background: 'rgba(241, 196, 15, 0.15)', border: '1px solid rgba(241, 196, 15, 0.5)', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#f1c40f' }}>🏆 MATCH DE TOURNOI 🏆</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
                <span style={{ color: 'white', flex: 1, textAlign: 'right' }}>{player1}</span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>VS</span>
                <span style={{ color: 'white', flex: 1, textAlign: 'left' }}>{player2}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label>JOUEUR 1</label>
                <input type="text" value={player1} onChange={e => setPlayer1(e.target.value)} placeholder="Nom..." />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: tableState?.queue?.length ? 'var(--color-accent-green)' : 'var(--color-text-muted)', fontWeight: tableState?.queue?.length ? 800 : 700 }}>
                  {tableState?.queue?.length ? '👤 SUIVANT' : 'JOUEUR 2'}
                </label>
                <input type="text" value={player2} onChange={e => setPlayer2(e.target.value)} placeholder="Nom..." />
              </div>
            </div>
          )}

          <div style={{ marginBottom: '2.5rem' }}>
            <label>FORMAT DU MATCH</label>
            <select value={matchType} onChange={e => setMatchType(e.target.value)}>
              <option value="FRAME_UNIQUE">Match Normal (1 Frame)</option>
              <option value="3">Défi A2 (Best of 3)</option>
              <option value="5">Défi A3 (Best of 5)</option>
              <option value="7">Défi A4 (Best of 7)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button onClick={joinAsRemote} className="btn-primary">
              {tableState && !tableState.isWaitingForMatch && !tableState.isMatchOver ? '📱 Continuer le Match' : '📱 Lancer la Télécommande'}
            </button>

            <button onClick={joinAsTv} className="btn-outline">
              📺 Affichage TV
            </button>
          </div>
        </div>

        {!isTournamentMatch && (
          <div className="glass-panel slide-up" style={{ animationDelay: '0.1s' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--color-accent-blue)', textAlign: 'center' }}>👥 PROCHAIN JOUEUR</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label>NOM DU JOUEUR</label>
                <input
                  value={nextPlayerName}
                  onChange={e => setNextPlayerName(e.target.value)}
                  placeholder="Ex: Ahmed..."
                />
              </div>
              <button className="btn-primary" style={{ background: 'var(--color-accent-blue)', boxShadow: '0 4px 15px rgba(52, 152, 219, 0.3)' }} onClick={addNextPlayerContext}>
                ➕ Ajouter à la File
              </button>
            </div>

            {tableState?.queue && (tableState.queue as string[]).length > 0 && (
              <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', color: 'var(--color-text-muted)', textAlign: 'center', letterSpacing: '1px' }}>FILE D'ATTENTE ({(tableState.queue as string[]).length})</h3>

                <DragDropContext onDragEnd={onDragEnd}>
                  <StrictModeDroppable droppableId="queue-list">
                    {(provided: any) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                      >
                        {localQueue.map((name: string, idx: number) => (
                          <Draggable key={`${name}-${idx}`} draggableId={`${name}-${idx}`} index={idx}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: snapshot.isDragging ? 'rgba(52, 152, 219, 0.2)' : 'rgba(255,255,255,0.05)',
                                  border: snapshot.isDragging ? '1px solid #3498db' : '1px solid rgba(255,255,255,0.1)',
                                  padding: '0.75rem 1rem',
                                  borderRadius: 'var(--radius-sm)',
                                  boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : 'none',
                                  ...provided.draggableProps.style
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span
                                    {...provided.dragHandleProps}
                                    style={{ cursor: 'grab', color: 'rgba(255,255,255,0.3)', padding: '0.5rem 0.25rem' }}
                                  >
                                    ☰
                                  </span>
                                  <span style={{ color: 'var(--color-accent-green)', fontWeight: 'bold', fontSize: '1.1rem' }}>{idx + 1}.</span>
                                  <span style={{ fontWeight: '500' }}>{name}</span>
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

        <div className="glass-panel slide-up" style={{ animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>📊 Statistiques <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>({statEntries.length})</span></h2>
            <button onClick={() => { setShowStats(!showStats); if (!showStats) fetchStats(); }}
              className="btn-outline" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}>
              {showStats ? 'Masquer' : 'Voir'}
            </button>
          </div>

          {showStats && (
            <>
              {statEntries.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Aucune statistique disponible.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>Joueur</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: '#2ecc71' }}>V</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: '#e74c3c' }}>D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statEntries as [string, PlayerStat][]).map(([name, s]) => (
                        <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <div style={{ fontWeight: 'bold' }}>{name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{s.matches} match{s.matches > 1 ? 's' : ''}</div>
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: '#2ecc71', fontWeight: 'bold' }}>{s.wins}</td>
                          <td style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: '#e74c3c', fontWeight: 'bold' }}>{s.losses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totalOwed > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(241, 196, 15, 0.1)', border: '1px solid rgba(241, 196, 15, 0.3)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <span style={{ color: '#f1c40f', fontWeight: 'bold' }}>💰 Total à payer : {totalOwed} DH</span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>20 DH par match perdu</span>
                </div>
              )}

              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '1rem', textAlign: 'center' }}>
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
