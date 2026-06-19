const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const workspace = path.resolve(__dirname, "..");
const packagePath = path.join(workspace, "package.json");
const packageLockPath = path.join(workspace, "package-lock.json");
const releaseNotesDir = path.join(workspace, "docs", "release-notes");
const versionArgIndex = process.argv.findIndex((arg) => arg === "--version" || arg === "-v");
const requestedVersion = versionArgIndex >= 0 ? process.argv[versionArgIndex + 1] : null;

const semverPattern = /^\d+\.\d+\.\d+$/;

function compareSemver(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function nextPatchVersion(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function formatRelative(filePath) {
  return path.relative(workspace, filePath).replaceAll(path.sep, "\\");
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function writeSection(title) {
  console.log("");
  console.log(`== ${title} ==`);
}

function writeInfo(label, value) {
  console.log(`${`${label}:`.padEnd(24)} ${value}`);
}

function writeCheck(status, message) {
  console.log(`[${status}] ${message}`);
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packagePath, "utf8"));
}

function readPackageLockVersionIssues(packageVersion) {
  if (!fs.existsSync(packageLockPath)) {
    return [];
  }

  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  const issues = [];

  if (packageLock.version && packageLock.version !== packageVersion) {
    issues.push(`package-lock.json est en ${packageLock.version}, pas ${packageVersion}.`);
  }

  const rootPackageVersion = packageLock.packages?.[""]?.version;
  if (rootPackageVersion && rootPackageVersion !== packageVersion) {
    issues.push(`package-lock.json packages[\"\"].version est en ${rootPackageVersion}, pas ${packageVersion}.`);
  }

  return issues;
}

function resolveRepository(packageJson) {
  const ownerFromEnv = process.env.APP_UPDATE_GITHUB_OWNER || process.env.SCARAMANGA_APP_UPDATE_GITHUB_OWNER;
  const repoFromEnv = process.env.APP_UPDATE_GITHUB_REPO || process.env.SCARAMANGA_APP_UPDATE_GITHUB_REPO;

  if (ownerFromEnv && repoFromEnv) {
    return { owner: ownerFromEnv.trim(), repo: repoFromEnv.trim() };
  }

  const repository = typeof packageJson.repository === "string"
    ? packageJson.repository
    : packageJson.repository?.url;

  if (!repository) {
    return null;
  }

  const normalized = repository.trim().replace(/^git\+/, "").replace(/\.git$/, "");
  const match = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/i);

  if (!match?.groups) {
    return null;
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
  };
}

function readReleaseNotes() {
  if (!fs.existsSync(releaseNotesDir)) {
    return [];
  }

  return fs.readdirSync(releaseNotesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^v(?<version>\d+\.\d+\.\d+)\.md$/i);
      if (!match?.groups) {
        return null;
      }

      return {
        version: match.groups.version,
        tagName: `v${match.groups.version}`,
        filePath: path.join(releaseNotesDir, entry.name),
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareSemver(left.version, right.version));
}

function getReleaseNoteIssues(note) {
  const content = fs.readFileSync(note.filePath, "utf8");
  const issues = [];

  if (!content.trim()) {
    return ["Le fichier de patchnote est vide."];
  }

  if (content.includes("vX.Y.Z") || content.includes("Explique ici") || content.includes("Ajoute une note courte")) {
    issues.push("Le fichier contient encore des placeholders du template.");
  }

  const titleMatch = content.match(/^#\s+(.+?)\s*$/m);
  if (titleMatch && titleMatch[1].trim() !== note.tagName) {
    issues.push(`Le premier titre Markdown ne correspond pas a ${note.tagName}.`);
  }

  return issues;
}

function githubGet(repository, apiPath) {
  const token = process.env.GITHUB_RELEASE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "scaramanga-release-status",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve) => {
    const request = https.request({
      hostname: "api.github.com",
      path: `/repos/${repository.owner}/${repository.repo}${apiPath}`,
      method: "GET",
      headers,
    }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ ok: true, statusCode: response.statusCode, data: JSON.parse(body) });
          return;
        }

        resolve({ ok: false, statusCode: response.statusCode, data: null });
      });
    });

    request.on("error", () => {
      resolve({ ok: false, statusCode: 0, data: null });
    });
    request.end();
  });
}

async function getLatestPublishedRelease(repository) {
  const response = await githubGet(repository, "/releases?per_page=100");

  if (!response.ok) {
    return { ok: false, release: null };
  }

  const releases = response.data
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const match = String(release.tag_name || "").match(/^v(?<version>\d+\.\d+\.\d+)$/);
      if (!match?.groups) {
        return null;
      }

      return {
        version: match.groups.version,
        tagName: release.tag_name,
        htmlUrl: release.html_url,
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareSemver(left.version, right.version));

  return { ok: true, release: releases.at(-1) || null };
}

async function getReleaseByTag(repository, tagName) {
  const response = await githubGet(repository, `/releases/tags/${encodeURIComponent(tagName)}`);

  if (response.ok) {
    return { ok: true, found: true, release: response.data };
  }

  if (response.statusCode === 404) {
    return { ok: true, found: false, release: null };
  }

  return { ok: false, found: false, release: null };
}

function tagExists(tagName, remote) {
  if (remote) {
    return Boolean(runGit(["ls-remote", "--tags", "origin", `refs/tags/${tagName}`]));
  }

  return Boolean(runGit(["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]));
}

function getTrackedStatusCount() {
  const status = runGit(["status", "--porcelain", "--untracked-files=no"]);
  if (!status) {
    return 0;
  }

  return status.split(/\r?\n/).filter(Boolean).length;
}

function getPathGitStatus(filePath) {
  return runGit(["status", "--porcelain", "--", formatRelative(filePath)]);
}

async function main() {
  const packageJson = readPackageJson();
  const packageVersion = String(packageJson.version || "");

  if (!semverPattern.test(packageVersion)) {
    throw new Error("package.json version must follow MAJOR.MINOR.PATCH.");
  }

  if (requestedVersion && !semverPattern.test(requestedVersion)) {
    throw new Error("--version must follow MAJOR.MINOR.PATCH.");
  }

  const repository = resolveRepository(packageJson);
  const notes = readReleaseNotes();
  const note = requestedVersion
    ? notes.find((candidate) => candidate.version === requestedVersion)
    : notes.at(-1);
  const actions = [];

  writeSection("Release status");
  writeInfo("Repository", repository ? `${repository.owner}/${repository.repo}` : "inconnu");
  writeInfo("package.json", packageVersion);

  if (note) {
    writeInfo("Patchnote cible", `${note.tagName} (${formatRelative(note.filePath)})`);
  } else {
    const missingVersion = requestedVersion || packageVersion;
    writeInfo("Patchnote cible", `docs\\release-notes\\v${missingVersion}.md introuvable`);
    actions.push(`Creer docs/release-notes/v${missingVersion}.md avant de publier.`);
  }

  if (!repository) {
    actions.push("Renseigner repository.url dans package.json ou APP_UPDATE_GITHUB_OWNER/APP_UPDATE_GITHUB_REPO.");
  }

  const latestPublished = repository ? await getLatestPublishedRelease(repository) : { ok: false, release: null };
  const targetRelease = repository && note ? await getReleaseByTag(repository, note.tagName) : null;

  if (repository) {
    if (latestPublished.ok && latestPublished.release) {
      writeInfo("Derniere release", latestPublished.release.tagName);
    } else if (latestPublished.ok) {
      writeInfo("Derniere release", "aucune release SemVer publiee");
    } else {
      writeInfo("Derniere release", "inconnue (GitHub API indisponible)");
      actions.push("Relancer le check avec acces GitHub pour confirmer la derniere release publiee.");
    }
  }

  if (note) {
    const localTagExists = tagExists(note.tagName, false);
    const remoteTagExists = tagExists(note.tagName, true);
    writeInfo("Tag patchnote", `local=${localTagExists ? "oui" : "non"}, remote=${remoteTagExists ? "oui" : "non"}`);

    if (targetRelease?.ok && targetRelease.found) {
      writeInfo("Patchnote deploye", "oui");
    } else if (targetRelease?.ok) {
      const detail = remoteTagExists ? "non (tag remote present, GitHub Release absente)" : "non";
      writeInfo("Patchnote deploye", detail);
    } else if (targetRelease) {
      writeInfo("Patchnote deploye", "inconnu (GitHub API indisponible)");
    }

    writeSection("Checks");
    const noteIssues = getReleaseNoteIssues(note);
    if (noteIssues.length === 0) {
      writeCheck("OK", "Le patchnote cible existe et ne contient pas de placeholder evident.");
    } else {
      noteIssues.forEach((issue) => {
        writeCheck("TODO", issue);
        actions.push(`Corriger ${note.tagName}: ${issue}`);
      });
    }

    const packageNoteCompare = compareSemver(packageVersion, note.version);
    if (packageNoteCompare === 0) {
      writeCheck("OK", `package.json correspond au patchnote cible (${packageVersion}).`);
    } else if (packageNoteCompare < 0) {
      writeCheck("TODO", `package.json est en ${packageVersion} mais le patchnote cible est ${note.version}.`);
      actions.push(`Mettre package.json a ${note.version}, ou renommer le patchnote si sa version est incorrecte.`);
    } else {
      writeCheck("TODO", `package.json est en ${packageVersion} mais le dernier patchnote est ${note.version}.`);
      actions.push(`Creer docs/release-notes/v${packageVersion}.md, ou remettre package.json sur ${note.version}.`);
    }

    const packageLockIssues = readPackageLockVersionIssues(packageVersion);
    if (packageLockIssues.length === 0) {
      writeCheck("OK", "package-lock.json est coherent avec package.json.");
    } else {
      packageLockIssues.forEach((issue) => {
        writeCheck("TODO", issue);
        actions.push("Mettre aussi package-lock.json a jour avec npm install --package-lock-only.");
      });
    }

    if (latestPublished.ok && latestPublished.release) {
      if (compareSemver(packageVersion, latestPublished.release.version) > 0) {
        writeCheck("OK", `package.json est superieur a la derniere release publiee (${latestPublished.release.tagName}).`);
      } else {
        const suggestedVersion = nextPatchVersion(latestPublished.release.version);
        writeCheck("TODO", `package.json doit etre superieur a la derniere release publiee (${latestPublished.release.tagName}).`);
        actions.push(`Incrementer package.json vers ${suggestedVersion} ou une autre version SemVer superieure, puis creer le patchnote associe.`);
      }
    }

    if (targetRelease?.ok && targetRelease.found) {
      writeCheck("OK", `${note.tagName} existe deja comme GitHub Release.`);
      actions.push("Le dernier patchnote est deja deploye; pour une nouvelle publication, incrementer package.json et creer un nouveau patchnote.");
    } else if (targetRelease?.ok) {
      writeCheck("TODO", `${note.tagName} n'existe pas encore comme GitHub Release.`);
      const remoteTagExists = tagExists(note.tagName, true);
      if (remoteTagExists) {
        actions.push(`Verifier le tag remote ${note.tagName}: release:app refusera sans -AllowExistingTag si la GitHub Release manque.`);
      } else {
        actions.push(`Publier ${note.tagName} avec npm run release:app quand les checks bloquants sont resolus.`);
      }
    } else if (targetRelease) {
      writeCheck("WARN", `Impossible de confirmer la GitHub Release ${note.tagName}.`);
    }

    if (getPathGitStatus(note.filePath).startsWith("??")) {
      writeCheck("WARN", `${note.tagName} est non suivi par git; a committer si tu publies via GitHub Actions.`);
    }
  } else {
    writeSection("Checks");
  }

  const trackedStatusCount = getTrackedStatusCount();
  if (trackedStatusCount === 0) {
    writeCheck("OK", "Aucun changement suivi ne bloque release:app.");
  } else {
    writeCheck("TODO", `Le repo a ${trackedStatusCount} fichier(s) suivi(s) modifies; release:app refuse un worktree sale.`);
    actions.push("Commit ou stash les changements suivis avant npm run release:app.");
  }

  writeSection("A faire");
  const uniqueActions = [...new Set(actions)];
  if (uniqueActions.length === 0) {
    console.log("Rien a faire: le dernier patchnote est deploye et les versions sont coherentes.");
    return;
  }

  uniqueActions.forEach((action) => {
    console.log(`- ${action}`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
