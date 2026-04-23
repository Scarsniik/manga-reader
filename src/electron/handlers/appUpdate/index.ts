export {
    checkForAppUpdates,
    downloadAppUpdate,
    getAppUpdateStatus,
    initializeAppUpdate,
    installAppUpdate,
    maybeCheckForUpdatesOnStartup,
    openAppUpdateReleasePage,
    scheduleStartupUpdateCheck,
} from "./service";
export { getAppUpdatePatchNotes } from "./patchNotes";
export type {
    AppUpdatePatchNote,
    AppUpdatePatchNotesQuery,
    AppUpdatePatchNotesResult,
    AppUpdateNotificationKind,
    AppUpdateNotificationPayload,
    AppUpdateState,
    AppUpdateStatus,
} from "./types";
