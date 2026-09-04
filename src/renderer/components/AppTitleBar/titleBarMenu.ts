export type AppTitleBarSurface = "main" | "workspace";

export type AppTitleBarContext = {
  mangaTabCount: number;
  quickReviewTabCount: number;
  surface: AppTitleBarSurface;
};

export type AppTitleBarMenuAction = {
  commandEventName: string;
  id: string;
  label: string;
  surfaces: AppTitleBarSurface[];
  isAvailable?: (context: AppTitleBarContext) => boolean;
};

export const APP_TITLE_BAR_CONTEXT_EVENT = "app-titlebar-context-changed";
export const CREATE_READING_LIST_EVENT = "workspace-create-reading-list";
export const OPEN_WORKSPACE_QUICK_REVIEW_EVENT = "workspace-open-quick-review";

export const APP_TITLE_BAR_MENU_ACTIONS: AppTitleBarMenuAction[] = [
  {
    id: "create-reading-list",
    label: "Convertir les onglets en liste de lecture",
    commandEventName: CREATE_READING_LIST_EVENT,
    surfaces: ["workspace"],
    isAvailable: (context) => context.mangaTabCount > 0,
  },
  {
    id: "open-quick-review",
    label: "Revoir rapidement les fiches",
    commandEventName: OPEN_WORKSPACE_QUICK_REVIEW_EVENT,
    surfaces: ["workspace"],
    isAvailable: (context) => context.quickReviewTabCount > 0,
  },
];

export const getAvailableTitleBarMenuActions = (
  context: AppTitleBarContext,
): AppTitleBarMenuAction[] => (
  APP_TITLE_BAR_MENU_ACTIONS.filter((action) => (
    action.surfaces.includes(context.surface)
    && (action.isAvailable?.(context) ?? true)
  ))
);
