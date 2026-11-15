// Sound, synthesized with WebAudio: no audio files are shipped. Every sound
// is a short burst of filtered noise or a sine blip, built once and reused,
// so nothing is allocated while the game runs. Created lazily on the first
// user gesture; every call is guarded so a headless run without audio stays
// silent instead of throwing.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return null;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(when, duration, filterType, frequency, gainValue, quality = 1) {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when, Math.random() * 0.2, duration);
    source.stop(when + duration + 0.02);
  }

  function tone(when, duration, type, from, to, gainValue) {
    if (!ensure()) return;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  function now() {
    return ensure() ? ctx.currentTime : 0;
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(muted) {
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    shot(kind) {
      if (!ensure()) return;
      const t = now();
      if (kind === 'marksman') {
        noise(t, 0.28, 'lowpass', 900, 0.9);
        tone(t, 0.16, 'sine', 160, 45, 0.7);
      } else if (kind === 'shotgun') {
        noise(t, 0.22, 'bandpass', 700, 1.0, 0.7);
        tone(t, 0.14, 'sine', 130, 40, 0.8);
      } else if (kind === 'smg') {
        noise(t, 0.09, 'bandpass', 1600, 0.55, 1.2);
        tone(t, 0.07, 'sine', 190, 70, 0.4);
      } else if (kind === 'pistol') {
        noise(t, 0.11, 'bandpass', 1200, 0.6, 1.0);
        tone(t, 0.08, 'sine', 170, 60, 0.45);
      } else {
        noise(t, 0.14, 'bandpass', 1100, 0.75, 1.0);
        tone(t, 0.1, 'sine', 150, 50, 0.55);
      }
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const t = now();
      const gain = Math.max(0.12, 0.6 - distance * 0.012);
      noise(t, 0.12, 'bandpass', 900, gain, 1.0);
    },
    dryFire() {
      if (!ensure()) return;
      tone(now(), 0.04, 'square', 900, 700, 0.15);
    },
    reload() {
      if (!ensure()) return;
      const t = now();
      tone(t, 0.05, 'square', 700, 500, 0.18);
      tone(t + 0.28, 0.05, 'square', 900, 650, 0.18);
    },
    hit(kill) {
      if (!ensure()) return;
      tone(now(), kill ? 0.12 : 0.06, 'sine', kill ? 1400 : 1100, kill ? 900 : 900, 0.25);
    },
    step() {
      if (!ensure()) return;
      noise(now(), 0.05, 'lowpass', 420, 0.1);
    },
    plantBeep() {
      if (!ensure()) return;
      tone(now(), 0.09, 'sine', 1250, 1250, 0.2);
    },
    defuseBeep() {
      if (!ensure()) return;
      tone(now(), 0.07, 'sine', 950, 950, 0.18);
    },
    explosion() {
      if (!ensure()) return;
      const t = now();
      noise(t, 0.7, 'lowpass', 500, 1.0);
      tone(t, 0.5, 'sine', 90, 28, 0.9);
    },
    roundWin() {
      if (!ensure()) return;
      const t = now();
      tone(t, 0.16, 'sine', 660, 660, 0.3);
      tone(t + 0.16, 0.3, 'sine', 880, 880, 0.3);
    },
    roundLose() {
      if (!ensure()) return;
      const t = now();
      tone(t, 0.18, 'sine', 440, 440, 0.3);
      tone(t + 0.18, 0.32, 'sine', 330, 330, 0.3);
    },
    buy() {
      if (!ensure()) return;
      tone(now(), 0.07, 'sine', 1000, 1300, 0.2);
    },
  };
}
