import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Define the shape of our game state
export interface GameState {
    players: string[];
    scores: number[];
    activePlayer: number;
    remainingReds: number;
    phase: 'REDS' | 'COLORS';
    isColorTurn: boolean;
    currentColorIndex: number;
    currentBreak: number;
    isFreeballAvailable: boolean;
    bestBreaks: number[];
    framesWon: number[];
    matchType: string;
    lastFrameWinner?: string | null;
    isWaitingForMatch?: boolean;
    matchStartTime?: number;
    queue?: string[];
    isMatchOver?: boolean;
    matchWinner?: string | null;
    pottedBalls?: string[][];
}

const SERVER_URL = import.meta.env.PROD ? 'https://ero0ck-snooker-live.hf.space' : 'http://localhost:3001';

export function useSocket(roomCode: string) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!roomCode) return;

        const newSocket = io(SERVER_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            setConnected(true);
            newSocket.emit('join_room', roomCode);
        });

        newSocket.on('game_state_update', (state: GameState) => {
            setGameState(state);
        });

        newSocket.on('disconnect', () => {
            setConnected(false);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [roomCode]);

    const sendAction = useCallback((action: string, payload: any = {}) => {
        if (socket && connected) {
            socket.emit('game_action', { roomCode, action, payload });
        }
    }, [socket, connected, roomCode]);

    return { gameState, connected, sendAction };
}
