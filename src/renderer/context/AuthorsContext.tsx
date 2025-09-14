import React, { createContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Author } from '@/renderer/types';
import generateId from '@/utils/id';

export type AuthorsContextValue = {
  authors: Author[];
  refresh: () => Promise<void>;
  // input should NOT contain id or createdAt
  addAuthor: (a: Omit<Author, 'id' | 'createdAt'>) => Promise<Author[]>;
  removeAuthor: (id: string) => Promise<Author[]>;
  updateAuthor: (a: Author) => Promise<Author[]>;
};

const AuthorsContext = createContext<AuthorsContextValue | undefined>(undefined);

export const AuthorsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authors, setAuthors] = useState<Author[]>([]);

  const load = useCallback(async () => {
    try {
      if (window.api && typeof (window.api as any).getAuthors === 'function') {
        const data = await (window.api as any).getAuthors();
        setAuthors(data || []);
      }
    } catch (err) {
      console.error('AuthorsProvider.load failed', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => load();

  const addAuthor = async (a: Omit<Author, 'id' | 'createdAt'>) => {
    const toAdd: Author = { ...a, id: generateId(), createdAt: new Date().toISOString() } as Author;
    const res = await (window.api as any).addAuthor(toAdd);
    setAuthors(res || []);
    return res;
  };

  const removeAuthor = async (id: string) => {
    const res = await (window.api as any).removeAuthor(id);
    setAuthors(res || []);
    return res;
  };

  const updateAuthor = async (a: Author) => {
    const res = await (window.api as any).updateAuthor(a);
    setAuthors(res || []);
    return res;
  };

  return (
    <AuthorsContext.Provider value={{ authors, refresh, addAuthor, removeAuthor, updateAuthor }}>
      {children}
    </AuthorsContext.Provider>
  );
};

export default AuthorsContext;
