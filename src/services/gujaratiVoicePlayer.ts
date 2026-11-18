export const GUJARATI_CORRECT_PHRASES = [
  'અરે વાહ! એકદમ સાચો જવાબ!',
  'શાબાશ! ખૂબ સરસ!',
  'ઉત્તમ! આગળ વધો!',
  'અભિનંદન! તમે સાચા છો!',
  'ખૂબ સરસ બેટા! તારી તૈયારી જોરદાર છે!',
  'વાહ! આ જ રીતે મહેનત ચાલુ રાખો!',
] as const;

export const GUJARATI_WRONG_PHRASES = [
  'કોઈ વાંધો નહીં! ફરી પ્રયત્ન કરો.',
  'નિરાશ ન થશો! તમે કરી શકશો.',
  'ભૂલમાંથી જ શીખવાનું છે.',
  'હિંમત ન હારશો!',
  'ચાલો, આપણે આની સરળ સમજૂતી સમજી લઈએ.',
  'ધ્યાનથી વાંચો, આગળનો જવાબ જરૂર સાચો પડશે!',
] as const;

export const GUJARATI_VOICE_STORAGE_KEY = 'std10_gujarati_voice_enabled_v1';
export const GUJARATI_VOICE_GENDER_KEY = 'std10_gujarati_voice_gender_v1';

export type VoiceGender = 'female' | 'male';
export type VoiceTone = 'feedback_correct' | 'feedback_wrong';
export type VoicePlaybackStatus = 'idle' | 'loading' | 'speaking' | 'paused';
export type VoicePlaybackPhase = 'idle' | 'feedback';
export type VoiceEngineMode = 'ai_human' | 'offline_fallback' | 'web' | 'unavailable';
export type VoiceAudioSource =
  | 'local_cache'
  | 'firebase_storage'
  | 'gemini_ai'
  | 'offline_fallback'
  | 'web_speech'
  | 'none';

export interface VoicePlayerSnapshot {
  voiceEnabled: boolean;
  voiceGender: VoiceGender;
  status: VoicePlaybackStatus;
  phase: VoicePlaybackPhase;
  currentFeedbackPhrase: string;
  currentChunkIndex: number;
  totalChunks: number;
  gujaratiVoiceAvailable: boolean;
  engineMode: VoiceEngineMode;
  audioSource: VoiceAudioSource;
  lastError: string;
}

interface NativeTtsBridgeApi {
  isReady?: () => boolean;
  isGujaratiAvailable?: () => boolean;
  isHumanVoiceSupported?: () => boolean;
  getVoiceGender?: () => string;
  setVoiceGender?: (gender: string) => void;
  speakNaturalChunk?: (
    utteranceId: string,
    text: string,
    gender: string,
    tone: string,
    speechRate: number
  ) => void;
  prefetchNaturalChunk?: (text: string, gender: string, tone: string) => void;
  speakChunk?: (utteranceId: string, text: string, speechRate: number) => void;
  pause?: () => void;
  resume?: () => void;
  stop?: () => void;
}

interface NativeTtsEventPayload {
  type?: 'init' | 'synthesizing' | 'start' | 'pause' | 'resume' | 'done' | 'stop' | 'error';
  utteranceId?: string;
  interrupted?: boolean;
  gujaratiSupported?: boolean;
  humanVoiceSupported?: boolean;
  source?: string;
  errorMessage?: string;
}

interface WindowWithTtsBridge extends Window {
  AndroidTtsBridge?: NativeTtsBridgeApi;
  __onNativeTtsEvent?: (payload: NativeTtsEventPayload) => void;
}

interface QueueItem {
  text: string;
  phase: Exclude<VoicePlaybackPhase, 'idle'>;
  tone: VoiceTone;
}

export class NonRepeatingPhraseTracker {
  private lastCorrectIndex = -1;
  private lastWrongIndex = -1;

  pick(
    isCorrect: boolean,
    rng: () => number = Math.random
  ): { phrase: string; index: number } {
    const pool = isCorrect ? GUJARATI_CORRECT_PHRASES : GUJARATI_WRONG_PHRASES;
    const prevIdx = isCorrect ? this.lastCorrectIndex : this.lastWrongIndex;

    if (pool.length <= 1) {
      if (isCorrect) this.lastCorrectIndex = 0;
      else this.lastWrongIndex = 0;
      return { phrase: pool[0] ?? '', index: 0 };
    }

    const candidates: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (i !== prevIdx) candidates.push(i);
    }

    const rawRoll = Number(rng());
    const clampedRoll = Number.isFinite(rawRoll) ? Math.min(0.999999, Math.max(0, rawRoll)) : 0;
    const pickedIndex = candidates[Math.floor(clampedRoll * candidates.length)] ?? candidates[0];

    if (isCorrect) {
      this.lastCorrectIndex = pickedIndex;
    } else {
      this.lastWrongIndex = pickedIndex;
    }

    return { phrase: pool[pickedIndex], index: pickedIndex };
  }

  reset(): void {
    this.lastCorrectIndex = -1;
    this.lastWrongIndex = -1;
  }
}

class GujaratiVoicePlayer {
  private readonly phraseTracker = new NonRepeatingPhraseTracker();
  private readonly listeners = new Set<(snap: VoicePlayerSnapshot) => void>();

  private voiceEnabled = this.loadPersistedVoiceEnabled();
  private voiceGender: VoiceGender = this.loadPersistedVoiceGender();
  private status: VoicePlaybackStatus = 'idle';
  private phase: VoicePlaybackPhase = 'idle';
  private currentFeedbackPhrase = '';
  private queue: QueueItem[] = [];
  private currentChunkIndex = 0;

  private activeSessionId = 0;
  private activeUtteranceId = '';
  private delayTimerId: number | null = null;
  private safetyTimerId: number | null = null;
  private intentionalCancel = false;
  private nativeOfflineSupportedHint: boolean | null = null;
  private audioSource: VoiceAudioSource = 'none';
  private lastError = '';
  private feedbackWarmedUp = false;

  constructor() {
    this.installNativeCallback();
    this.syncGenderWithNativeBridge();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.emit();
      });
    }
  }

  private loadPersistedVoiceEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem(GUJARATI_VOICE_STORAGE_KEY);
      if (saved === 'false') return false;
      return true;
    } catch {
      return true;
    }
  }

  private persistVoiceEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(GUJARATI_VOICE_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore quota errors
    }
  }

  private loadPersistedVoiceGender(): VoiceGender {
    const nativeBridge = this.getNativeBridge();
    if (nativeBridge?.getVoiceGender) {
      try {
        const nativeVal = nativeBridge.getVoiceGender();
        if (nativeVal === 'male' || nativeVal === 'female') {
          return nativeVal;
        }
      } catch {
        // Fallback to localStorage
      }
    }
    if (typeof window === 'undefined') return 'female';
    try {
      const saved = localStorage.getItem(GUJARATI_VOICE_GENDER_KEY);
      return saved === 'male' ? 'male' : 'female';
    } catch {
      return 'female';
    }
  }

  private persistVoiceGender(gender: VoiceGender): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(GUJARATI_VOICE_GENDER_KEY, gender);
    } catch {
      // Ignore quota errors
    }
  }

  private syncGenderWithNativeBridge(): void {
    const bridge = this.getNativeBridge();
    if (bridge?.setVoiceGender) {
      try {
        bridge.setVoiceGender(this.voiceGender);
      } catch {
        // Ignore bridge errors
      }
    }
  }

  private getNativeBridge(): NativeTtsBridgeApi | null {
    if (typeof window === 'undefined') return null;
    const bridge = (window as WindowWithTtsBridge).AndroidTtsBridge;
    if (!bridge) return null;
    if (typeof bridge.speakNaturalChunk === 'function' || typeof bridge.speakChunk === 'function') {
      return bridge;
    }
    return null;
  }

  private pickWebGujaratiVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() ?? [];
    const guVoices = voices.filter((v) =>
      String(v.lang ?? '')
        .toLowerCase()
        .startsWith('gu')
    );
    if (guVoices.length === 0) return null;
    if (this.voiceGender === 'male') {
      return (
        guVoices.find((v) => /male|purush|hemant|niranjan/i.test(v.name)) ??
        guVoices.find((v) => v.lang.toLowerCase() === 'gu-in') ??
        guVoices[0]
      );
    }
    return (
      guVoices.find((v) => /female|dhwani|shruti|kalpana/i.test(v.name)) ??
      guVoices.find((v) => v.lang.toLowerCase() === 'gu-in') ??
      guVoices[0]
    );
  }

  private resolveEngineInfo(): { mode: VoiceEngineMode; gujaratiAvailable: boolean } {
    const nativeBridge = this.getNativeBridge();
    if (nativeBridge) {
      if (nativeBridge.isHumanVoiceSupported?.()) {
        if (this.audioSource === 'offline_fallback') {
          return {
            mode: 'offline_fallback',
            gujaratiAvailable: this.nativeOfflineSupportedHint ?? true,
          };
        }
        return { mode: 'ai_human', gujaratiAvailable: true };
      }
      const ready = nativeBridge.isReady?.() ?? false;
      const available =
        this.nativeOfflineSupportedHint ??
        (ready ? Boolean(nativeBridge.isGujaratiAvailable?.()) : true);
      return { mode: 'offline_fallback', gujaratiAvailable: available };
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const guVoice = this.pickWebGujaratiVoice();
      const voicesLoaded = window.speechSynthesis.getVoices().length > 0;
      return {
        mode: 'web',
        gujaratiAvailable: Boolean(guVoice) || !voicesLoaded,
      };
    }
    return { mode: 'unavailable', gujaratiAvailable: false };
  }

  private normalizeAudioSource(raw?: string): VoiceAudioSource {
    switch (raw) {
      case 'local_cache':
      case 'firebase_storage':
      case 'gemini_ai':
      case 'offline_fallback':
      case 'web_speech':
        return raw;
      default:
        return 'none';
    }
  }

  private installNativeCallback(): void {
    if (typeof window === 'undefined') return;
    const w = window as WindowWithTtsBridge;
    w.__onNativeTtsEvent = (payload) => {
      if (!payload) return;
      if (payload.type === 'init' && typeof payload.gujaratiSupported === 'boolean') {
        this.nativeOfflineSupportedHint = payload.gujaratiSupported;
        this.emit();
        return;
      }

      if (!payload.utteranceId || payload.utteranceId !== this.activeUtteranceId) {
        return;
      }

      if (payload.type === 'synthesizing') {
        this.status = 'loading';
        this.lastError = '';
        this.scheduleSafetyTimer(this.activeSessionId, payload.utteranceId, 38000);
        this.emit();
        return;
      }

      if (payload.type === 'start') {
        this.status = 'speaking';
        this.audioSource = this.normalizeAudioSource(payload.source);
        this.lastError = '';
        const activeItem = this.queue[this.currentChunkIndex];
        const estimatedMs = Math.min(35000, Math.max(9000, (activeItem?.text.length ?? 60) * 160));
        this.scheduleSafetyTimer(this.activeSessionId, payload.utteranceId, estimatedMs);
        this.prefetchNextChunk(this.currentChunkIndex);
        this.emit();
        return;
      }

      if (payload.type === 'pause') {
        this.clearSafetyTimer();
        if (this.status === 'speaking' || this.status === 'loading') {
          this.status = 'paused';
          this.emit();
        }
        return;
      }

      if (payload.type === 'resume') {
        this.status = 'speaking';
        const activeItem = this.queue[this.currentChunkIndex];
        const estimatedMs = Math.min(35000, Math.max(9000, (activeItem?.text.length ?? 60) * 160));
        this.scheduleSafetyTimer(this.activeSessionId, payload.utteranceId, estimatedMs);
        this.emit();
        return;
      }

      if (payload.type === 'done') {
        this.clearSafetyTimer();
        this.advanceQueue();
      } else if (payload.type === 'error') {
        this.clearSafetyTimer();
        this.lastError = payload.errorMessage || '';
        this.audioSource = this.normalizeAudioSource(payload.source);
        if (this.nativeOfflineSupportedHint === false && payload.source === 'offline_fallback') {
          this.stop();
        } else {
          this.advanceQueue();
        }
      } else if (payload.type === 'stop') {
        this.clearSafetyTimer();
        if (!this.intentionalCancel && this.status === 'speaking') {
          this.advanceQueue();
        }
      }
    };
  }

  getSnapshot(): VoicePlayerSnapshot {
    const engine = this.resolveEngineInfo();
    return {
      voiceEnabled: this.voiceEnabled,
      voiceGender: this.voiceGender,
      status: this.status,
      phase: this.phase,
      currentFeedbackPhrase: this.currentFeedbackPhrase,
      currentChunkIndex: this.currentChunkIndex,
      totalChunks: this.queue.length,
      gujaratiVoiceAvailable: engine.gujaratiAvailable,
      engineMode: engine.mode,
      audioSource: this.audioSource,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (snap: VoicePlayerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private clearTimers(): void {
    if (this.delayTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.delayTimerId);
      this.delayTimerId = null;
    }
    this.clearSafetyTimer();
  }

  private clearSafetyTimer(): void {
    if (this.safetyTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.safetyTimerId);
      this.safetyTimerId = null;
    }
  }

  private scheduleSafetyTimer(sessionId: number, uttId: string, timeoutMs: number): void {
    this.clearSafetyTimer();
    if (typeof window === 'undefined') return;
    this.safetyTimerId = window.setTimeout(() => {
      if (this.activeSessionId === sessionId && this.activeUtteranceId === uttId) {
        this.advanceQueue();
      }
    }, timeoutMs);
  }

  private cancelEngineOnly(): void {
    this.intentionalCancel = true;
    this.clearSafetyTimer();
    this.activeUtteranceId = '';

    const nativeBridge = this.getNativeBridge();
    if (nativeBridge) {
      try {
        nativeBridge.stop?.();
      } catch {
        // Ignore bridge errors
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis errors
      }
    }

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        this.intentionalCancel = false;
      }, 0);
    } else {
      this.intentionalCancel = false;
    }
  }

  setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    this.persistVoiceEnabled(enabled);
    if (!enabled) {
      this.stop();
    } else {
      this.emit();
    }
  }

  setVoiceGender(gender: VoiceGender): void {
    if (this.voiceGender === gender) return;
    this.voiceGender = gender;
    this.persistVoiceGender(gender);
    this.syncGenderWithNativeBridge();
    this.feedbackWarmedUp = false;
    if (this.status !== 'idle') {
      this.stop();
    } else {
      this.emit();
    }
  }

  warmupFeedbackVoices(): void {
    if (!this.voiceEnabled || this.feedbackWarmedUp) return;
    const bridge = this.getNativeBridge();
    if (!bridge?.prefetchNaturalChunk) return;
    this.feedbackWarmedUp = true;
    try {
      bridge.prefetchNaturalChunk(GUJARATI_CORRECT_PHRASES[0], this.voiceGender, 'feedback_correct');
      bridge.prefetchNaturalChunk(GUJARATI_WRONG_PHRASES[0], this.voiceGender, 'feedback_wrong');
    } catch {
      // Ignore prefetch errors
    }
  }

  playAnswerFeedback(isCorrect: boolean, initialDelayMs = 0): string {
    const { phrase } = this.phraseTracker.pick(isCorrect);
    this.currentFeedbackPhrase = phrase;
    this.lastError = '';

    this.queue = [
      {
        text: phrase,
        phase: 'feedback',
        tone: isCorrect ? 'feedback_correct' : 'feedback_wrong',
      },
    ];
    this.currentChunkIndex = 0;

    if (!this.voiceEnabled) {
      this.clearTimers();
      this.cancelEngineOnly();
      this.status = 'idle';
      this.phase = 'idle';
      this.emit();
      return phrase;
    }

    this.startCurrentQueue(initialDelayMs);
    return phrase;
  }

  pause(): void {
    if (this.status !== 'speaking' && this.status !== 'loading') return;
    const bridge = this.getNativeBridge();
    if (
      this.status === 'speaking' &&
      this.audioSource !== 'offline_fallback' &&
      bridge?.isHumanVoiceSupported?.() &&
      bridge.pause
    ) {
      this.clearSafetyTimer();
      try {
        bridge.pause();
        this.status = 'paused';
        this.emit();
        return;
      } catch {
        // Fallback below
      }
    }

    this.clearTimers();
    this.cancelEngineOnly();
    this.status = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.status !== 'paused' || this.queue.length === 0) return;
    const bridge = this.getNativeBridge();
    if (
      bridge?.isHumanVoiceSupported?.() &&
      bridge.resume &&
      this.activeUtteranceId &&
      this.audioSource !== 'offline_fallback'
    ) {
      try {
        bridge.resume();
        this.status = 'speaking';
        const activeItem = this.queue[this.currentChunkIndex];
        const estimatedMs = Math.min(35000, Math.max(9000, (activeItem?.text.length ?? 60) * 160));
        this.scheduleSafetyTimer(this.activeSessionId, this.activeUtteranceId, estimatedMs);
        this.emit();
        return;
      } catch {
        // Re-speak current chunk below
      }
    }

    this.status = 'speaking';
    const currentItem = this.queue[this.currentChunkIndex];
    this.phase = currentItem?.phase ?? 'feedback';
    this.emit();
    this.speakChunkAt(this.currentChunkIndex, this.activeSessionId);
  }

  private startCurrentQueue(initialDelayMs: number): void {
    this.clearTimers();
    this.cancelEngineOnly();
    this.activeSessionId += 1;
    const sessionId = this.activeSessionId;

    if (this.queue.length === 0) {
      this.status = 'idle';
      this.phase = 'idle';
      this.emit();
      return;
    }

    const first = this.queue[0];
    this.status = 'speaking';
    this.phase = first.phase;
    this.emit();

    const trigger = () => {
      if (this.activeSessionId !== sessionId || this.status !== 'speaking') return;
      this.speakChunkAt(this.currentChunkIndex, sessionId);
    };

    if (initialDelayMs > 0 && typeof window !== 'undefined') {
      this.delayTimerId = window.setTimeout(trigger, initialDelayMs);
    } else {
      trigger();
    }
  }

  stop(): void {
    this.clearTimers();
    this.activeSessionId += 1;
    this.cancelEngineOnly();
    this.queue = [];
    this.currentChunkIndex = 0;
    this.status = 'idle';
    this.phase = 'idle';
    this.audioSource = 'none';
    this.emit();
  }

  private advanceQueue(): void {
    if (this.status !== 'speaking' && this.status !== 'loading') return;
    const nextIndex = this.currentChunkIndex + 1;
    if (nextIndex >= this.queue.length) {
      this.clearTimers();
      this.activeUtteranceId = '';
      this.status = 'idle';
      this.phase = 'idle';
      this.currentChunkIndex = 0;
      this.emit();
      return;
    }
    this.currentChunkIndex = nextIndex;
    this.phase = this.queue[nextIndex].phase;
    this.status = 'speaking';
    this.emit();
    this.speakChunkAt(nextIndex, this.activeSessionId);
  }

  private prefetchNextChunk(currentIndex: number): void {
    const nextItem = this.queue[currentIndex + 1];
    if (!nextItem) return;
    const bridge = this.getNativeBridge();
    if (bridge?.prefetchNaturalChunk) {
      try {
        bridge.prefetchNaturalChunk(nextItem.text, this.voiceGender, nextItem.tone);
      } catch {
        // Ignore background prefetch errors
      }
    }
  }

  private speakChunkAt(index: number, sessionId: number): void {
    if (
      this.activeSessionId !== sessionId ||
      (this.status !== 'speaking' && this.status !== 'loading')
    ) {
      return;
    }
    const item = this.queue[index];
    if (!item) {
      this.stop();
      return;
    }

    const uttId = `gu_${sessionId}_${index}_${Date.now()}`;
    this.activeUtteranceId = uttId;

    const nativeBridge = this.getNativeBridge();
    if (nativeBridge) {
      try {
        const rate = item.phase === 'feedback' ? 1.0 : 0.98;
        if (nativeBridge.speakNaturalChunk) {
          nativeBridge.speakNaturalChunk(uttId, item.text, this.voiceGender, item.tone, rate);
        } else {
          nativeBridge.speakChunk?.(uttId, item.text, rate);
        }
        this.scheduleSafetyTimer(
          sessionId,
          uttId,
          Math.min(40000, Math.max(12000, item.text.length * 165))
        );
        return;
      } catch {
        this.stop();
        return;
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const guVoice = this.pickWebGujaratiVoice();
      if (!guVoice) {
        this.audioSource = 'none';
        this.stop();
        return;
      }

      try {
        this.audioSource = 'web_speech';
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.voice = guVoice;
        utterance.lang = guVoice.lang || 'gu-IN';
        utterance.rate = item.phase === 'feedback' ? 0.98 : 0.94;
        utterance.pitch = this.voiceGender === 'male' ? 0.92 : 1.04;

        utterance.onend = () => {
          if (this.activeSessionId !== sessionId || this.activeUtteranceId !== uttId) return;
          this.clearSafetyTimer();
          this.advanceQueue();
        };
        utterance.onerror = () => {
          if (this.activeSessionId !== sessionId || this.activeUtteranceId !== uttId) return;
          this.clearSafetyTimer();
          this.stop();
        };

        this.scheduleSafetyTimer(
          sessionId,
          uttId,
          Math.min(28000, Math.max(7000, item.text.length * 150))
        );
        window.speechSynthesis.speak(utterance);
        this.emit();
        return;
      } catch {
        this.stop();
        return;
      }
    }

    this.stop();
  }
}

export const gujaratiVoicePlayer = new GujaratiVoicePlayer();
