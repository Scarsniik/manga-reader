const { resolveAppIdentity } = require("./scripts/app-identity.cjs");

const appIdentity = resolveAppIdentity();

module.exports = {
  appId: appIdentity.appId,
  productName: appIdentity.productName,
  artifactName: `${appIdentity.artifactBaseName}-\${version}-\${arch}.\${ext}`,
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
  extraMetadata: {
    name: appIdentity.packageName,
    productName: appIdentity.productName,
  },
};
