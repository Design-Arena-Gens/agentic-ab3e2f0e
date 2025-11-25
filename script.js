(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const durationSel = document.getElementById('duration');
  const resolutionSel = document.getElementById('resolution');
  const fpsSel = document.getElementById('fps');
  const preview = document.getElementById('preview');
  const result = document.getElementById('result');
  const downloadLink = document.getElementById('downloadLink');
  const filesize = document.getElementById('filesize');

  const TAU = Math.PI * 2;
  let running = false;
  let startTimeMs = 0;
  let elapsed = 0;
  let rafId = 0;
  let recorder = null;
  let recordedChunks = [];
  let mediaStream = null;

  // Audio
  let audioCtx = null;
  let audioDestination = null;
  let masterGain = null;
  let musicNodes = [];

  // Utility
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function easeInOutQuad(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }
  function map(v, inMin, inMax, outMin, outMax) {
    const t = (v - inMin) / Math.max(1e-6, (inMax - inMin));
    return lerp(outMin, outMax, clamp(t, 0, 1));
  }
  function parseResolution(str) {
    const [w, h] = str.split('x').map(Number);
    return { width: w || 1280, height: h || 720 };
  }

  function setCanvasResolution() {
    const { width, height } = parseResolution(resolutionSel.value);
    canvas.width = width;
    canvas.height = height;
  }
  setCanvasResolution();
  resolutionSel.addEventListener('change', setCanvasResolution);

  // Visual Themes
  const PALETTE = {
    dawn: ['#05121e', '#0a2a49', '#134f78', '#ffb86b', '#ffd18b'],
    growth: ['#061e16', '#0a3a2b', '#116a4b', '#00d5a6', '#b4ffe6'],
    storm: ['#070b13', '#0b1221', '#0e1a37', '#4b7bcc', '#9bb8ff'],
    connect: ['#0a0f24', '#101942', '#1e2a7a', '#68e4ff', '#c6f5ff'],
    legacy: ['#0c0713', '#1e0d30', '#3a1e66', '#e0aaff', '#fde1ff']
  };

  function gradientBackground(colors, t) {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (let i = 0; i < colors.length; i++) {
      g.addColorStop(i/(colors.length-1), colors[i]);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // gentle vignette
    const rg = ctx.createRadialGradient(
      canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height) * 0.2,
      canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) * 0.65
    );
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Scene drawing
  function drawDawn(t, localT) {
    gradientBackground(PALETTE.dawn, t);
    const sunY = map(Math.sin(localT * Math.PI), -1, 1, canvas.height * 0.8, canvas.height * 0.2);
    const sunX = map(localT, 0, 1, canvas.width * 0.2, canvas.width * 0.8);
    const sunR = map(Math.cos(localT * Math.PI), -1, 1, 50, 160);

    const g = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR);
    g.addColorStop(0, 'rgba(255,216,128,0.9)');
    g.addColorStop(1, 'rgba(255,184,107,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.fill();

    // birds
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const bx = map((localT + i/6) % 1, 0, 1, canvas.width*0.1, canvas.width*0.9);
      const by = sunY - 120 - i*12 + Math.sin(t*1.3 + i) * 8;
      drawBird(bx, by, map(Math.sin(t + i), -1, 1, 10, 18));
    }
    drawCaption('Dawn: Beginnings', 0.12, localT);
  }

  function drawBird(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.quadraticCurveTo(x, y - size * 0.8, x + size, y);
    ctx.stroke();
  }

  function drawGrowth(t, localT) {
    gradientBackground(PALETTE.growth, t);
    // seed
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, canvas.height*0.85, canvas.width, canvas.height*0.15);

    const centerX = canvas.width * 0.5;
    const baseY = canvas.height * 0.85;
    const trunkH = map(localT, 0, 1, 10, canvas.height * 0.5);
    drawTree(centerX, baseY, -Math.PI/2, trunkH, 9, 12, localT);
    drawCaption('Growth: Learning', 0.32, localT);
  }

  function drawTree(x, y, angle, length, depth, maxDepth, phase) {
    if (depth === 0) return;
    const sway = Math.sin(phase * Math.PI * 2 + (maxDepth - depth)) * 0.08;
    const nx = x + Math.cos(angle + sway) * length;
    const ny = y + Math.sin(angle + sway) * length;

    ctx.strokeStyle = `rgba(202, 255, 230, ${map(depth, 0, maxDepth, 0.15, 0.8)})`;
    ctx.lineWidth = Math.max(1, depth * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    drawTree(nx, ny, angle - 0.35, length * 0.72, depth - 1, maxDepth, phase);
    drawTree(nx, ny, angle + 0.4, length * 0.68, depth - 1, maxDepth, phase);
  }

  function drawStorm(t, localT) {
    gradientBackground(PALETTE.storm, t);
    // clouds
    for (let i = 0; i < 5; i++) {
      const y = canvas.height * (0.2 + i * 0.1);
      drawCloud((t * 60 + i * 200) % (canvas.width + 300) - 150, y, 180 + i * 30, 0.15 + i*0.05);
    }
    // lightning
    if (Math.random() < 0.05 + localT * 0.1) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawLightning(canvas.width * Math.random(), 0, 7);
    }
    drawCaption('Trials: Resilience', 0.5, localT);
  }

  function drawCloud(x, y, w, alpha=0.15) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 6; i++) {
      const r = w * (0.15 + Math.random()*0.05);
      ctx.beginPath();
      ctx.arc(x + (i-2)*r*0.9, y + Math.sin(i)*6, r, 0, TAU);
      ctx.fill();
    }
  }
  function drawLightning(x, y, segments) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let cx = x, cy = y;
    for (let i = 0; i < segments; i++) {
      cx += (Math.random() - 0.5) * 60;
      cy += canvas.height / (segments + 1);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  function drawConnect(t, localT) {
    gradientBackground(PALETTE.connect, t);
    const nodes = 36;
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const pulsate = 1 + Math.sin(t * 2) * 0.05;
    const pts = [];
    for (let i = 0; i < nodes; i++) {
      const a = i / nodes * TAU + localT * 2;
      const r = radius * (0.8 + 0.2 * Math.sin(a * 3 + t * 2));
      pts.push([cx + Math.cos(a) * r * pulsate, cy + Math.sin(a) * r * pulsate]);
    }
    // lines
    ctx.strokeStyle = 'rgba(104, 228, 255, 0.25)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < nodes; i++) {
      const [x1, y1] = pts[i];
      for (let j = i+1; j < nodes; j++) {
        if ((i ^ j) % 6 === 0) {
          const [x2, y2] = pts[j];
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }
    // nodes
    for (let i = 0; i < nodes; i++) {
      const [x, y] = pts[i];
      ctx.fillStyle = 'rgba(198,245,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 5 === 0 ? 2 : 0), 0, TAU);
      ctx.fill();
    }
    drawCaption('Connection: Meaning', 0.7, localT);
  }

  function drawLegacy(t, localT) {
    gradientBackground(PALETTE.legacy, t);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    for (let i = 0; i < 7; i++) {
      const r = map(i, 0, 6, 30, Math.min(canvas.width, canvas.height)*0.42) * (0.95 + Math.sin(t*0.8 + i)*0.02);
      ctx.strokeStyle = `rgba(224,170,255, ${map(i,0,6,0.8,0.08)})`;
      ctx.lineWidth = Math.max(1, 6 - i);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    // title fade-in
    const titleAlpha = clamp(map(localT, 0.2, 0.8, 0, 1), 0, 1);
    ctx.fillStyle = `rgba(253,225,255, ${titleAlpha})`;
    ctx.font = `${Math.floor(canvas.height * 0.1)}px "Playfair Display", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Life', cx, cy);
    drawCaption('Legacy: Purpose', 0.88, localT);
  }

  function drawCaption(text, anchor, localT) {
    const y = map(localT, 0, 1, canvas.height * (anchor + 0.03), canvas.height * (anchor - 0.03));
    const alpha = clamp(map(localT, 0.0, 0.15, 0, 1) * map(localT, 0.85, 1.0, 1, 0), 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = `${Math.floor(canvas.height * 0.04)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width/2, y);
  }

  function drawTimelineOverlay(totalSec, tSec) {
    const pad = 16;
    const w = canvas.width - pad*2;
    const h = 6;
    const x = pad;
    const y = canvas.height - pad - h;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,213,166,0.85)';
    ctx.fillRect(x, y, w * clamp(tSec / totalSec, 0, 1), h);
  }

  // Scene schedule
  function drawFrame(now) {
    const totalSec = Number(durationSel.value);
    if (!running) return;
    if (!startTimeMs) startTimeMs = now;
    elapsed = (now - startTimeMs) / 1000;
    const t = elapsed / totalSec;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scenes: equal partitions
    const sceneDur = totalSec / 5; // 5 scenes
    const sceneIdx = Math.floor(elapsed / sceneDur);
    const localT = clamp(((elapsed % sceneDur) / sceneDur), 0, 1);

    switch (sceneIdx) {
      case 0: drawDawn(t, localT); break;
      case 1: drawGrowth(t, localT); break;
      case 2: drawStorm(t, localT); break;
      case 3: drawConnect(t, localT); break;
      default: drawLegacy(t, localT); break;
    }
    drawTimelineOverlay(totalSec, elapsed);

    if (elapsed >= totalSec) {
      stopRecording();
      return;
    }
    rafId = requestAnimationFrame(drawFrame);
  }

  // Audio synthesis
  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    audioDestination = audioCtx.createMediaStreamDestination();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioDestination);
  }

  function scheduleMusic(totalSec) {
    // clear previous nodes
    musicNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch(_){} });
    musicNodes = [];

    const now = audioCtx.currentTime;
    const bpm = 76;
    const beat = 60 / bpm;
    const bar = beat * 4;
    const end = now + totalSec + 1.0;

    const chords = [
      [220.00, 277.18, 329.63], // A minor
      [246.94, 311.13, 369.99], // Bdim/D (tension)
      [196.00, 246.94, 293.66], // G major
      [174.61, 220.00, 261.63], // F major
    ];

    // pad synth
    let t = now;
    let i = 0;
    while (t < end) {
      const chord = chords[i % chords.length];
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + beat * 1.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + bar * 0.95);

      chord.forEach((f, idx) => {
        const o = audioCtx.createOscillator();
        o.type = idx === 0 ? 'sine' : 'triangle';
        const detune = (idx - 1) * 3;
        o.frequency.setValueAtTime(f, t);
        o.detune.setValueAtTime(detune, t);
        o.connect(gain);
        o.start(t);
        o.stop(t + bar);
        musicNodes.push(o);
      });

      gain.connect(masterGain);
      osc.connect(gain); // carrier phase seed
      osc.start(t);
      osc.stop(t + bar);
      musicNodes.push(osc, gain);
      t += bar;
      i++;
    }

    // gentle pulse (kick-like)
    const kickGain = audioCtx.createGain();
    kickGain.gain.value = 0.0;
    kickGain.connect(masterGain);
    for (let tt = now; tt < end; tt += beat) {
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(80, tt);
      o.frequency.exponentialRampToValueAtTime(40, tt + 0.08);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.1, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      o.connect(g).connect(kickGain);
      o.start(tt);
      o.stop(tt + 0.15);
      musicNodes.push(o, g);
    }
  }

  function buildRecorder() {
    const fps = Number(fpsSel.value);
    const canvasStream = canvas.captureStream(fps);
    initAudio();
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    let mime = '';
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) { mime = c; break; }
    }
    if (!mime) {
      alert('MediaRecorder format not supported in this browser.');
      throw new Error('No supported MediaRecorder mime type');
    }
    recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recordedChunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mime });
      const url = URL.createObjectURL(blob);
      preview.src = url;
      downloadLink.href = url;
      filesize.textContent = `${(blob.size/1024/1024).toFixed(2)} MB`;
      result.classList.remove('hidden');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      resetBtn.disabled = false;
      running = false;
      if (audioCtx && audioCtx.state === 'running') {
        // allow natural decay; nodes already scheduled with stops
      }
    };
    mediaStream = combined;
    return recorder;
  }

  function startRecording() {
    // init audio chain if not ready
    initAudio();
    const totalSec = Number(durationSel.value);
    scheduleMusic(totalSec);
    buildRecorder();
    recorder.start(100); // timeslice
    running = true;
    startTimeMs = 0;
    elapsed = 0;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    resetBtn.disabled = true;
    result.classList.add('hidden');
    preview.removeAttribute('src');
    preview.load();
    rafId = requestAnimationFrame(drawFrame);
  }

  function stopRecording() {
    if (!running) return;
    running = false;
    stopBtn.disabled = true;
    try { recorder && recorder.state !== 'inactive' && recorder.stop(); } catch(_) {}
    cancelAnimationFrame(rafId);
    mediaStream && mediaStream.getTracks().forEach(tr => tr.stop());
  }

  function resetAll() {
    stopRecording();
    recordedChunks = [];
    result.classList.add('hidden');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    resetBtn.disabled = true;
    // clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  startBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);
  resetBtn.addEventListener('click', resetAll);
})(); 

