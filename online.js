// Online multiplayer via PeerJS (peer-to-peer)
// Host = Player 1, Guest = Player 2

const OnlineNet = {
  peer: null,
  conn: null,
  role: null, // 'host' | 'guest'
  roomCode: null,
  onReady: null,
  onMessage: null,
  onDisconnected: null,
  onStatus: null,

  _status(msg) {
    if (this.onStatus) this.onStatus(msg);
  },

  destroy() {
    try {
      if (this.conn) this.conn.close();
    } catch (_) {}
    try {
      if (this.peer) this.peer.destroy();
    } catch (_) {}
    this.peer = null;
    this.conn = null;
    this.role = null;
    this.roomCode = null;
  },

  _wireConn(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this._status('Connected!');
      if (this.onReady) this.onReady({ role: this.role, roomCode: this.roomCode });
    });
    conn.on('data', (data) => {
      if (this.onMessage) this.onMessage(data);
    });
    conn.on('close', () => {
      this._status('Opponent disconnected');
      if (this.onDisconnected) this.onDisconnected();
    });
    conn.on('error', (err) => {
      this._status('Connection error: ' + (err.message || err));
    });
  },

  host() {
    return new Promise((resolve, reject) => {
      this.destroy();
      if (typeof Peer === 'undefined') {
        reject(new Error('PeerJS failed to load'));
        return;
      }

      const code = 'WZ' + Math.random().toString(36).slice(2, 8).toUpperCase();
      this.role = 'host';
      this.roomCode = code;
      this._status('Creating room…');

      this.peer = new Peer(code, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        this.roomCode = id;
        this._status('Waiting for opponent…');
        resolve({ roomCode: id });
      });

      this.peer.on('connection', (conn) => {
        this._wireConn(conn);
      });

      this.peer.on('error', (err) => {
        this._status('Host error: ' + (err.type || err.message || err));
        reject(err);
      });
    });
  },

  join(code) {
    return new Promise((resolve, reject) => {
      this.destroy();
      if (typeof Peer === 'undefined') {
        reject(new Error('PeerJS failed to load'));
        return;
      }

      const clean = String(code || '').trim().toUpperCase();
      if (!clean) {
        reject(new Error('Enter a room code'));
        return;
      }

      this.role = 'guest';
      this.roomCode = clean;
      this._status('Connecting…');

      this.peer = new Peer({
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', () => {
        const conn = this.peer.connect(clean, { reliable: true });
        this._wireConn(conn);
        conn.on('open', () => resolve({ roomCode: clean }));
      });

      this.peer.on('error', (err) => {
        this._status('Join error: ' + (err.type || err.message || err));
        reject(err);
      });
    });
  },

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
      return true;
    }
    return false;
  }
};
