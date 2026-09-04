import { app } from "electron";

export const usesRendererBuild = (): boolean => (
    app.isPackaged || process.env.ELECTRON_DEV_RENDERER_BUILD === "1"
);
