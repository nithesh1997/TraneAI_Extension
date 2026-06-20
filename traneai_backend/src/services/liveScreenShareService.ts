import { randomUUID } from 'crypto';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import wrtc from '@roamhq/wrtc';

type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
type IceCandidateInit = Record<string, unknown>;

type ClientSignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'ice-candidate'; candidate: IceCandidateInit }
  | { type: 'stop' };

type ServerSignalMessage =
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: IceCandidateInit }
  | { type: 'state'; state: PeerConnectionState }
  | { type: 'error'; message: string };

interface SessionEntry {
  id: string;
  createdAt: number;
  socket?: any;
  peer?: any;
  cleanupTimer?: NodeJS.Timeout;
}

const SESSION_TTL_MS = 2 * 60 * 1000;
const sessions = new Map<string, SessionEntry>();

const toJson = (payload: ServerSignalMessage): string => JSON.stringify(payload);

const sendSignal = (socket: any, payload: ServerSignalMessage) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(toJson(payload));
  }
};

const destroySession = (entry: SessionEntry) => {
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = undefined;
  }

  if (entry.peer) {
    entry.peer.onicecandidate = null;
    entry.peer.onconnectionstatechange = null;
    entry.peer.ontrack = null;
    entry.peer.getReceivers().forEach((receiver: any) => receiver.track?.stop());
    entry.peer.close();
    entry.peer = undefined;
  }

  if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
    entry.socket.close();
  }

  sessions.delete(entry.id);
};

const scheduleExpiration = (entry: SessionEntry) => {
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
  }

  entry.cleanupTimer = setTimeout(() => {
    destroySession(entry);
  }, SESSION_TTL_MS);
};

const createPeerConnection = (entry: SessionEntry, socket: any): any => {
  const peer = new wrtc.RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  peer.onicecandidate = (event: any) => {
    if (event.candidate) {
      sendSignal(socket, { type: 'ice-candidate', candidate: event.candidate.toJSON() });
    }
  };

  peer.onconnectionstatechange = () => {
    sendSignal(socket, { type: 'state', state: peer.connectionState as PeerConnectionState });

    if (peer.connectionState === 'failed' || peer.connectionState === 'closed' || peer.connectionState === 'disconnected') {
      destroySession(entry);
    }
  };

  peer.ontrack = (event: any) => {
    const [stream] = event.streams;
    const streamId = stream?.id || 'unknown-stream';
    console.log(`[live-share] Incoming track kind=${event.track.kind} stream=${streamId} session=${entry.id}`);
  };

  return peer;
};

const handleClientSignal = async (entry: SessionEntry, socket: any, message: ClientSignalMessage) => {
  if (message.type === 'stop') {
    destroySession(entry);
    return;
  }

  if (!entry.peer) {
    entry.peer = createPeerConnection(entry, socket);
  }

  if (message.type === 'offer') {
    const peer = entry.peer;
    await peer.setRemoteDescription(new wrtc.RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    if (!answer.sdp) {
      throw new Error('Failed to build SDP answer');
    }

    sendSignal(socket, { type: 'answer', sdp: answer.sdp });
    return;
  }

  const candidate = new wrtc.RTCIceCandidate(message.candidate);
  await entry.peer.addIceCandidate(candidate);
};

const parseSessionId = (request: IncomingMessage): string | null => {
  const requestUrl = request.url || '';
  const parsed = new URL(requestUrl, 'http://localhost');
  return parsed.searchParams.get('sessionId');
};

export const createScreenShareSession = (): string => {
  const id = randomUUID();
  const entry: SessionEntry = {
    id,
    createdAt: Date.now(),
  };

  sessions.set(id, entry);
  scheduleExpiration(entry);
  return id;
};

export const initializeLiveShareWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (socket: any, request: IncomingMessage) => {
    const sessionId = parseSessionId(request);
    if (!sessionId) {
      socket.close(1008, 'Missing sessionId');
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      socket.close(1008, 'Invalid or expired sessionId');
      return;
    }

    if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
      socket.close(1008, 'Session already attached');
      return;
    }

    entry.socket = socket;
    scheduleExpiration(entry);

    socket.on('message', async (raw: any) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientSignalMessage;
        await handleClientSignal(entry, socket, parsed);
      } catch (error: any) {
        sendSignal(socket, { type: 'error', message: error?.message || 'Invalid live signaling message' });
      }
    });

    socket.on('close', () => {
      destroySession(entry);
    });

    socket.on('error', () => {
      destroySession(entry);
    });
  });
};
