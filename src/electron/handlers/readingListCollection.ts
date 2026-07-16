import type {
  SavedReadingList,
  SavedReadingListItem,
} from "../../shared/readingList";

type ReadingListCollectionSaveOptions = {
  createId: () => string;
  createdAt: string;
  savedListId?: string;
};

type ReadingListCollectionSaveResult = {
  lists: SavedReadingList[];
  savedList: SavedReadingList;
};

export const applyReadingListSave = (
  lists: SavedReadingList[],
  items: SavedReadingListItem[],
  options: ReadingListCollectionSaveOptions,
): ReadingListCollectionSaveResult => {
  if (!options.savedListId) {
    const savedList: SavedReadingList = {
      id: options.createId(),
      items,
      createdAt: options.createdAt,
    };

    return {
      lists: [savedList, ...lists],
      savedList,
    };
  }

  const savedListIndex = lists.findIndex((list) => list.id === options.savedListId);
  if (savedListIndex < 0) {
    throw new Error("La liste de lecture à modifier n'existe plus.");
  }

  const savedList: SavedReadingList = {
    ...lists[savedListIndex],
    items,
  };
  const nextLists = [...lists];
  nextLists[savedListIndex] = savedList;

  return {
    lists: nextLists,
    savedList,
  };
};
