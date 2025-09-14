import { useEffect, useState } from 'react';
import { Link } from '@/renderer/types';

const useLinks = () => {
    const [links, setLinks] = useState<Link[]>([]);

    useEffect(() => {
        const loadLinks = async () => {
            const response = await fetch('/data/links.json');
            const data = await response.json();
            setLinks(data);
        };

        loadLinks();
    }, []);

    const addLink = async (newLink: Link) => {
        const updatedLinks = [...links, newLink];
        setLinks(updatedLinks);
        await saveLinks(updatedLinks);
    };

    const removeLink = async (linkToRemove: string) => {
        const updatedLinks = links.filter(link => link.url !== linkToRemove);
        setLinks(updatedLinks);
        await saveLinks(updatedLinks);
    };

    const saveLinks = async (linksToSave: Link[]) => {
        await fetch('/data/links.json', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(linksToSave),
        });
    };

    return { links, addLink, removeLink };
};

export default useLinks;