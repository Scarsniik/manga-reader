import React, { createContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Tag } from '@/renderer/types';
import generateId from '@/utils/id';

export type TagsContextValue = {
  tags: Tag[];
  refresh: () => Promise<void>;
  // input should NOT contain id or createdAt
  addTag: (t: Omit<Tag, 'id' | 'createdAt'>) => Promise<Tag[]>;
  removeTag: (id: string) => Promise<Tag[]>;
  updateTag: (t: Tag) => Promise<Tag[]>;
};

const TagsContext = createContext<TagsContextValue | undefined>(undefined);

export const TagsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tags, setTags] = useState<Tag[]>([]);

  const load = useCallback(async () => {
    try {
      if (window.api && typeof (window.api as any).getTags === 'function') {
        const data = await (window.api as any).getTags();
        setTags(data || []);
      }
    } catch (err) {
      console.error('TagsProvider.load failed', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => load();

  const addTag = async (t: Omit<Tag, 'id' | 'createdAt'>) => {
    const toAdd: Tag = { ...t, id: generateId(), createdAt: new Date().toISOString() } as Tag;
    const res = await (window.api as any).addTag(toAdd);
    setTags(res || []);
    return res;
  };

  const removeTag = async (id: string) => {
    const res = await (window.api as any).removeTag(id);
    setTags(res || []);
    return res;
  };

  const updateTag = async (t: Tag) => {
    const res = await (window.api as any).updateTag(t);
    setTags(res || []);
    return res;
  };

  return (
    <TagsContext.Provider value={{ tags, refresh, addTag, removeTag, updateTag }}>
      {children}
    </TagsContext.Provider>
  );
};

export default TagsContext;
