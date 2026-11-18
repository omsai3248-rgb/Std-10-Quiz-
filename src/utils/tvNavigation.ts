import { useEffect } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right';

function isElementVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
    return false;
  }
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusableElements(): HTMLElement[] {
  const selector = [
    'button:not([disabled]):not([aria-hidden="true"])',
    'a[href]:not([aria-hidden="true"])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
  ].join(',');

  // Restrict navigation to topmost modal dialog if one is open
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  const scope: ParentNode = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document;

  return Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(isElementVisible);
}

export function findSpatialFocusTarget(
  current: HTMLElement | null,
  direction: Direction,
  candidates: HTMLElement[]
): HTMLElement | null {
  if (candidates.length === 0) return null;
  if (!current || !candidates.includes(current)) {
    return candidates[0];
  }

  const curRect = current.getBoundingClientRect();
  const curCx = curRect.left + curRect.width / 2;
  const curCy = curRect.top + curRect.height / 2;

  let bestTarget: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const cand of candidates) {
    if (cand === current) continue;
    const r = cand.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const dx = cx - curCx;
    const dy = cy - curCy;

    const inDirection =
      (direction === 'right' && dx > 8) ||
      (direction === 'left' && dx < -8) ||
      (direction === 'down' && dy > 8) ||
      (direction === 'up' && dy < -8);

    if (!inDirection) continue;

    // Weight orthogonal offset higher so D-pad stays in intuitive rows/columns
    const primaryDist =
      direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const crossDist =
      direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

    const score = primaryDist + crossDist * 2.2;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = cand;
    }
  }

  return bestTarget;
}

/**
 * Enables Android TV D-pad / hardware keyboard spatial focus navigation across buttons, inputs,
 * cards, and menus without interfering with typing inside text inputs or textareas.
 */
export function useTvRemoteNavigation(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase() ?? '';
      const isTextEditing =
        tag === 'textarea' ||
        (tag === 'input' &&
          !['button', 'submit', 'checkbox', 'radio'].includes(
            (active as HTMLInputElement).type?.toLowerCase()
          ));

      // Inside text inputs allow left/right caret movement cleanly; Up/Down still navigate controls
      if (isTextEditing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      }

      const dirMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };

      const direction = dirMap[e.key];
      if (!direction) return;

      const candidates = getFocusableElements();
      const next = findSpatialFocusTarget(active, direction, candidates);
      if (next) {
        e.preventDefault();
        next.focus({ preventScroll: false });
        next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
