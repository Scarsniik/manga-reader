import { useEffect } from "react";

const MIDDLE_CLICK_BUTTON = 1;
const PREVENT_AUTO_SCROLL_SELECTOR = "[data-prevent-middle-click-autoscroll=\"true\"]";

const shouldPreventMiddleClickAutoScroll = (event: MouseEvent): boolean => {
  if (event.button !== MIDDLE_CLICK_BUTTON) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest(PREVENT_AUTO_SCROLL_SELECTOR));
};

export default function usePreventMiddleClickAutoScroll() {
  useEffect(() => {
    const preventAutoScroll = (event: MouseEvent) => {
      if (shouldPreventMiddleClickAutoScroll(event)) {
        event.preventDefault();
      }
    };

    document.addEventListener("mousedown", preventAutoScroll, true);

    return () => {
      document.removeEventListener("mousedown", preventAutoScroll, true);
    };
  }, []);
}
