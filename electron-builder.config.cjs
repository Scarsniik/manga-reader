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

const readPackageMetadata = () => {
  const packageJsonPath = path.join(__dirname, "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
};

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
  const owner = GITHUB_OWNER_ENV_NAMES
    .map((name) => process.env[name])
    .find((value) => typeof value === "string" && value.trim().length > 0);
  const repo = GITHUB_REPO_ENV_NAMES
    .map((name) => process.env[name])
    .find((value) => typeof value === "string" && value.trim().length > 0);

  if (owner && repo) {
    return {
      owner: owner.trim(),
      repo: repo.trim(),
    };
  }

  return parseGithubRepository(readPackageMetadata().repository);
};

const publishRepository = resolveGithubPublishRepository();

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
  },
};
