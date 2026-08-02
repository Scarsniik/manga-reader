# AdaptiveDropdown

`AdaptiveDropdown` is the shared positioning wrapper for custom dropdown lists.

- It opens downward by default.
- Before paint, it measures the list and the available viewport space.
- If the list would cross the bottom edge, it opens upward instead.
- Its height is capped to the available space and becomes scrollable when needed.
- It recalculates its placement on viewport resize, scrolling, and content resizing.
- It closes on an outside pointer press or `Escape` and restores focus after `Escape`.

The wrapper owns only positioning and dismissal behavior. Consumers provide their own trigger,
content, role, classes, gap, maximum height, and preferred placement so each current visual style
can be preserved.
