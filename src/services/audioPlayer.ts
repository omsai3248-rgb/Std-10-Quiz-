class QuizAudioPlayer {
  private ctx: AudioContext | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimer: number | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  stopCurrent(): void {
    if (this.activeTimer !== null) {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
    }
    this.activeNodes = [];
  }

  playCorrectChime(): void {
    this.stopCurrent();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.0, now + 0.125); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.setValueAtTime(0.18, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);

    this.activeNodes = [osc, gain];
  }

  playWrongSiren(): void {
    this.stopCurrent();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleRate = ctx.sampleRate;
    const durationSec = 0.85;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let phase = 0;
    for (let i = 0; i < totalSamples; i++) {
      const progress = i / totalSamples;
      const sweepWave = 0.5 - 0.5 * Math.cos(2 * Math.PI * 2.2 * progress);
      const freq = 660 + 720 * sweepWave;
      phase += (2 * Math.PI * freq) / sampleRate;

      let envelope = 1;
      if (progress < 0.05) envelope = progress / 0.05;
      else if (progress > 0.9) envelope = (1 - progress) / 0.1;

      const wave = 0.78 * Math.sin(phase) + 0.22 * Math.sin(2 * phase);
      data[i] = wave * envelope * 0.28;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    this.activeNodes = [source];
  }

  playAdminAlertChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(783.99, now); // G5
    osc.frequency.setValueAtTime(1046.5, now + 0.11); // C6
    osc.frequency.setValueAtTime(1318.51, now + 0.22); // E6

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain.gain.setValueAtTime(0.16, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }
}

export const quizAudioPlayer = new QuizAudioPlayer();
