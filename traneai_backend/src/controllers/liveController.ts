import { Request, Response } from 'express';
// @ts-ignore NodeNext resolves .js specifier to .ts source in this backend build setup.
import { createScreenShareSession } from '../services/liveScreenShareService.js';

export function createLiveSession(req: Request, res: Response): void {
  const sessionId = createScreenShareSession();
  const secureHeader = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase() === 'https';
  const protocol = req.secure || secureHeader ? 'wss' : 'ws';
  const host = req.get('host') || 'localhost:5000';

  res.json({
    sessionId,
    wsUrl: `${protocol}://${host}/ws/live?sessionId=${sessionId}`,
  });
}

export function serveLiveShareClient(req: Request, res: Response): void {
  const nonce = (res.locals.cspNonce as string | undefined) || 'missing-nonce';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TraneAI Screen Share</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark;
      --bg0: #090d18;
      --bg1: #131a2b;
      --line: rgba(255, 255, 255, 0.16);
      --text: #e8eeff;
      --muted: #b8c1da;
      --accent: #6da4ff;
      --danger: #f45f5f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--text);
      background:
        radial-gradient(120% 120% at 0% 0%, #1e2c59 0%, transparent 50%),
        radial-gradient(120% 120% at 100% 0%, #0d4e4d 0%, transparent 46%),
        linear-gradient(180deg, var(--bg1), var(--bg0));
      font-family: Segoe UI, Arial, sans-serif;
    }
    .card {
      width: min(920px, 100%);
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(9, 13, 24, 0.74);
      backdrop-filter: blur(7px);
      padding: 18px;
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 8px 0; font-size: 20px; }
    .sub { margin: 0 0 14px 0; color: var(--muted); font-size: 13px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    button {
      border: 1px solid var(--line);
      color: var(--text);
      background: linear-gradient(180deg, #2a3557, #1f2948);
      border-radius: 10px;
      padding: 9px 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { transform: translateY(-1px); }
    button.stop {
      background: linear-gradient(180deg, #e76464, #c94848);
      border-color: rgba(255, 186, 186, 0.7);
    }
    .status {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 12px;
      min-height: 18px;
    }
    video {
      width: 100%;
      max-height: 62vh;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #05070d;
      object-fit: contain;
    }
    code {
      color: #c8d8ff;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <section class="card">
    <h1>TraneAI External Screen Share</h1>
    <p class="sub">This page runs outside VS Code WebView so display capture is allowed by browser permissions policy.</p>
    <div class="row">
      <button id="startBtn">Start Sharing</button>
      <button id="stopBtn" class="stop" disabled>Stop Sharing</button>
    </div>
    <div id="status" class="status">Ready.</div>
    <video id="preview" autoplay muted playsinline></video>
  </section>

  <script nonce="${nonce}">
    const statusEl = document.getElementById('status');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const preview = document.getElementById('preview');

    let stream = null;
    let peer = null;
    let socket = null;

    const setStatus = (text) => { statusEl.textContent = text; };

    const stopSharing = (next = 'Stopped.') => {
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'stop' }));
        }
      } catch {}

      try { socket && socket.close(); } catch {}
      try { peer && peer.close(); } catch {}
      try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}

      stream = null;
      peer = null;
      socket = null;
      preview.srcObject = null;
      setStatus(next);
      startBtn.disabled = false;
      stopBtn.disabled = true;
    };

    const startSharing = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setStatus('Display capture is unavailable in this browser.');
        return;
      }

      setStatus('Requesting display capture permission...');
      startBtn.disabled = true;

      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 12, max: 20 } },
          audio: false,
        });

        preview.srcObject = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => stopSharing('Display share ended by user.');
        });

        setStatus('Creating backend live session...');
        const res = await fetch('/api/chat/live/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          throw new Error('Live session request failed.');
        }

        const data = await res.json();
        if (!data.wsUrl) {
          throw new Error('No signaling URL returned by backend.');
        }

        peer = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        stream.getTracks().forEach((track) => peer.addTrack(track, stream));

        socket = new WebSocket(data.wsUrl);

        peer.onicecandidate = (event) => {
          if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate.toJSON() }));
          }
        };

        socket.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'answer') {
            await peer.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
            return;
          }
          if (msg.type === 'ice-candidate') {
            await peer.addIceCandidate(msg.candidate);
            return;
          }
          if (msg.type === 'state' && ['failed', 'disconnected', 'closed'].includes(msg.state)) {
            stopSharing('Connection closed: ' + msg.state);
            return;
          }
          if (msg.type === 'error') {
            stopSharing('Signaling error: ' + msg.message);
          }
        };

        socket.onopen = async () => {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
          setStatus('Sharing is active.');
          stopBtn.disabled = false;
        };

        socket.onerror = () => {
          stopSharing('WebSocket signaling failed.');
        };
      } catch (error) {
        stopSharing(error && error.message ? error.message : 'Unable to start sharing.');
      }
    };

    startBtn.addEventListener('click', () => void startSharing());
    stopBtn.addEventListener('click', () => stopSharing());
    window.addEventListener('beforeunload', () => stopSharing('Page closing.'));
  </script>
</body>
</html>`);
}
