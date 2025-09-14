import { useContext } from 'react';
import AuthorsContext from '@/renderer/context/AuthorsContext';

export function useAuthors() {
  const ctx = useContext(AuthorsContext);
  if (!ctx) throw new Error('useAuthors must be used within an AuthorsProvider');
  return ctx;
}

export default useAuthors;
