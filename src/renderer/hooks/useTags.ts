import { useContext } from 'react';
import TagsContext from '@/renderer/context/TagsContext';

export function useTags() {
  const ctx = useContext(TagsContext);
  if (!ctx) throw new Error('useTags must be used within a TagsProvider');
  return ctx;
}

export default useTags;
