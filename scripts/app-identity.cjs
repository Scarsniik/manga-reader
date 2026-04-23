const DEFAULT_IDENTITY = Object.freeze({
  productName: "Scaramanga",
  packageName: "scaramanga",
  appId: "com.scarsniik.scaramanga",
  artifactBaseName: "Scaramanga",
  userDataDirName: "scaramanga-userdata",
  roamingConfigDirName: "scaramanga",
  localDataDirName: "Scaramanga",
  portableDataDirName: "Scaramanga Data",
  updaterCacheDirName: "scaramanga-updater",
  backupDirName: "Scaramanga-backups",
});

const LEGACY_IDENTITY = Object.freeze({
  productNames: ["Manga Helper"],
  processNames: ["Manga Helper", "manga-helper"],
  userDataDirNames: ["manga-helper-userdata"],
  roamingConfigDirNames: ["manga-helper"],
  localDataDirNames: ["Manga Helper"],
  portableDataDirNames: ["Manga Helper Data"],
  backupDirNames: ["MangaHelper-backups"],
});

const getEnvValue = (env, names, fallback) => {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback;
};

const sanitizePackageName = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_IDENTITY.packageName;
};

const sanitizeArtifactBaseName = (value) => {
  const normalized = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_IDENTITY.artifactBaseName;
};

const resolveAppIdentity = (env = process.env) => {
  const productName = getEnvValue(
    env,
    ["APP_PRODUCT_NAME", "SCARAMANGA_PRODUCT_NAME"],
    DEFAULT_IDENTITY.productName,
  );
  const packageName = getEnvValue(
    env,
    ["APP_PACKAGE_NAME", "SCARAMANGA_PACKAGE_NAME"],
    sanitizePackageName(productName),
  );
  const artifactBaseName = getEnvValue(
    env,
    ["APP_ARTIFACT_BASE_NAME", "SCARAMANGA_ARTIFACT_BASE_NAME"],
    sanitizeArtifactBaseName(productName),
  );

  return {
    productName,
    packageName,
    appId: getEnvValue(env, ["APP_ID", "SCARAMANGA_APP_ID"], DEFAULT_IDENTITY.appId),
    artifactBaseName,
    userDataDirName: getEnvValue(
      env,
      ["APP_USER_DATA_DIR_NAME", "SCARAMANGA_USER_DATA_DIR_NAME"],
      `${packageName}-userdata`,
    ),
    roamingConfigDirName: getEnvValue(
      env,
      ["APP_ROAMING_CONFIG_DIR_NAME", "SCARAMANGA_ROAMING_CONFIG_DIR_NAME"],
      packageName,
    ),
    localDataDirName: getEnvValue(
      env,
      ["APP_LOCAL_DATA_DIR_NAME", "SCARAMANGA_LOCAL_DATA_DIR_NAME"],
      productName,
    ),
    portableDataDirName: getEnvValue(
      env,
      ["APP_PORTABLE_DATA_DIR_NAME", "SCARAMANGA_PORTABLE_DATA_DIR_NAME"],
      `${productName} Data`,
    ),
    updaterCacheDirName: getEnvValue(
      env,
      ["APP_UPDATER_CACHE_DIR_NAME", "SCARAMANGA_UPDATER_CACHE_DIR_NAME"],
      `${packageName}-updater`,
    ),
    backupDirName: getEnvValue(
      env,
      ["APP_BACKUP_DIR_NAME", "SCARAMANGA_BACKUP_DIR_NAME"],
      `${artifactBaseName}-backups`,
    ),
    legacy: LEGACY_IDENTITY,
  };
};

module.exports = {
  DEFAULT_IDENTITY,
  LEGACY_IDENTITY,
  resolveAppIdentity,
  sanitizeArtifactBaseName,
  sanitizePackageName,
};
