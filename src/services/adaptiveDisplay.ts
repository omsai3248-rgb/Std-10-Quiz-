export type DisplayModeSetting = 'auto_adaptive' | 'portrait' | 'landscape';

export type DeviceType =
  | 'mobile_phone'
  | 'tablet'
  | 'smart_board'
  | 'android_tv'
  | 'large_touchscreen'
  | 'landscape_monitor'
  | 'foldable';

export type WindowSizeClass = 'compact' | 'medium' | 'expanded' | 'large' | 'xlarge';

export type ScreenOrientation = 'portrait' | 'landscape';

export type HingePosture = 'none' | 'flat' | 'book' | 'tabletop';

export type ScreenSizeProfileId =
  | 'phone_5'
  | 'phone_6_5'
  | 'tablet_8'
  | 'tablet_10'
  | 'tv_32'
  | 'tv_43'
  | 'smartboard_55'
  | 'smartboard_65'
  | 'smartboard_75'
  | 'smartboard_86'
  | 'foldable_unfolded';

export interface DisplaySettings {
  displayMode: DisplayModeSetting;
  isFullScreen: boolean;
}

export interface RawDisplayInput {
  widthDp: number;
  heightDp: number;
  widthPx?: number;
  heightPx?: number;
  density?: number;
  diagonalInches?: number;
  smallestWidthDp?: number;
  isTelevision?: boolean;
  hasLeanback?: boolean;
  hasTouchscreen?: boolean;
  isFoldable?: boolean;
  hingePosture?: HingePosture;
  userAgent?: string;
  deviceTypeHint?: DeviceType;
}

export interface AdaptiveDisplayState {
  deviceType: DeviceType;
  windowSizeClass: WindowSizeClass;
  physicalOrientation: ScreenOrientation;
  effectiveOrientation: ScreenOrientation;
  hingePosture: HingePosture;
  isFoldable: boolean;
  isTelevision: boolean;
  hasTouchscreen: boolean;
  isTvOrSmartBoard: boolean;
  isLargeScreen: boolean;
  isRemoteNavigable: boolean;
  displayMode: DisplayModeSetting;
  isFullScreen: boolean;
  widthDp: number;
  heightDp: number;
  smallestWidthDp: number;
  widthPx: number;
  heightPx: number;
  diagonalInches: number;
  aspectRatio: number;
  fontScale: number;
  rootFontPx: number;
  spacingScale: number;
  gridColumns: 1 | 2 | 3;
  useNavigationRail: boolean;
  useSplitLayout: boolean;
  useSplitQuizCockpit: boolean;
  screenProfileId: ScreenSizeProfileId;
  screenProfileLabel: string;
}

export const DISPLAY_SETTINGS_STORAGE_KEY = 'std10_display_settings_v1';

interface NativeDisplayBridgeApi {
  getDisplayState?: () => string;
  setDisplayMode?: (mode: string) => void;
  setFullScreenMode?: (enabled: boolean) => void;
}

interface WindowWithNativeDisplay extends Window {
  AndroidDisplayBridge?: NativeDisplayBridgeApi;
  __onNativeDisplayMetricsChanged?: (payload: Record<string, unknown>) => void;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  displayMode: 'auto_adaptive',
  isFullScreen: false,
};

export function normalizeDisplayMode(raw: unknown): DisplayModeSetting {
  if (raw === 'portrait' || raw === 'landscape' || raw === 'auto_adaptive') {
    return raw;
  }
  return 'auto_adaptive';
}

export function loadSavedDisplaySettings(): DisplaySettings {
  try {
    if (typeof window !== 'undefined') {
      const w = window as WindowWithNativeDisplay;
      const nativeJson = w.AndroidDisplayBridge?.getDisplayState?.();
      if (nativeJson) {
        const parsed = JSON.parse(nativeJson) as {
          displayMode?: unknown;
          isFullScreen?: unknown;
        };
        return {
          displayMode: normalizeDisplayMode(parsed.displayMode),
          isFullScreen: Boolean(parsed.isFullScreen),
        };
      }
    }
    const raw = localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
    const parsed = JSON.parse(raw) as { displayMode?: unknown; isFullScreen?: unknown };
    return {
      displayMode: normalizeDisplayMode(parsed.displayMode),
      isFullScreen: Boolean(parsed.isFullScreen),
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function persistDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function estimateDiagonalInches(
  widthDp: number,
  heightDp: number,
  explicitDiagonal?: number
): number {
  if (typeof explicitDiagonal === 'number' && Number.isFinite(explicitDiagonal) && explicitDiagonal >= 3.5) {
    return Math.round(explicitDiagonal * 10) / 10;
  }
  // Standard Android baseline density ≈ 160 dpi in dp
  const diag = Math.hypot(widthDp, heightDp) / 160;
  return Math.round(Math.max(4.5, diag) * 10) / 10;
}

export function resolveWindowSizeClass(widthDp: number): WindowSizeClass {
  if (widthDp >= 1600) return 'xlarge';
  if (widthDp >= 1200) return 'large';
  if (widthDp >= 840) return 'expanded';
  if (widthDp >= 600) return 'medium';
  return 'compact';
}

export function resolveScreenProfile(params: {
  deviceType: DeviceType;
  diagonalInches: number;
  smallestWidthDp: number;
  widthDp: number;
}): { id: ScreenSizeProfileId; label: string } {
  const { deviceType, diagonalInches, smallestWidthDp, widthDp } = params;

  if (deviceType === 'android_tv') {
    if (diagonalInches >= 40 || widthDp >= 1600) {
      return { id: 'tv_43', label: 'Android Smart TV (43"+)' };
    }
    return { id: 'tv_32', label: 'Android Smart TV (32")' };
  }

  if (deviceType === 'smart_board' || deviceType === 'large_touchscreen') {
    if (diagonalInches >= 80 || widthDp >= 2200) {
      return { id: 'smartboard_86', label: 'Smart Board (86" Interactive)' };
    }
    if (diagonalInches >= 70 || widthDp >= 1900) {
      return { id: 'smartboard_75', label: 'Smart Board (75" Interactive)' };
    }
    if (diagonalInches >= 60 || widthDp >= 1600) {
      return { id: 'smartboard_65', label: 'Smart Board (65" Interactive)' };
    }
    return { id: 'smartboard_55', label: 'Smart Board (55" Interactive)' };
  }

  if (deviceType === 'landscape_monitor') {
    return { id: 'smartboard_55', label: 'Landscape Display / Monitor' };
  }

  if (deviceType === 'foldable') {
    return { id: 'foldable_unfolded', label: 'Foldable Device' };
  }

  if (deviceType === 'tablet') {
    if (diagonalInches >= 9.5 || smallestWidthDp >= 780 || widthDp >= 1200) {
      return { id: 'tablet_10', label: '10" Tablet Display' };
    }
    return { id: 'tablet_8', label: '8" Tablet Display' };
  }

  if (diagonalInches <= 5.4 && smallestWidthDp <= 375) {
    return { id: 'phone_5', label: '5" Compact Mobile' };
  }
  return { id: 'phone_6_5', label: '6.5" Mobile Phone' };
}

export function classifyAdaptiveDisplay(
  input: RawDisplayInput,
  settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS
): AdaptiveDisplayState {
  const widthDp = Math.max(240, Math.round(input.widthDp || 360));
  const heightDp = Math.max(240, Math.round(input.heightDp || 640));
  const density = Math.max(0.5, input.density ?? 1);
  const widthPx = Math.round(input.widthPx ?? widthDp * density);
  const heightPx = Math.round(input.heightPx ?? heightDp * density);
  const smallestWidthDp = Math.round(input.smallestWidthDp ?? Math.min(widthDp, heightDp));
  const maxDimDp = Math.max(widthDp, heightDp);
  const maxDimPx = Math.max(widthPx, heightPx);
  const aspectRatio =
    Math.round((maxDimDp / Math.max(1, Math.min(widthDp, heightDp))) * 100) / 100;

  const ua = (input.userAgent ?? '').toLowerCase();
  const uaLooksTv =
    ua.includes('android tv') ||
    ua.includes('googletv') ||
    ua.includes('bravia') ||
    ua.includes('smarttv') ||
    ua.includes('aftt') ||
    ua.includes('aftm');

  const isTelevision = Boolean(input.isTelevision || uaLooksTv);
  const hasLeanback = Boolean(input.hasLeanback || isTelevision);
  const hasTouchscreen = input.hasTouchscreen ?? !isTelevision;
  const isFoldable = Boolean(input.isFoldable || (input.hingePosture && input.hingePosture !== 'none'));
  const hingePosture: HingePosture = input.hingePosture ?? 'none';

  const diagonalInches = estimateDiagonalInches(widthDp, heightDp, input.diagonalInches);

  const detectedDeviceType: DeviceType = (() => {
    if (input.deviceTypeHint) return input.deviceTypeHint;
    if (isTelevision || (hasLeanback && !hasTouchscreen)) return 'android_tv';
    if (
      hasTouchscreen &&
      (diagonalInches >= 22 ||
        (smallestWidthDp >= 900 && maxDimPx >= 1920 && !isFoldable && diagonalInches >= 18))
    ) {
      return 'smart_board';
    }
    if (isFoldable) return 'foldable';
    if (hasTouchscreen && diagonalInches >= 13.5 && maxDimDp >= 1200) return 'large_touchscreen';
    if (!hasTouchscreen && maxDimDp >= 840) return 'landscape_monitor';
    if (smallestWidthDp >= 600 || diagonalInches >= 7.2) return 'tablet';
    return 'mobile_phone';
  })();

  const physicalOrientation: ScreenOrientation = widthDp >= heightDp ? 'landscape' : 'portrait';
  const isTvOrSmartBoard =
    detectedDeviceType === 'android_tv' ||
    detectedDeviceType === 'smart_board' ||
    detectedDeviceType === 'large_touchscreen' ||
    detectedDeviceType === 'landscape_monitor';

  const effectiveOrientation: ScreenOrientation =
    settings.displayMode === 'portrait'
      ? 'portrait'
      : settings.displayMode === 'landscape'
        ? 'landscape'
        : isTvOrSmartBoard
          ? 'landscape'
          : physicalOrientation;

  // When a user manually forces Portrait/Landscape mode in browser/preview, swap effective layout dimensions cleanly if needed
  const layoutWidthDp =
    settings.displayMode === 'portrait' && widthDp > heightDp
      ? heightDp
      : settings.displayMode === 'landscape' && heightDp > widthDp
        ? heightDp
        : widthDp;

  const windowSizeClass = resolveWindowSizeClass(layoutWidthDp);

  const profile = resolveScreenProfile({
    deviceType: detectedDeviceType,
    diagonalInches,
    smallestWidthDp,
    widthDp: layoutWidthDp,
  });

  const fontScale = (() => {
    switch (profile.id) {
      case 'smartboard_86':
        return 1.32;
      case 'smartboard_75':
        return 1.28;
      case 'smartboard_65':
        return 1.24;
      case 'smartboard_55':
        return 1.18;
      case 'tv_43':
        return 1.24;
      case 'tv_32':
        return 1.18;
      case 'tablet_10':
        return 1.08;
      case 'tablet_8':
      case 'foldable_unfolded':
        return 1.04;
      case 'phone_5':
        return 0.96;
      default:
        return 1.0;
    }
  })();

  const rootFontPx = Math.round(16 * fontScale * 10) / 10;
  const spacingScale = fontScale >= 1.18 ? 1.15 : fontScale >= 1.04 ? 1.06 : 1.0;
  const isLargeScreen = windowSizeClass !== 'compact' || isTvOrSmartBoard;
  const useNavigationRail =
    effectiveOrientation === 'landscape' &&
    (layoutWidthDp >= 840 || isTvOrSmartBoard || hingePosture === 'book');
  const useSplitLayout =
    layoutWidthDp >= 840 || isTvOrSmartBoard || hingePosture === 'book' || hingePosture === 'tabletop';
  const useSplitQuizCockpit =
    (effectiveOrientation === 'landscape' && layoutWidthDp >= 720) ||
    layoutWidthDp >= 900 ||
    isTvOrSmartBoard ||
    hingePosture === 'book' ||
    hingePosture === 'tabletop';

  const gridColumns: 1 | 2 | 3 =
    layoutWidthDp >= 1200 || isTvOrSmartBoard ? 3 : layoutWidthDp >= 640 ? 2 : 1;

  return {
    deviceType: detectedDeviceType,
    windowSizeClass,
    physicalOrientation,
    effectiveOrientation,
    hingePosture,
    isFoldable,
    isTelevision,
    hasTouchscreen,
    isTvOrSmartBoard,
    isLargeScreen,
    isRemoteNavigable: isTelevision || !hasTouchscreen,
    displayMode: settings.displayMode,
    isFullScreen: settings.isFullScreen,
    widthDp,
    heightDp,
    smallestWidthDp,
    widthPx,
    heightPx,
    diagonalInches,
    aspectRatio,
    fontScale,
    rootFontPx,
    spacingScale,
    gridColumns,
    useNavigationRail,
    useSplitLayout,
    useSplitQuizCockpit,
    screenProfileId: profile.id,
    screenProfileLabel: profile.label,
  };
}

export function collectWebDisplayInput(nativePayload?: Record<string, unknown> | null): RawDisplayInput {
  if (typeof window === 'undefined') {
    return { widthDp: 360, heightDp: 640 };
  }

  let nativeData = nativePayload;
  if (!nativeData) {
    try {
      const w = window as WindowWithNativeDisplay;
      const rawJson = w.AndroidDisplayBridge?.getDisplayState?.();
      if (rawJson) {
        nativeData = JSON.parse(rawJson) as Record<string, unknown>;
      }
    } catch {
      nativeData = null;
    }
  }

  const vw = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 360);
  const vh = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0, 640);
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const finePointerOnly =
    (window.matchMedia?.('(pointer: fine)')?.matches ?? false) && !coarsePointer;

  if (nativeData && typeof nativeData === 'object') {
    return {
      widthDp: typeof nativeData.widthDp === 'number' && nativeData.widthDp > 0 ? nativeData.widthDp : vw,
      heightDp: typeof nativeData.heightDp === 'number' && nativeData.heightDp > 0 ? nativeData.heightDp : vh,
      widthPx: typeof nativeData.widthPx === 'number' ? nativeData.widthPx : undefined,
      heightPx: typeof nativeData.heightPx === 'number' ? nativeData.heightPx : undefined,
      density: typeof nativeData.density === 'number' ? nativeData.density : window.devicePixelRatio || 1,
      diagonalInches:
        typeof nativeData.diagonalInches === 'number' ? nativeData.diagonalInches : undefined,
      smallestWidthDp:
        typeof nativeData.smallestWidthDp === 'number' ? nativeData.smallestWidthDp : undefined,
      isTelevision: Boolean(nativeData.isTelevision),
      hasLeanback: Boolean(nativeData.hasLeanback),
      hasTouchscreen:
        typeof nativeData.hasTouchscreen === 'boolean' ? nativeData.hasTouchscreen : !finePointerOnly,
      isFoldable: Boolean(nativeData.isFoldable),
      hingePosture:
        nativeData.hingePosture === 'book' ||
        nativeData.hingePosture === 'tabletop' ||
        nativeData.hingePosture === 'flat'
          ? nativeData.hingePosture
          : 'none',
      deviceTypeHint:
        typeof nativeData.deviceType === 'string'
          ? (nativeData.deviceType as DeviceType)
          : undefined,
      userAgent: navigator.userAgent,
    };
  }

  const sw = Math.min(vw, vh);
  const hasTouch = coarsePointer || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return {
    widthDp: vw,
    heightDp: vh,
    widthPx: Math.round(vw * (window.devicePixelRatio || 1)),
    heightPx: Math.round(vh * (window.devicePixelRatio || 1)),
    density: window.devicePixelRatio || 1,
    smallestWidthDp: sw,
    hasTouchscreen: hasTouch,
    userAgent: navigator.userAgent,
  };
}

export function applyNativeAndWebDisplayMode(settings: DisplaySettings): void {
  persistDisplaySettings(settings);
  if (typeof window === 'undefined') return;

  const w = window as WindowWithNativeDisplay;
  if (w.AndroidDisplayBridge) {
    try {
      w.AndroidDisplayBridge.setDisplayMode?.(settings.displayMode);
      w.AndroidDisplayBridge.setFullScreenMode?.(settings.isFullScreen);
    } catch {
      // Ignore bridge exceptions on desktop browser
    }
    return;
  }

  // Browser Fullscreen API & Orientation Lock best-effort support
  try {
    const orientationApi = (screen as Screen & {
      orientation?: {
        lock?: (type: string) => Promise<void>;
        unlock?: () => void;
      };
    }).orientation;

    if (orientationApi) {
      if (settings.displayMode === 'portrait') {
        void orientationApi.lock?.('portrait')?.catch(() => {});
      } else if (settings.displayMode === 'landscape') {
        void orientationApi.lock?.('landscape')?.catch(() => {});
      } else {
        orientationApi.unlock?.();
      }
    }
  } catch {
    // Ignore unsupported orientation lock in standard browsers
  }

  try {
    if (settings.isFullScreen) {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.()?.catch(() => {});
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.()?.catch(() => {});
    }
  } catch {
    // Ignore fullscreen gesture rejection in desktop browsers
  }
}
