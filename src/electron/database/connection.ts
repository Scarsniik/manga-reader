import { DatabaseSync } from "node:sqlite";
import {
  appHistoryFilePath,
  collectionsDatabaseFilePath,
  scraperBookmarksFilePath,
  scraperReaderProgressFilePath,
  scraperViewHistoryFilePath,
} from "../utils";
import { openCollectionsDatabase } from "./databaseFactory";

let collectionsDatabase: DatabaseSync | null = null;

export const getCollectionsDatabase = (): DatabaseSync => {
  if (!collectionsDatabase) {
    collectionsDatabase = openCollectionsDatabase({
      databasePath: collectionsDatabaseFilePath,
      legacyPaths: {
        bookmarks: scraperBookmarksFilePath,
        viewHistory: scraperViewHistoryFilePath,
        appHistory: appHistoryFilePath,
        readerProgress: scraperReaderProgressFilePath,
      },
    });
  }

  return collectionsDatabase;
};

export const closeCollectionsDatabase = (): void => {
  if (!collectionsDatabase) {
    return;
  }

  collectionsDatabase.close();
  collectionsDatabase = null;
};
