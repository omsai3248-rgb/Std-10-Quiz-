import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyNativeAndWebDisplayMode,
  classifyAdaptiveDisplay,
  collectWebDisplayInput,
  loadSavedDisplaySettings,
  persistDisplaySettings,
  type AdaptiveDisplayState,
  type DisplayModeSetting,
  type DisplaySettings,
} from '../services/adaptiveDisplay';

interface AdaptiveDisplayContextValue extends AdaptiveDisplayState {
  isKeyboardOrRemoteActive: boolean;
  setDisplayMode: (mode: DisplayModeSetting) => void;
  setFullScreenMode: (enabled: boolean) => void;
  toggleFullScreenMode: () => void;
  resetDisplaySettings: () => void;
}

const defaultSettings = loadSavedDisplaySettings();
const defaultState = classifyAdaptiveDisplay(collectWebDisplayInput(null), defaultSettings);

const AdaptiveDisplayContext = createContext<AdaptiveDisplayContextValue>({
  ...defaultState,
  isKeyboardOrRemoteActive: defaultState.isRemoteNavigable,
  setDisplayMode: () => {},
  setFullScreenMode: () => {},
  toggleFullScreenMode: () => {},
  resetDisplaySettings: () => {},
});

interface WindowWithDisplayCallback extends Window {
  __onNativeDisplayMetricsChanged?: (payload: Record<string, unknown>) => void;
}

export const AdaptiveDisplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DisplaySettings>(() => loadSavedDisplaySettings());
  const [nativePayload, setNativePayload] = useState<Record<string, unknown> | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [isKeyboardOrRemoteActive, setIsKeyboardOrRemoteActive] = useState(false);

  const adaptiveState = useMemo(() => {
    void viewportTick;
    const raw = collectWebDisplayInput(nativePayload);
    return classifyAdaptiveDisplay(raw, settings);
  }, [nativePayload, settings, viewportTick]);

  // Keep CSS root variables and semantic data-* attributes in sync with live adaptive display state
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--adaptive-font-scale', String(adaptiveState.fontScale));
    root.style.setProperty('--adaptive-space-scale', String(adaptiveState.spacingScale));
    root.style.fontSize = `${adaptiveState.rootFontPx}px`;

    root.dataset.deviceType = adaptiveState.deviceType;
    root.dataset.windowSize = adaptiveState.windowSizeClass;
    root.dataset.orientation = adaptiveState.effectiveOrientation;
    root.dataset.displayMode = adaptiveState.displayMode;
    root.dataset.fullscreen = adaptiveState.isFullScreen ? 'true' : 'false';
    root.dataset.tvMode = adaptiveState.isTvOrSmartBoard ? 'true' : 'false';
    root.dataset.hingePosture = adaptiveState.hingePosture;
  }, [adaptiveState]);

  // Listen to browser resizes, orientation flips, fullscreen exits, and native Jetpack WindowManager pushes
  useEffect(() => {
    const w = window as WindowWithDisplayCallback;
    const bump = () => setViewportTick((t) => t + 1);

    w.__onNativeDisplayMetricsChanged = (payload: Record<string, unknown>) => {
      setNativePayload(payload);
      if (
        payload.displayMode === 'auto_adaptive' ||
        payload.displayMode === 'portrait' ||
        payload.displayMode === 'landscape'
      ) {
        setSettings((prev) => {
          const next: DisplaySettings = {
            displayMode: payload.displayMode as DisplayModeSetting,
            isFullScreen:
              typeof payload.isFullScreen === 'boolean'
                ? payload.isFullScreen
                : prev.isFullScreen,
          };
          persistDisplaySettings(next);
          return next;
        });
      }
      bump();
    };

    const onFullscreenChange = () => {
      const browserFullscreen = Boolean(document.fullscreenElement);
      // Only sync down from browser fullscreen exit if running outside native Android bridge
      if (!(window as unknown as { AndroidDisplayBridge?: unknown }).AndroidDisplayBridge) {
        setSettings((prev) => {
          if (prev.isFullScreen === browserFullscreen) return prev;
          const next = { ...prev, isFullScreen: browserFullscreen };
          persistDisplaySettings(next);
          return next;
        });
      }
      bump();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'Tab'
      ) {
        setIsKeyboardOrRemoteActive(true);
      }
    };

    const onPointerDown = () => {
      setIsKeyboardOrRemoteActive(false);
    };

    window.addEventListener('resize', bump);
    window.addEventListener('orientationchange', bump);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      delete w.__onNativeDisplayMetricsChanged;
      window.removeEventListener('resize', bump);
      window.removeEventListener('orientationchange', bump);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  const setDisplayMode = useCallback((mode: DisplayModeSetting) => {
    setSettings((prev) => {
      const next: DisplaySettings = { ...prev, displayMode: mode };
      applyNativeAndWebDisplayMode(next);
      return next;
    });
  }, []);

  const setFullScreenMode = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next: DisplaySettings = { ...prev, isFullScreen: enabled };
      applyNativeAndWebDisplayMode(next);
      return next;
    });
  }, []);

  const toggleFullScreenMode = useCallback(() => {
    setSettings((prev) => {
      const next: DisplaySettings = { ...prev, isFullScreen: !prev.isFullScreen };
      applyNativeAndWebDisplayMode(next);
      return next;
    });
  }, []);

  const resetDisplaySettings = useCallback(() => {
    const next: DisplaySettings = { displayMode: 'auto_adaptive', isFullScreen: false };
    setSettings(next);
    applyNativeAndWebDisplayMode(next);
  }, []);

  const value = useMemo<AdaptiveDisplayContextValue>(
    () => ({
      ...adaptiveState,
      isKeyboardOrRemoteActive: isKeyboardOrRemoteActive || adaptiveState.isRemoteNavigable,
      setDisplayMode,
      setFullScreenMode,
      toggleFullScreenMode,
      resetDisplaySettings,
    }),
    [
      adaptiveState,
      isKeyboardOrRemoteActive,
      resetDisplaySettings,
      setDisplayMode,
      setFullScreenMode,
      toggleFullScreenMode,
    ]
  );

  return (
    <AdaptiveDisplayContext.Provider value={value}>{children}</AdaptiveDisplayContext.Provider>
  );
};

export function useAdaptiveDisplay(): AdaptiveDisplayContextValue {
  return useContext(AdaptiveDisplayContext);
}
