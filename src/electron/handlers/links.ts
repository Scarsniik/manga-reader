import { promises as fs } from "fs";
import { shell } from "electron";
import { linksFilePath } from "../utils";

export async function getLinks() {
    try {
        const data = await fs.readFile(linksFilePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading links file:", error);
        throw new Error("Failed to read links");
    }
}

export async function addLink(event: any, link: { url: string; title: string; description?: string }) {
    try {
        const data = await fs.readFile(linksFilePath, "utf-8");
        const links = JSON.parse(data);
        links.push(link);
        await fs.writeFile(linksFilePath, JSON.stringify(links, null, 2));
        return links;
    } catch (error) {
        console.error("Error adding link:", error);
        throw new Error("Failed to add link");
    }
}

export async function removeLink(event: any, url: string) {
    try {
        const data = await fs.readFile(linksFilePath, "utf-8");
        const links = JSON.parse(data);
        const updatedLinks = links.filter((link: { url: string }) => link.url !== url);
        await fs.writeFile(linksFilePath, JSON.stringify(updatedLinks, null, 2));
        return updatedLinks;
    } catch (error) {
        console.error("Error removing link:", error);
        throw new Error("Failed to remove link");
    }
}

export async function openExternalUrl(event: any, input: string) {
    const rawUrl = String(input || "").trim();
    if (!rawUrl) {
        throw new Error("URL is required");
    }

    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Only http and https URLs can be opened");
    }

    await shell.openExternal(parsedUrl.toString());
    return {
        ok: true,
        url: parsedUrl.toString(),
    };
}
