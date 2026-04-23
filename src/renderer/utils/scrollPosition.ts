const scrollableOverflowValues = new Set(['auto', 'scroll', 'overlay']);

const canScrollVertically = (element: HTMLElement): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const style = window.getComputedStyle(element);
  return scrollableOverflowValues.has(style.overflowY)
    && element.scrollHeight > element.clientHeight;
};

export const findVerticalScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  let current = element?.parentElement ?? null;
  while (current) {
    if (canScrollVertically(current)) {
      return current;
    }

    current = current.parentElement;
  }

  const documentScroller = document.scrollingElement;
  return documentScroller instanceof HTMLElement && canScrollVertically(documentScroller)
    ? documentScroller
    : null;
};

export const getCurrentVerticalScrollTop = (element: HTMLElement | null): number => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0;
  }

  const scrollContainer = findVerticalScrollContainer(element);
  const containerScrollTop = scrollContainer?.scrollTop ?? 0;
  const windowScrollTop = window.scrollY || window.pageYOffset || 0;
  const documentScrollTop = document.scrollingElement?.scrollTop
    ?? document.documentElement.scrollTop
    ?? document.body?.scrollTop
    ?? 0;

  return Math.max(containerScrollTop, windowScrollTop, documentScrollTop);
};

export const scrollToVerticalPosition = (
  element: HTMLElement | null,
  scrollTop: number,
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const nextScrollTop = Math.max(0, scrollTop);
  const scrollContainer = findVerticalScrollContainer(element);
  if (scrollContainer) {
    scrollContainer.scrollTo({
      top: nextScrollTop,
      left: 0,
      behavior: 'auto',
    });
    return;
  }

  window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'auto' });
};

export const scrollElementToVerticalStart = (element: HTMLElement | null): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const scrollContainer = findVerticalScrollContainer(element);
  if (scrollContainer && element) {
    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const nextScrollTop = scrollContainer.scrollTop + elementRect.top - containerRect.top;
    scrollContainer.scrollTo({
      top: Math.max(0, nextScrollTop),
      left: 0,
      behavior: 'auto',
    });
    return;
  }

  const nextScrollTop = element
    ? element.getBoundingClientRect().top + window.scrollY
    : 0;

  window.scrollTo({
    top: Math.max(0, nextScrollTop),
    left: 0,
    behavior: 'auto',
  });
};
