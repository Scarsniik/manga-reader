import { clipboard, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const resolveImagePath = (imagePathOrUrl: string): string => {
    if (imagePathOrUrl.startsWith("local://")) {
        let localPath = imagePathOrUrl.replace(/^local:\/\//, "");
        if (localPath.startsWith("/")) {
            localPath = localPath.slice(1);
        }
        return path.normalize(decodeURI(localPath));
    }

    if (imagePathOrUrl.startsWith("file://")) {
        return fileURLToPath(imagePathOrUrl);
    }

    return path.normalize(imagePathOrUrl);
};

const loadNativeImage = (imagePathOrUrl: string) => {
    if (!imagePathOrUrl) {
        throw new Error("Missing image path");
    }

    if (imagePathOrUrl.startsWith("data:image/")) {
        return nativeImage.createFromDataURL(imagePathOrUrl);
    }

    const resolvedPath = resolveImagePath(imagePathOrUrl);
    return nativeImage.createFromPath(resolvedPath);
};

export async function copyImageToClipboard(event: any, imagePathOrUrl: string) {
    try {
        const image = loadNativeImage(imagePathOrUrl);
        if (image.isEmpty()) {
            throw new Error("Unable to load image");
        }

        clipboard.writeImage(image);
        return { ok: true };
    } catch (error: any) {
        console.error("Error copying image to clipboard", imagePathOrUrl, error);
        return {
            ok: false,
            error: String(error && error.message ? error.message : error),
        };
    }
}
