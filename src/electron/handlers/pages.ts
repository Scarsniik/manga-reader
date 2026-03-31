import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const imageExt = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;

export async function listImageFiles(folderPath: string) {
    const entries = await fs.readdir(folderPath);
    return entries
        .filter(e => imageExt.test(e))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map(e => path.join(folderPath, e));
}

export async function countPages(event: any, folderPath: string) {
    try {
        const files = await listImageFiles(folderPath);
        return files.length;
    } catch (error: any) {
        console.error('Error counting pages for', folderPath, error);
        return null;
    }
}

export async function getCover(event: any, folderPath: string) {
    try {
        const files = await listImageFiles(folderPath);
        for (const full of files) {
            const fileUrl = pathToFileURL(full).href;
            return fileUrl.replace(/^file:\/\//, 'local://');
        }
        return null;
    } catch (error) {
        console.error('Error getting cover for', folderPath, error);
        return null;
    }
}

export async function getCoverData(event: any, folderPath: string) {
    try {
        const files = await listImageFiles(folderPath);
        for (const full of files) {
            const buf = await fs.readFile(full);
            const mime = full.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            const data = `data:${mime};base64,${buf.toString('base64')}`;
            return data;
        }
        return null;
    } catch (error) {
        console.error('Error getting cover data for', folderPath, error);
        return null;
    }
}

export async function listPages(event: any, folderPath: string) {
    try {
        const files = await listImageFiles(folderPath);
        const images = files.map((full) => {
            const fileUrl = pathToFileURL(full).href;
            return fileUrl.replace(/^file:\/\//, 'local://');
        });
        return images;
    } catch (error) {
        console.error('Error listing pages for', folderPath, error);
        return [];
    }
}
