import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import {
  migrateLegacyCollections,
  type LegacyCollectionPaths,
} from "./legacyMigration";
import {
  configureCollectionsDatabase,
  migrateCollectionsSchema,
} from "./schema";

export type OpenCollectionsDatabaseOptions = {
  databasePath: string;
  legacyPaths: LegacyCollectionPaths;
};

export const openCollectionsDatabase = ({
  databasePath,
  legacyPaths,
}: OpenCollectionsDatabaseOptions): DatabaseSync => {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  try {
    configureCollectionsDatabase(database);
    migrateCollectionsSchema(database);
    migrateLegacyCollections(database, legacyPaths);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
};
