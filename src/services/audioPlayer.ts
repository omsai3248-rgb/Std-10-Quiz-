export const CORRECT_SOUND_DURATION_SEC = 0.11;
export const WRONG_SOUND_DURATION_SEC = 0.12;
export const CORRECT_SOUND_PEAK_GAIN = 0.08;
export const WRONG_SOUND_PEAK_GAIN = 0.075;

export class QuizAudioPlayer {
  private ctx: AudioContext | null = null;
  private activeNodes: AudioNode[] = [];
  private activeTimer: number | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  /**
   * Minimal, ultra-short soft ascending chime (~110ms) for a correct answer.
   */
  playCorrectChime(): void {
    this.stopCurrent();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880.0, now); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.045); // D6

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(CORRECT_SOUND_PEAK_GAIN, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + CORRECT_SOUND_DURATION_SEC);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + CORRECT_SOUND_DURATION_SEC + 0.005);

    this.activeNodes = [osc, gain];
  }

  /**
   * Minimal, ultra-short gentle low tap (~120ms) for a wrong answer — no loud buzzer or siren.
   */
  playWrongSiren(): void {
    this.stopCurrent();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260.0, now);
    osc.frequency.setValueAtTime(185.0, now + 0.05);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(WRONG_SOUND_PEAK_GAIN, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + WRONG_SOUND_DURATION_SEC);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + WRONG_SOUND_DURATION_SEC + 0.005);

    this.activeNodes = [osc, gain];
  }

  playWrongSound(): void {
    this.playWrongSiren();
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
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.setValueAtTime(0.14, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }
}

export const quizAudioPlayer = new QuizAudioPlayer();
