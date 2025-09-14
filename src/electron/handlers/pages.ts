import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const imageExt = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

export async function countPages(event: any, folderPath: string) {
    try {
        const entries = await fs.readdir(folderPath);
        let count = 0;
        for (const entry of entries) {
            if (imageExt.test(entry)) count++;
        }
        return count;
    } catch (error: any) {
        console.error('Error counting pages for', folderPath, error);
        return null;
    }
}

export async function getCover(event: any, folderPath: string) {
    try {
        const entries = await fs.readdir(folderPath);
        for (const entry of entries) {
            if (imageExt.test(entry)) {
                const full = path.join(folderPath, entry);
                // Return a local:// URL so renderer can request via our custom protocol
                const fileUrl = pathToFileURL(full).href; // file://... canonical
                // Convert file:// to local:// by replacing the scheme
                return fileUrl.replace(/^file:\/\//, 'local://');
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting cover for', folderPath, error);
        return null;
    }
}

export async function getCoverData(event: any, folderPath: string) {
    try {
        const entries = await fs.readdir(folderPath);
        for (const entry of entries) {
            if (imageExt.test(entry)) {
                const full = path.join(folderPath, entry);
                const buf = await fs.readFile(full);
                const mime = entry.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                const data = `data:${mime};base64,${buf.toString('base64')}`;
                return data;
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting cover data for', folderPath, error);
        return null;
    }
}

export async function listPages(event: any, folderPath: string) {
    try {
        const entries = await fs.readdir(folderPath);
        const images = entries
            .filter(e => imageExt.test(e))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .map(e => {
                const full = path.join(folderPath, e);
                const fileUrl = pathToFileURL(full).href;
                return fileUrl.replace(/^file:\/\//, 'local://');
            });
        return images;
    } catch (error) {
        console.error('Error listing pages for', folderPath, error);
        return [];
    }
}
