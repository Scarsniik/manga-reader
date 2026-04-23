const fs = require("fs");
const path = require("path");
const { resolveAppIdentity } = require("./scripts/app-identity.cjs");

const appIdentity = resolveAppIdentity();

const GITHUB_OWNER_ENV_NAMES = [
  "APP_UPDATE_GITHUB_OWNER",
  "SCARAMANGA_APP_UPDATE_GITHUB_OWNER",
];
const GITHUB_REPO_ENV_NAMES = [
  "APP_UPDATE_GITHUB_REPO",
  "SCARAMANGA_APP_UPDATE_GITHUB_REPO",
];
const OCR_MANIFEST_URL_ENV_NAMES = [
  "MANGA_HELPER_OCR_MANIFEST_URL",
  "SCARAMANGA_OCR_MANIFEST_URL",
];
const OCR_GITHUB_REPOSITORY_ENV_NAMES = [
  "MANGA_HELPER_OCR_GITHUB_REPOSITORY",
  "SCARAMANGA_OCR_GITHUB_REPOSITORY",
];
const OCR_GITHUB_OWNER_ENV_NAMES = [
  "MANGA_HELPER_OCR_GITHUB_OWNER",
  "SCARAMANGA_OCR_GITHUB_OWNER",
];
const OCR_GITHUB_REPO_ENV_NAMES = [
  "MANGA_HELPER_OCR_GITHUB_REPO",
  "SCARAMANGA_OCR_GITHUB_REPO",
];
const DEFAULT_OCR_RUNTIME_REPOSITORY = {
  owner: "Scarsniik",
  repo: "manga-runtime-OCR",
};

const readPackageMetadata = () => {
  const packageJsonPath = path.join(__dirname, "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
};

const readFirstEnvValue = (names) => names
  .map((name) => process.env[name])
  .find((value) => typeof value === "string" && value.trim().length > 0);

const parseGithubRepository = (repository) => {
  const input = typeof repository === "string"
    ? repository
    : (repository && typeof repository === "object" ? repository.url : "");

  const normalized = String(input || "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/\.git$/i, "");

  const match = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/i);
  if (!match?.groups?.owner || !match.groups.repo) {
    return null;
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  };
};

const resolveGithubPublishRepository = () => {
  const owner = readFirstEnvValue(GITHUB_OWNER_ENV_NAMES);
  const repo = readFirstEnvValue(GITHUB_REPO_ENV_NAMES);

  if (owner && repo) {
    return {
      owner: owner.trim(),
      repo: repo.trim(),
    };
  }

  return parseGithubRepository(readPackageMetadata().repository);
};

const buildGithubLatestAssetUrl = (repository, assetName) => (
  `https://github.com/${repository.owner}/${repository.repo}/releases/latest/download/${assetName}`
);

const resolveOcrRuntimeRepository = () => {
  const repositoryValue = readFirstEnvValue(OCR_GITHUB_REPOSITORY_ENV_NAMES);
  const parsedRepository = parseGithubRepository(repositoryValue)
    || (typeof repositoryValue === "string"
      ? parseGithubRepository(`https://github.com/${repositoryValue.trim()}`)
      : null);

  if (parsedRepository) {
    return parsedRepository;
  }

  const owner = readFirstEnvValue(OCR_GITHUB_OWNER_ENV_NAMES);
  const repo = readFirstEnvValue(OCR_GITHUB_REPO_ENV_NAMES);
  if (owner && repo) {
    return {
      owner: owner.trim(),
      repo: repo.trim(),
    };
  }

  return DEFAULT_OCR_RUNTIME_REPOSITORY;
};

const resolveOcrRuntimeManifestUrl = () => {
  const explicitManifestUrl = readFirstEnvValue(OCR_MANIFEST_URL_ENV_NAMES);
  if (explicitManifestUrl) {
    return explicitManifestUrl.trim();
  }

  return buildGithubLatestAssetUrl(resolveOcrRuntimeRepository(), "manifest.json");
};

const publishRepository = resolveGithubPublishRepository();
const ocrRuntimeManifestUrl = resolveOcrRuntimeManifestUrl();

module.exports = {
  appId: appIdentity.appId,
  productName: appIdentity.productName,
  artifactName: `${appIdentity.artifactBaseName}-\${version}-\${arch}.\${ext}`,
  electronUpdaterCompatibility: ">=2.16",
  files: [
    "dist/**/*",
    "data/**/*",
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: [
          "x64",
        ],
      },
    ],
    forceCodeSigning: false,
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: appIdentity.productName,
    deleteAppDataOnUninstall: false,
  },
  portable: {
    artifactName: `${appIdentity.artifactBaseName}-Portable-\${version}-\${arch}.\${ext}`,
  },
  directories: {
    output: "build",
  },
  publish: publishRepository ? [
    {
      provider: "github",
      owner: publishRepository.owner,
      repo: publishRepository.repo,
      releaseType: process.env.APP_UPDATE_GITHUB_RELEASE_TYPE || "release",
    },
  ] : undefined,
  extraMetadata: {
    name: appIdentity.packageName,
    productName: appIdentity.productName,
    ocrRuntimeManifestUrl,
  },
};
