(() => {
    const q = new URLSearchParams(location.search);
    const url = q.get('url') || '';
    const startPos = parseFloat(q.get('pos') || '0') || 0;
    let loop = q.get('loop') === '1';
    let paused = q.get('paused') === '1';
    let volume = Math.min(1, Math.max(0, parseFloat(q.get('vol') || '0.5')));

    const DRIFT = 3.0; // Sekunden Abweichung, ab der nachgespult wird
    const vid = document.getElementById('vid');
    const msg = document.getElementById('msg');
    let kind = null, yt = null, ytReady = false;

    const setMsg = (t) => {
        msg.style.display = t ? 'flex' : 'none';
        msg.textContent = t || '';
    };

    const ytId = (u) => {
        const m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/);
        return m ? m[1] : null;
    };

    // ---------- Einheitliche Steuerung ----------
    const isReady = () => (kind === 'video' ? vid.readyState >= 1 : (kind === 'yt' && ytReady));
    const getTime = () => (kind === 'video' ? vid.currentTime : yt.getCurrentTime());
    const getDur = () => {
        const d = kind === 'video' ? vid.duration : yt.getDuration();
        return (d && isFinite(d)) ? d : 0;
    };
    const seek = (t) => { if (kind === 'video') { try { vid.currentTime = t; } catch (e) {} } else yt.seekTo(t, true); };
    const play = () => { if (kind === 'video') vid.play().catch(() => {}); else yt.playVideo(); };
    const pause = () => { if (kind === 'video') vid.pause(); else yt.pauseVideo(); };
    const setVol = (v) => {
        if (kind === 'video') vid.volume = v;
        else if (kind === 'yt' && ytReady) yt.setVolume(Math.round(v * 100));
    };

    // ---------- Direkte Videodatei ----------
    function startVideo() {
        kind = 'video';
        vid.style.display = 'block';
        document.getElementById('ytwrap').style.display = 'none';
        vid.loop = loop;
        vid.volume = volume;
        vid.addEventListener('loadedmetadata', () => {
            let t = startPos;
            const d = getDur();
            if (d) t = loop ? t % d : Math.min(t, Math.max(0, d - 0.1));
            seek(t);
            if (!paused) play();
            setMsg('');
        });
        vid.addEventListener('error', () => setMsg('Video konnte nicht geladen werden'));
        vid.src = url;
    }

    // ---------- YouTube ----------
    function startYouTube(id) {
        kind = 'yt';
        window.onYouTubeIframeAPIReady = () => {
            yt = new YT.Player('yt', {
                videoId: id,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: paused ? 0 : 1, controls: 0, disablekb: 1, fs: 0,
                    modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3,
                    start: Math.floor(startPos),
                    ...(location.protocol.startsWith('http') ? { origin: location.origin } : {}),
                },
                events: {
                    onReady: (e) => {
                        ytReady = true;
                        e.target.setVolume(Math.round(volume * 100));
                        const d = getDur();
                        let t = startPos;
                        if (d && loop) t = t % d;
                        e.target.seekTo(t, true);
                        if (paused) e.target.pauseVideo(); else e.target.playVideo();
                        setMsg('');
                    },
                    onStateChange: (e) => {
                        if (e.data === YT.PlayerState.ENDED && loop) { yt.seekTo(0, true); yt.playVideo(); }
                    },
                    onError: (e) => setMsg('YouTube-Fehler ' + e.data),
                },
            });
        };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = () => setMsg('YouTube konnte nicht geladen werden');
        document.head.appendChild(s);
    }

    // ---------- Sync vom Spiel (Lautstärke, Pause, Position) ----------
    function applySync(d) {
        if (typeof d.volume === 'number') { volume = Math.min(1, Math.max(0, d.volume)); setVol(volume); }
        if (typeof d.loop === 'boolean') { loop = d.loop; if (kind === 'video') vid.loop = loop; }
        if (!isReady()) return;

        // Falls ein Klick (z. B. Werbung überspringen) das Video angehalten hat: weiterlaufen lassen
        if (!paused) {
            if (kind === 'yt' && yt.getPlayerState() === 2) play();
            if (kind === 'video' && vid.paused && !vid.ended) play();
        }

        if (typeof d.paused === 'boolean' && d.paused !== paused) {
            paused = d.paused;
            if (paused) pause(); else play();
        }

        if (typeof d.position === 'number') {
            if (kind === 'yt' && yt.getPlayerState() === 3) return; // puffert gerade
            const dur = getDur();
            let target = d.position;
            if (dur) {
                if (loop) target = target % dur;
                else if (target >= dur) return; // Video ist zu Ende
            }
            if (Math.abs(getTime() - target) > DRIFT) seek(target);
        }
    }

    window.addEventListener('message', (e) => {
        let d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
        if (!d) return;
        if (d.action === 'sync') applySync(d);
        if (d.action === 'dot') showDot(d.x, d.y);
    });

    // ---------- Markierung der Klickstelle (Debug) ----------
    let dotTimer = null;
    function showDot(x, y) {
        const dot = document.getElementById('dot');
        if (!dot) return;
        dot.style.left = (x * 100) + '%';
        dot.style.top = (y * 100) + '%';
        dot.style.display = 'block';
        clearTimeout(dotTimer);
        dotTimer = setTimeout(() => { dot.style.display = 'none'; }, 1200);
    }

    // ---------- Start ----------
    if (!/^https:\/\//i.test(url)) {
        setMsg('Ungültiger Link');
    } else {
        const id = ytId(url);
        if (id) startYouTube(id); else startVideo();
    }
})();
