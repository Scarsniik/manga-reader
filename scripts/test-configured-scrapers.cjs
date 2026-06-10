#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DOMParser } = require("linkedom");
const { resolveAppIdentity } = require("./app-identity.cjs");

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_TEMPLATE_PAGES = 8;
const DEFAULT_MAX_CHAPTER_PAGES = 5;
const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const USER_AGENT = "Scaramanga Scraper Test/1.0";
const FEATURE_ORDER = ["homepage", "search", "details", "author", "tag", "tagList", "chapters", "pages"];
const DETAILS_FIELD_KEYS = ["title", "cover", "description", "authors", "tags", "status", "pageCount"];

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(value) {
  return new Set(String(value || "").split(",").map(normalizeToken).filter(Boolean));
}

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }

  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parseArgs(argv) {
  return {
    scrapersFile: readOption(argv, "--scrapers-file", ""),
    include: parseCsv(readOption(argv, "--include", "")),
    exclude: parseCsv(readOption(argv, "--exclude", "")),
    modules: parseCsv(readOption(argv, "--modules", "")),
    jsonOut: readOption(argv, "--json-out", ""),
    timeoutMs: Number(readOption(argv, "--timeout-ms", DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS,
    maxUrlChecks: Number(readOption(argv, "--max-url-checks", 5)) || 5,
    maxTemplatePages: Number(readOption(argv, "--max-template-pages", DEFAULT_MAX_TEMPLATE_PAGES))
      || DEFAULT_MAX_TEMPLATE_PAGES,
    maxChapterPages: Number(readOption(argv, "--max-chapter-pages", DEFAULT_MAX_CHAPTER_PAGES))
      || DEFAULT_MAX_CHAPTER_PAGES,
    skipUrlChecks: hasFlag(argv, "--skip-url-checks"),
    verbose: hasFlag(argv, "--verbose"),
    listOnly: hasFlag(argv, "--list"),
  };
}

function getWindowsFallbackEnvPath(kind) {
  const home = os.homedir();
  return kind === "local"
    ? path.join(home, "AppData", "Local")
    : path.join(home, "AppData", "Roaming");
}

function getScrapersFileCandidates() {
  const identity = resolveAppIdentity();
  const localAppData = process.env.LOCALAPPDATA || getWindowsFallbackEnvPath("local");
  const appData = process.env.APPDATA || getWindowsFallbackEnvPath("roaming");
  const legacy = identity.legacy || {};

  return [
    path.join(localAppData, identity.userDataDirName, "data", "scrapers.json"),
    path.join(appData, identity.roamingConfigDirName, "data", "scrapers.json"),
    ...(legacy.userDataDirNames || []).flatMap((dirName) => [
      path.join(localAppData, dirName, "data", "scrapers.json"),
      path.join(localAppData, dirName, "scrapers.json"),
    ]),
    ...(legacy.roamingConfigDirNames || []).flatMap((dirName) => [
      path.join(appData, dirName, "data", "scrapers.json"),
      path.join(appData, dirName, "scrapers.json"),
    ]),
  ];
}

function readJsonArray(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array in ${filePath}`);
  }

  return parsed;
}

function findScrapersFile(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    readJsonArray(resolved);
    return resolved;
  }

  const existing = getScrapersFileCandidates().filter((candidate) => fs.existsSync(candidate));
  const withData = existing.find((candidate) => readJsonArray(candidate).length > 0);
  if (withData) {
    return withData;
  }

  if (existing[0]) {
    return existing[0];
  }

  throw new Error("No scrapers.json file found. Pass --scrapers-file <path>.");
}

function normalizeSelectorInput(input) {
  return String(input || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimOptional(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

function normalizeFieldSelector(input) {
  if (typeof input === "string") {
    const value = normalizeSelectorInput(input);
    return value ? { kind: "css", value } : undefined;
  }

  if (!input || typeof input !== "object") {
    return undefined;
  }

  const raw = input;
  const kind = raw.kind === "regex" || raw.mode === "regex" ? "regex" : "css";
  const rawValue = typeof raw.value === "string"
    ? raw.value
    : typeof raw.selector === "string"
      ? raw.selector
      : "";
  const value = kind === "css" ? normalizeSelectorInput(rawValue) : rawValue.trim();
  return value ? { kind, value } : undefined;
}

function requiredFieldSelector(value) {
  return normalizeFieldSelector(value) || { kind: "css", value: "" };
}

function hasFieldSelectorValue(input) {
  return Boolean(normalizeFieldSelector(input)?.value.trim());
}

function formatFieldSelector(input) {
  const selector = normalizeFieldSelector(input);
  if (!selector) {
    return "";
  }

  return selector.kind === "regex" ? `regex: ${selector.value}` : selector.value;
}

function normalizeLanguageDetection(rawValue) {
  const raw = rawValue && typeof rawValue === "object" ? rawValue : {};
  const valueMappings = Array.isArray(raw.valueMappings)
    ? raw.valueMappings
      .map((mapping) => ({
        value: String(mapping?.value ?? "").trim(),
        languageCode: String(mapping?.languageCode ?? "").trim().toLowerCase(),
      }))
      .filter((mapping) => mapping.value && mapping.languageCode)
    : [];

  return {
    detectFromTitle: Boolean(raw.detectFromTitle),
    languageSelector: normalizeFieldSelector(raw.languageSelector),
    processedLanguageSelector: normalizeFieldSelector(raw.processedLanguageSelector),
    valueMappings,
  };
}

function normalizeRequestField(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const key = String(value.key ?? "").trim();
  const fieldValue = typeof value.value === "string" ? value.value : value.value == null ? "" : String(value.value);
  if (!key && !fieldValue.trim()) {
    return null;
  }

  return { key, value: fieldValue };
}

function normalizeRequestConfig(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const method = value.method === "POST" ? "POST" : "GET";
  const bodyMode = value.bodyMode === "raw" ? "raw" : "form";
  const bodyFields = Array.isArray(value.bodyFields)
    ? value.bodyFields.map(normalizeRequestField).filter(Boolean)
    : [];
  const body = typeof value.body === "string" ? value.body : undefined;
  const contentType = trimOptional(value.contentType);

  if (method === "GET" && bodyMode === "form" && !bodyFields.length && !body && !contentType) {
    return undefined;
  }

  return { method, bodyMode, bodyFields, body, contentType };
}

function buildCardListConfig(raw) {
  return {
    resultListSelector: trimOptional(normalizeSelectorInput(raw.resultListSelector)),
    resultItemSelector: normalizeSelectorInput(raw.resultItemSelector),
    titleSelector: requiredFieldSelector(raw.titleSelector),
    detailUrlSelector: normalizeFieldSelector(raw.detailUrlSelector),
    authorUrlSelector: normalizeFieldSelector(raw.authorUrlSelector),
    thumbnailSelector: normalizeFieldSelector(raw.thumbnailSelector),
    summarySelector: normalizeFieldSelector(raw.summarySelector),
    pageCountSelector: normalizeFieldSelector(raw.pageCountSelector),
    nextPageSelector: normalizeFieldSelector(raw.nextPageSelector),
    languageDetection: normalizeLanguageDetection(raw.languageDetection),
  };
}

function getFeature(scraper, kind) {
  return (scraper.features || []).find((feature) => feature.kind === kind) || null;
}

function isFeatureConfigured(feature) {
  return Boolean(feature?.config && feature.status !== "not_configured");
}

function getSearchConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    ...buildCardListConfig(raw),
    urlTemplate: trimOptional(raw.urlTemplate) || "",
    testQuery: trimOptional(raw.testQuery),
    request: normalizeRequestConfig(raw.request),
  };
}

function getHomepageConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    ...buildCardListConfig(raw),
    urlTemplate: trimOptional(raw.urlTemplate) || "",
    request: normalizeRequestConfig(raw.request),
  };
}

function getListingConfig(feature, nameSelectorKey) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    ...buildCardListConfig(raw),
    urlStrategy: raw.urlStrategy === "template" ? "template" : "result_url",
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    [nameSelectorKey]: normalizeFieldSelector(raw[nameSelectorKey]),
  };
}

function getDetailsConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  const derivedValues = Array.isArray(raw.derivedValues)
    ? raw.derivedValues.map((value) => {
      if (!value || typeof value !== "object") return null;
      const key = trimOptional(value.key);
      if (!key) return null;
      return {
        key,
        sourceType: ["selector", "html", "requested_url", "final_url"].includes(value.sourceType)
          ? value.sourceType
          : "field",
        sourceField: DETAILS_FIELD_KEYS.includes(value.sourceField) ? value.sourceField : undefined,
        selector: normalizeFieldSelector(value.selector),
        pattern: trimOptional(value.pattern),
      };
    }).filter(Boolean)
    : [];

  return {
    urlStrategy: raw.urlStrategy === "template" ? "template" : "result_url",
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    titleSelector: requiredFieldSelector(raw.titleSelector),
    coverSelector: normalizeFieldSelector(raw.coverSelector),
    descriptionSelector: normalizeFieldSelector(raw.descriptionSelector),
    authorsSelector: normalizeFieldSelector(raw.authorsSelector),
    authorUrlSelector: normalizeFieldSelector(raw.authorUrlSelector),
    tagsSelector: normalizeFieldSelector(raw.tagsSelector),
    tagUrlSelector: normalizeFieldSelector(raw.tagUrlSelector),
    statusSelector: normalizeFieldSelector(raw.statusSelector),
    pageCountSelector: normalizeFieldSelector(raw.pageCountSelector),
    thumbnailsListSelector: trimOptional(normalizeSelectorInput(raw.thumbnailsListSelector)),
    thumbnailsSelector: normalizeFieldSelector(raw.thumbnailsSelector),
    thumbnailsNextPageSelector: normalizeFieldSelector(raw.thumbnailsNextPageSelector),
    languageDetection: normalizeLanguageDetection(raw.languageDetection),
    derivedValues,
  };
}

function getChaptersConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    urlStrategy: raw.urlStrategy === "template" ? "template" : "details_page",
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: raw.templateBase === "details_page" ? "details_page" : "scraper_base",
    chapterListSelector: trimOptional(normalizeSelectorInput(raw.chapterListSelector)),
    chapterItemSelector: normalizeSelectorInput(raw.chapterItemSelector),
    chapterUrlSelector: requiredFieldSelector(raw.chapterUrlSelector),
    chapterImageSelector: normalizeFieldSelector(raw.chapterImageSelector),
    chapterLabelSelector: requiredFieldSelector(raw.chapterLabelSelector),
    reverseOrder: Boolean(raw.reverseOrder),
  };
}

function getPagesConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    urlStrategy: raw.urlStrategy === "template"
      ? "template"
      : raw.urlStrategy === "chapter_page" || Boolean(raw.linkedToChapters)
        ? "chapter_page"
        : "details_page",
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: raw.templateBase === "details_page" ? "details_page" : "scraper_base",
    pageImageSelector: normalizeFieldSelector(raw.pageImageSelector),
    linkedToChapters: raw.urlStrategy === "template" ? Boolean(raw.linkedToChapters) : false,
  };
}

function getTagListConfig(feature) {
  if (!isFeatureConfigured(feature)) return null;
  const raw = feature.config || {};
  return {
    urlTemplate: trimOptional(raw.urlTemplate) || "",
    tagListSelector: trimOptional(normalizeSelectorInput(raw.tagListSelector)),
    tagItemSelector: normalizeSelectorInput(raw.tagItemSelector),
    tagNameSelector: requiredFieldSelector(raw.tagNameSelector),
    tagUrlSelector: normalizeFieldSelector(raw.tagUrlSelector),
    tagCountSelector: normalizeFieldSelector(raw.tagCountSelector),
    nextPageSelector: normalizeFieldSelector(raw.nextPageSelector),
    paginationLinkSelector: normalizeFieldSelector(raw.paginationLinkSelector),
  };
}

function normalizeScraperBaseUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Base URL is required.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are accepted.");
  }

  return parsed.toString();
}

function resolveScraperUrl(baseUrl, input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Target URL is required.");
  }

  return new URL(trimmed, normalizeScraperBaseUrl(baseUrl)).toString();
}

function encodeTemplateValue(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

function applyReplacements(template, replacements) {
  return replacements.reduce((current, [token, value]) => current.split(token).join(value), template);
}

function buildSearchReplacements(query, options = {}) {
  const value = String(query || "").trim();
  const pageIndex = Math.max(0, options.pageIndex || 0);
  const page = pageIndex + 1;
  const pad = (number, length) => String(number).padStart(length, "0");
  const encoded = encodeTemplateValue(value);
  return [
    ["{{query}}", encoded],
    ["{{search}}", encoded],
    ["{{value}}", encoded],
    ["{{id}}", encoded],
    ["{{slug}}", encoded],
    ["{{page}}", String(page)],
    ["{{page2}}", pad(page, 2)],
    ["{{page3}}", pad(page, 3)],
    ["{{page4}}", pad(page, 4)],
    ["{{pageIndex}}", String(pageIndex)],
    ["{{pageIndex2}}", pad(pageIndex, 2)],
    ["{{pageIndex3}}", pad(pageIndex, 3)],
    ["{{pageIndex4}}", pad(pageIndex, 4)],
    ["{{rawQuery}}", value],
    ["{{plusQuery}}", value.split(" ").join("+")],
    ["{{rawSearch}}", value],
    ["{{rawValue}}", value],
    ["{{rawId}}", value],
    ["{{rawSlug}}", value],
  ];
}

function applySearchTemplate(template, query, options = {}) {
  return applyReplacements(String(template || "").trim(), buildSearchReplacements(query, options));
}

function buildTemplateUrl(baseUrl, template, value) {
  const trimmedTemplate = String(template || "").trim();
  const trimmedValue = String(value || "").trim();
  if (!trimmedTemplate) throw new Error("URL template is required.");
  if (!trimmedValue) throw new Error("Test value is required.");

  const encoded = encodeTemplateValue(trimmedValue);
  return resolveScraperUrl(baseUrl, applyReplacements(trimmedTemplate, [
    ["{{value}}", encoded],
    ["{{id}}", encoded],
    ["{{slug}}", encoded],
    ["{{rawValue}}", trimmedValue],
    ["{{rawId}}", trimmedValue],
    ["{{rawSlug}}", trimmedValue],
  ]));
}

function isAbsoluteTemplateUrlValue(value) {
  const trimmed = String(value || "").trim();
  try {
    const parsed = trimmed.startsWith("//") ? new URL(trimmed, "https://template.local") : new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildContextTemplateUrl(baseUrl, template, context, options = {}) {
  let resolved = String(template || "").trim();
  if (!resolved) {
    throw new Error("URL template is required.");
  }

  Object.entries(context || {}).forEach(([key, rawValue]) => {
    if (typeof rawValue !== "string" || !rawValue.length) return;
    const rawToken = `{{raw:${key}}}`;
    const encodedToken = `{{${key}}}`;
    const encodedValue = encodeTemplateValue(rawValue);
    resolved = resolved.split(rawToken).join(rawValue);
    while (resolved.includes(encodedToken)) {
      const index = resolved.indexOf(encodedToken);
      const replacement = index === 0 && isAbsoluteTemplateUrlValue(rawValue) ? rawValue.trim() : encodedValue;
      resolved = `${resolved.slice(0, index)}${replacement}${resolved.slice(index + encodedToken.length)}`;
    }
  });

  const unresolved = resolved.match(/{{\s*[^}]+\s*}}/g);
  if (unresolved?.length) {
    throw new Error(`Unresolved template variables: ${unresolved.join(", ")}`);
  }

  return resolveScraperUrl(options.relativeToUrl || baseUrl, resolved);
}

function looksLikeDirectUrlInput(value) {
  const trimmed = String(value || "").trim();
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    || trimmed.startsWith("//")
    || trimmed.startsWith("/")
    || trimmed.startsWith("./")
    || trimmed.startsWith("../")
    || trimmed.startsWith("?")
    || trimmed.startsWith("#");
}

function resolveSearchTargetUrl(baseUrl, config, query, options) {
  return resolveScraperUrl(baseUrl, applySearchTemplate(config.urlTemplate || "", query, options));
}

function resolveDetailsTargetUrl(baseUrl, config, input) {
  const value = String(input || "").trim();
  if (config.urlStrategy === "template" && !looksLikeDirectUrlInput(value)) {
    return buildTemplateUrl(baseUrl, config.urlTemplate || "", value);
  }

  return resolveScraperUrl(baseUrl, value);
}

function resolveListingTargetUrl(baseUrl, config, input, options = {}) {
  const value = String(input || "").trim();
  if (config.urlStrategy === "template" && (!looksLikeDirectUrlInput(value) || options.pageIndex > 0)) {
    const resolvedTemplate = applySearchTemplate(config.urlTemplate || "", value, options);
    return buildContextTemplateUrl(baseUrl, resolvedTemplate, options.templateContext || {});
  }

  return resolveScraperUrl(baseUrl, value);
}

function resolveTagTargetUrl(baseUrl, config, input, options = {}) {
  const value = String(input || "").trim();
  if (config.urlStrategy === "template" && (!looksLikeDirectUrlInput(value) || options.pageIndex > 0)) {
    return resolveScraperUrl(baseUrl, applySearchTemplate(config.urlTemplate || "", value, options));
  }

  return resolveScraperUrl(baseUrl, value);
}

function resolveRequestConfig(config, query, options = {}) {
  const request = normalizeRequestConfig(config.request);
  if (!request || request.method !== "POST") {
    return undefined;
  }

  if (request.bodyMode === "raw") {
    return {
      method: "POST",
      bodyMode: "raw",
      body: typeof request.body === "string" ? applySearchTemplate(request.body, query, options) : "",
      contentType: request.contentType,
    };
  }

  return {
    method: "POST",
    bodyMode: "form",
    bodyFields: (request.bodyFields || [])
      .filter((field) => field.key.trim())
      .map((field) => ({
        key: applySearchTemplate(field.key, query, options),
        value: applySearchTemplate(field.value, query, options),
      })),
    contentType: request.contentType,
  };
}

function buildFetchInit(requestConfig) {
  const request = normalizeRequestConfig(requestConfig);
  const method = request?.method === "POST" ? "POST" : "GET";
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: HTML_ACCEPT,
  };

  if (method !== "POST") {
    return { method, headers };
  }

  if (request.bodyMode === "raw") {
    if (request.contentType) headers["Content-Type"] = request.contentType;
    return { method, headers, body: request.body || "" };
  }

  const body = new URLSearchParams();
  (request.bodyFields || [])
    .filter((field) => field.key.trim())
    .forEach((field) => body.append(field.key, field.value));
  headers["Content-Type"] = request.contentType || "application/x-www-form-urlencoded;charset=UTF-8";
  return { method, headers, body: body.toString() };
}

async function fetchScraperDocument(request, options) {
  const checkedAt = new Date().toISOString();
  let requestedUrl = "";
  try {
    requestedUrl = resolveScraperUrl(request.baseUrl, request.targetUrl);
  } catch (error) {
    return { ok: false, checkedAt, requestedUrl: String(request.targetUrl || "").trim(), error: error.message };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const fetchInit = buildFetchInit(request.requestConfig);
    const response = await fetch(requestedUrl, {
      method: fetchInit.method,
      redirect: "follow",
      signal: controller.signal,
      headers: fetchInit.headers,
      body: fetchInit.body,
    });
    const contentType = response.headers.get("content-type") || undefined;
    const finalUrl = response.url || requestedUrl;
    let html;

    if (response.ok && isImageLikeContentType(contentType)) {
      try {
        await response.body?.cancel();
      } catch {
        // Ignore body cancellation errors.
      }
    } else {
      html = await response.text();
    }

    if (response.ok && request.validateImage && !isImageLikeContentType(contentType)) {
      return {
        ok: false,
        checkedAt,
        requestedUrl,
        finalUrl,
        status: response.status,
        contentType,
        error: "Remote resource is not an image.",
      };
    }

    return {
      ok: response.ok,
      checkedAt,
      requestedUrl,
      finalUrl,
      status: response.status,
      contentType,
      html: response.ok ? html : undefined,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      requestedUrl,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseDocument(html) {
  return new DOMParser().parseFromString(html || "", "text/html");
}

function parseSelectorExpression(input) {
  const trimmed = normalizeSelectorInput(input);
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { selector: trimmed };
  }

  return {
    selector: trimmed.slice(0, atIndex).trim(),
    attribute: trimmed.slice(atIndex + 1).trim(),
  };
}

function getElementValue(element, attribute, mode) {
  if (attribute) return element.getAttribute(attribute)?.trim() || "";
  if (mode === "url" && element.tagName === "A") return element.getAttribute("href")?.trim() || "";
  if (element.tagName === "IMG") return element.getAttribute("src")?.trim() || "";
  return element.textContent?.trim() || "";
}

function getRootHtml(root) {
  const view = root?.defaultView || root?.ownerDocument?.defaultView;
  if (view?.Document && root instanceof view.Document) {
    return root.documentElement?.outerHTML || "";
  }
  if (view?.Element && root instanceof view.Element) {
    return root.outerHTML;
  }
  return root?.textContent || "";
}

function buildRegex(input, defaultFlags = "") {
  const trimmed = String(input || "").trim();
  let source = trimmed;
  let flags = "";

  if (trimmed.startsWith("/")) {
    for (let index = trimmed.length - 1; index > 0; index -= 1) {
      if (trimmed[index] !== "/") continue;
      const slashPrefix = trimmed.slice(0, index);
      const escaped = /\\+$/.test(slashPrefix) && slashPrefix.match(/\\+$/)[0].length % 2 === 1;
      if (escaped) continue;
      const candidateFlags = trimmed.slice(index + 1);
      if (/^[dgimsuvy]*$/.test(candidateFlags)) {
        source = trimmed.slice(1, index);
        flags = candidateFlags;
      }
      break;
    }
  }

  for (const flag of defaultFlags) {
    if (!flags.includes(flag)) flags += flag;
  }

  return new RegExp(source, flags);
}

function extractRegexValues(root, pattern) {
  if (!String(pattern || "").trim()) return [];
  const regex = buildRegex(pattern, "g");
  const html = getRootHtml(root);
  const values = [];
  let match;

  do {
    match = regex.exec(html);
    if (!match) break;
    const value = String(match[1] ?? match[0] ?? "").trim();
    if (value) values.push(value);
    if (match[0] === "") regex.lastIndex += 1;
  } while (regex.lastIndex <= html.length);

  return values;
}

function extractSelectorValuesByMode(root, input, mode) {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) return [];
  return Array.from(root.querySelectorAll(selector))
    .map((element) => getElementValue(element, attribute, mode))
    .filter(Boolean);
}

function extractFieldValuesByMode(root, input, mode) {
  const selector = normalizeFieldSelector(input);
  if (!selector) return [];
  return selector.kind === "regex"
    ? extractRegexValues(root, selector.value)
    : extractSelectorValuesByMode(root, selector.value, mode);
}

function extractValues(root, input) {
  return extractFieldValuesByMode(root, input, "text");
}

function extractUrlValues(root, input) {
  return extractFieldValuesByMode(root, input, "url");
}

function extractTextValues(root, input) {
  const selector = normalizeFieldSelector(input);
  if (!selector || selector.kind === "regex") return [];
  const { selector: cssSelector } = parseSelectorExpression(selector.value);
  if (!cssSelector) return [];
  return Array.from(root.querySelectorAll(cssSelector)).map((element) => element.textContent?.trim() || "").filter(Boolean);
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toAbsoluteScraperUrl(value, baseUrl) {
  const normalized = String(value || "").trim().replace(/\\\//g, "/").replace(/&amp;/g, "&");
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return normalized;
  }
}

function isImageLikeContentType(contentType) {
  return typeof contentType === "string" && contentType.toLowerCase().startsWith("image/");
}

function looksLikeHttpResourceUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  try {
    const parsed = trimmed.startsWith("//") ? new URL(trimmed, "https://resource.local") : new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("?");
  }
}

function extractImageCandidateValues(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  if (!normalized) return [];
  if (normalized.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch {
      // Fall back to URL extraction.
    }
  }

  const absoluteUrls = normalized.match(/https?:\/\/[^\s"'<>]+/g);
  return absoluteUrls?.length ? absoluteUrls : [normalized];
}

function getImageCandidateUrls(root, selector, documentUrl) {
  if (!hasFieldSelectorValue(selector)) return [];
  return uniqueValues(
    extractValues(root, selector)
      .flatMap(extractImageCandidateValues)
      .map((value) => toAbsoluteScraperUrl(value, documentUrl)),
  );
}

const languageAliases = {
  en: "en",
  eng: "en",
  english: "en",
  fr: "fr",
  fra: "fr",
  french: "fr",
  vf: "fr",
  ja: "ja",
  jp: "ja",
  jpn: "ja",
  japanese: "ja",
  raw: "ja",
  es: "es",
  esp: "es",
  spanish: "es",
  de: "de",
  ger: "de",
  it: "it",
  ita: "it",
  pt: "pt",
  br: "pt",
  ko: "ko",
  kr: "ko",
  zh: "zh",
  cn: "zh",
  ru: "ru",
};

function normalizeLanguageToken(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, "").replace(/^pt-br$/, "ptbr");
}

function uniqueLanguageCodes(values) {
  const seen = new Set();
  return values.reduce((codes, value) => {
    const normalized = normalizeLanguageToken(value);
    const code = languageAliases[normalized] || "";
    if (code && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
    return codes;
  }, []);
}

function detectLanguageCodes(root, config, title) {
  if (!config?.detectFromTitle && !hasFieldSelectorValue(config?.languageSelector)
    && !hasFieldSelectorValue(config?.processedLanguageSelector)) {
    return [];
  }

  const titleValues = config.detectFromTitle && title
    ? Array.from(title.matchAll(/[\[(]\s*([a-z]{2,}|raw)\s*[\])]/gi)).map((match) => match[1])
    : [];
  const selectorValues = config.languageSelector ? extractValues(root, config.languageSelector) : [];
  const processedValues = config.processedLanguageSelector ? extractValues(root, config.processedLanguageSelector) : [];
  const mappedValues = config.valueMappings?.length
    ? processedValues.flatMap((value) => {
      const normalized = normalizeLanguageToken(value);
      const mapping = config.valueMappings.find((entry) => normalizeLanguageToken(entry.value) === normalized);
      return mapping ? [mapping.languageCode] : [];
    })
    : [];
  const processedCandidates = processedValues.flatMap((value) => [
    value,
    ...Array.from(String(value).matchAll(/\bflag-([a-z0-9-]+)\b/gi)).map((match) => match[1]),
    ...String(value).split(/[,;|/()[\]{}\s_\-.]+/g),
  ]);

  return uniqueLanguageCodes([...titleValues, ...selectorValues, ...mappedValues, ...processedCandidates]);
}

function buildSelectorCheck(key, selector, required, values) {
  return {
    key,
    selector: typeof selector === "string" ? selector : formatFieldSelector(selector),
    required,
    matchedCount: values.length,
    sample: values[0],
    samples: values.slice(0, 12),
    issueCode: values.length ? undefined : "no_match",
  };
}

function buildFailureResult(error, extra = {}) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : String(error || "Failed."),
    ...extra,
  };
}

function buildDocumentFailure(documentResult) {
  return {
    ok: false,
    message: documentResult.error || (documentResult.status ? `HTTP ${documentResult.status}` : "Document request failed."),
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
    status: documentResult.status,
    contentType: documentResult.contentType,
    checks: [],
  };
}

function getListingNameSelector(config) {
  return config.authorNameSelector || config.tagNameSelector;
}

function extractSearchPage(doc, config, requestMeta) {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const listingNameSelector = getListingNameSelector(config);
  const listingNames = listingNameSelector ? uniqueValues(extractValues(doc, listingNameSelector)) : [];
  const roots = config.resultListSelector ? Array.from(doc.querySelectorAll(config.resultListSelector)) : [doc];
  const resultItems = Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(config.resultItemSelector)))));
  const items = uniqueSearchResults(resultItems.map((item) => {
    const title = extractValues(item, config.titleSelector)[0];
    if (!title) return null;
    const detailUrl = config.detailUrlSelector ? extractUrlValues(item, config.detailUrlSelector)[0] : "";
    const authorUrlValues = config.authorUrlSelector ? uniqueValues(extractUrlValues(item, config.authorUrlSelector)) : [];
    const authorNames = config.authorUrlSelector ? uniqueValues(extractTextValues(item, config.authorUrlSelector)) : [];
    const thumbnailUrl = config.thumbnailSelector ? getImageCandidateUrls(item, config.thumbnailSelector, documentUrl)[0] : undefined;
    return {
      title,
      detailUrl: detailUrl ? toAbsoluteScraperUrl(detailUrl, documentUrl) : undefined,
      authorUrl: authorUrlValues[0] ? toAbsoluteScraperUrl(authorUrlValues[0], documentUrl) : undefined,
      authorUrls: authorUrlValues.map((value) => toAbsoluteScraperUrl(value, documentUrl)),
      authorNames,
      thumbnailUrl,
      summary: config.summarySelector ? extractValues(item, config.summarySelector)[0] : undefined,
      pageCount: config.pageCountSelector ? extractValues(item, config.pageCountSelector)[0] : undefined,
      languageCodes: detectLanguageCodes(item, config.languageDetection, title),
    };
  }).filter(Boolean));
  const nextPageValue = config.nextPageSelector ? extractUrlValues(doc, config.nextPageSelector)[0] : "";

  return {
    currentPageUrl: documentUrl,
    nextPageUrl: nextPageValue ? toAbsoluteScraperUrl(nextPageValue, documentUrl) : undefined,
    listingNames,
    authorNames: config.authorNameSelector ? listingNames : [],
    items,
  };
}

function uniqueSearchResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${result.detailUrl || ""}::${result.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractDetailsFieldValues(doc, config, requestMeta) {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const selectorMap = {
    title: config.titleSelector,
    cover: config.coverSelector,
    description: config.descriptionSelector,
    authors: config.authorsSelector,
    tags: config.tagsSelector,
    status: config.statusSelector,
    pageCount: config.pageCountSelector,
  };

  return Object.fromEntries(DETAILS_FIELD_KEYS.map((key) => {
    const selector = selectorMap[key];
    if (!hasFieldSelectorValue(selector)) return [key, []];
    const values = key === "cover" ? getImageCandidateUrls(doc, selector, documentUrl) : extractValues(doc, selector);
    return [key, values];
  }));
}

function shouldResolveTagAsUrl(attribute, value) {
  const normalized = String(attribute || "").trim().toLowerCase();
  return ["href", "src", "action"].includes(normalized) || looksLikeDirectUrlInput(value);
}

function extractTagTargets(doc, selector, requestMeta) {
  const normalizedSelector = normalizeFieldSelector(selector);
  if (!normalizedSelector) return [];
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  if (normalizedSelector.kind === "regex") {
    return uniqueValues(extractRegexValues(doc, normalizedSelector.value).map((value) =>
      shouldResolveTagAsUrl(undefined, value) ? toAbsoluteScraperUrl(value, documentUrl) : value,
    ));
  }

  const { selector: cssSelector, attribute } = parseSelectorExpression(normalizedSelector.value);
  if (!cssSelector) return [];
  return uniqueValues(Array.from(doc.querySelectorAll(cssSelector)).map((element) => {
    const value = attribute
      ? element.getAttribute(attribute)?.trim() || ""
      : getElementValue(element, undefined, "url");
    if (!value) return "";
    const resolveAsUrl = attribute
      ? shouldResolveTagAsUrl(attribute, value)
      : ["A", "IMG"].includes(element.tagName) || shouldResolveTagAsUrl(undefined, value);
    return resolveAsUrl ? toAbsoluteScraperUrl(value, documentUrl) : value;
  }).filter(Boolean));
}

function extractDetailsDerivedValues(doc, config, requestMeta, fieldValues) {
  return (config.derivedValues || []).map((derivedValue) => {
    const base = {
      key: derivedValue.key,
      sourceType: derivedValue.sourceType,
      sourceField: derivedValue.sourceField,
      selector: derivedValue.selector,
      pattern: derivedValue.pattern,
    };
    let sourceValues = [];

    if (derivedValue.sourceType === "requested_url") sourceValues = requestMeta.requestedUrl ? [requestMeta.requestedUrl] : [];
    else if (derivedValue.sourceType === "final_url") sourceValues = [requestMeta.finalUrl || requestMeta.requestedUrl].filter(Boolean);
    else if (derivedValue.sourceType === "field") sourceValues = DETAILS_FIELD_KEYS.includes(derivedValue.sourceField)
      ? fieldValues[derivedValue.sourceField] || []
      : [];
    else if (derivedValue.sourceType === "selector") {
      try {
        sourceValues = derivedValue.selector ? extractValues(doc, derivedValue.selector) : [];
      } catch {
        return { ...base, issueCode: "invalid_selector" };
      }
    } else {
      sourceValues = [requestMeta.html || doc.documentElement?.outerHTML || ""].filter(Boolean);
    }

    if (!sourceValues.length) return { ...base, issueCode: "no_match" };
    const sourceSample = derivedValue.sourceType === "html" ? "Raw HTML" : sourceValues[0];
    if (derivedValue.sourceType === "html" && !derivedValue.pattern) {
      return { ...base, sourceSample, issueCode: "invalid_pattern" };
    }
    if (!derivedValue.pattern) return { ...base, sourceSample, value: sourceValues[0] };

    try {
      const match = buildRegex(derivedValue.pattern).exec(sourceValues[0]);
      return match
        ? { ...base, sourceSample, value: match[1] ?? match[0] }
        : { ...base, sourceSample, issueCode: "no_match" };
    } catch {
      return { ...base, sourceSample, issueCode: "invalid_pattern" };
    }
  });
}

function extractDetails(doc, config, requestMeta) {
  const fieldValues = extractDetailsFieldValues(doc, config, requestMeta);
  const derivedValues = extractDetailsDerivedValues(doc, config, requestMeta, fieldValues);
  const authorUrls = config.authorUrlSelector
    ? uniqueValues(extractUrlValues(doc, config.authorUrlSelector).map((value) =>
      toAbsoluteScraperUrl(value, requestMeta.finalUrl || requestMeta.requestedUrl),
    ))
    : [];

  return {
    requestedUrl: requestMeta.requestedUrl,
    finalUrl: requestMeta.finalUrl,
    status: requestMeta.status,
    contentType: requestMeta.contentType,
    title: fieldValues.title?.[0],
    cover: fieldValues.cover?.[0],
    description: fieldValues.description?.[0],
    authors: uniqueValues(fieldValues.authors || []),
    authorUrls,
    tags: uniqueValues(fieldValues.tags || []),
    tagUrls: config.tagUrlSelector ? extractTagTargets(doc, config.tagUrlSelector, requestMeta) : [],
    mangaStatus: fieldValues.status?.[0],
    pageCount: fieldValues.pageCount?.[0],
    thumbnails: extractDetailsThumbnails(doc, config, requestMeta),
    thumbnailsNextPageUrl: extractDetailsThumbnailsNextPageUrl(doc, config, requestMeta),
    languageCodes: detectLanguageCodes(doc, config.languageDetection, fieldValues.title?.[0]),
    derivedValues: Object.fromEntries(derivedValues.filter((entry) => entry.value).map((entry) => [entry.key, entry.value])),
    derivedValueResults: derivedValues,
    fieldValues,
  };
}

function extractDetailsThumbnails(doc, config, requestMeta) {
  if (!hasFieldSelectorValue(config.thumbnailsSelector)) return [];
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const roots = config.thumbnailsListSelector ? Array.from(doc.querySelectorAll(config.thumbnailsListSelector)) : [doc];
  return uniqueValues(roots.flatMap((root) =>
    extractValues(root, config.thumbnailsSelector).map((value) => toAbsoluteScraperUrl(value, documentUrl)),
  ));
}

function extractDetailsThumbnailsNextPageUrl(doc, config, requestMeta) {
  if (!hasFieldSelectorValue(config.thumbnailsNextPageSelector)) return undefined;
  const value = extractUrlValues(doc, config.thumbnailsNextPageSelector)[0];
  return value ? toAbsoluteScraperUrl(value, requestMeta.finalUrl || requestMeta.requestedUrl) : undefined;
}

function buildTemplateContextFromDetails(details, chapter) {
  return {
    requestedUrl: details.requestedUrl,
    finalUrl: details.finalUrl || details.requestedUrl,
    title: details.title,
    cover: details.cover,
    description: details.description,
    authors: details.authors?.length ? details.authors.join(", ") : undefined,
    tags: details.tags?.length ? details.tags.join(", ") : undefined,
    status: details.mangaStatus,
    pageCount: details.pageCount,
    chapter: chapter?.url || undefined,
    ...(details.derivedValues || {}),
  };
}

function resolveTemplateBaseUrl(scraperBaseUrl, templateBase, detailsUrl) {
  return templateBase === "details_page" && detailsUrl ? detailsUrl : scraperBaseUrl;
}

function hasChapterPagePlaceholder(template) {
  return /{{\s*(?:raw:)?chapterPage\s*}}/.test(String(template || ""));
}

function resolveChaptersSourceUrl(baseUrl, config, context, detailsUrl, chapterPage = 1) {
  if (config.urlStrategy === "details_page") return detailsUrl;
  return buildContextTemplateUrl(baseUrl, config.urlTemplate || "", {
    ...context,
    chapterPage: String(Math.max(1, chapterPage)),
  }, {
    relativeToUrl: resolveTemplateBaseUrl(baseUrl, config.templateBase, detailsUrl),
  });
}

function extractChapters(doc, config, requestMeta) {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const roots = config.chapterListSelector ? Array.from(doc.querySelectorAll(config.chapterListSelector)) : [doc];
  const items = Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(config.chapterItemSelector)))));
  const chapters = items.map((item, index) => {
    const url = extractUrlValues(item, config.chapterUrlSelector)[0];
    const label = extractValues(item, config.chapterLabelSelector)[0];
    const image = config.chapterImageSelector ? extractValues(item, config.chapterImageSelector)[0] : "";
    if (!url || !label) return null;
    return {
      url: toAbsoluteScraperUrl(url, documentUrl),
      label: label || `Chapter ${index + 1}`,
      image: image ? toAbsoluteScraperUrl(image, documentUrl) : undefined,
    };
  }).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const chapter of chapters) {
    const key = `${chapter.url}::${chapter.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(chapter);
    }
  }
  return config.reverseOrder ? unique.reverse() : unique;
}

function hasPagePlaceholder(template) {
  return /{{\s*page(?:Index)?\d*\s*}}/.test(String(template || ""));
}

function buildPageContext(context, pageIndex) {
  const pad = (number, length) => String(number).padStart(length, "0");
  return {
    ...context,
    page: String(pageIndex + 1),
    page2: pad(pageIndex + 1, 2),
    page3: pad(pageIndex + 1, 3),
    page4: pad(pageIndex + 1, 4),
    pageIndex: String(pageIndex),
    pageIndex2: pad(pageIndex, 2),
    pageIndex3: pad(pageIndex, 3),
    pageIndex4: pad(pageIndex, 4),
  };
}

function buildPageTemplateUrl(scraperBaseUrl, config, context, templateBaseUrl, pageIndex) {
  return buildContextTemplateUrl(scraperBaseUrl, config.urlTemplate || "", buildPageContext(context, pageIndex), {
    relativeToUrl: templateBaseUrl,
  });
}

function usesPagesChapterSource(config) {
  return config?.urlStrategy === "chapter_page";
}

function usesPagesTemplateChapterContext(config) {
  return Boolean(config && config.urlStrategy === "template" && config.linkedToChapters);
}

function usesPagesChapters(config) {
  return usesPagesChapterSource(config) || usesPagesTemplateChapterContext(config);
}

function usesPagesSelectorSource(config) {
  return config && (config.urlStrategy === "details_page" || config.urlStrategy === "chapter_page");
}

function extractTagListPage(doc, config, requestMeta) {
  const documentUrl = requestMeta.finalUrl || requestMeta.requestedUrl;
  const roots = config.tagListSelector ? Array.from(doc.querySelectorAll(config.tagListSelector)) : [doc];
  const items = Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(config.tagItemSelector)))));
  const tags = [];
  const seen = new Set();
  for (const item of items) {
    const name = extractFieldValuesIncludingSelf(item, config.tagNameSelector, "text")[0];
    if (!name) continue;
    const rawUrl = config.tagUrlSelector ? extractFieldValuesIncludingSelf(item, config.tagUrlSelector, "url")[0] : "";
    const count = config.tagCountSelector ? extractFieldValuesIncludingSelf(item, config.tagCountSelector, "text")[0] : "";
    const tag = { name, url: rawUrl ? toAbsoluteScraperUrl(rawUrl, documentUrl) : undefined, count: count || undefined };
    const key = (tag.url || tag.name).trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }

  const nextPageValue = config.nextPageSelector ? extractUrlValues(doc, config.nextPageSelector)[0] : "";
  const paginationValues = config.paginationLinkSelector ? extractUrlValues(doc, config.paginationLinkSelector) : [];
  return {
    currentPageUrl: documentUrl,
    nextPageUrl: nextPageValue ? toAbsoluteScraperUrl(nextPageValue, documentUrl) : undefined,
    paginationUrls: uniqueValues(paginationValues.map((value) => toAbsoluteScraperUrl(value, documentUrl))),
    items: tags,
  };
}

function extractFieldValuesIncludingSelf(root, input, mode) {
  const values = mode === "url" ? extractUrlValues(root, input) : extractValues(root, input);
  const selector = normalizeFieldSelector(input);
  if (!selector || selector.kind === "regex") return uniqueValues(values);
  const view = root?.ownerDocument?.defaultView;
  if (!view?.Element || !(root instanceof view.Element)) return uniqueValues(values);
  const { selector: cssSelector, attribute } = parseSelectorExpression(selector.value);
  const selfValue = cssSelector && root.matches(cssSelector) ? getElementValue(root, attribute, mode) : "";
  return uniqueValues([...values, selfValue].filter(Boolean));
}

class ScraperTestRunner {
  constructor(options) {
    this.options = options;
    this.detailsCache = new Map();
    this.chaptersCache = new Map();
  }

  async testFeature(scraper, feature) {
    const start = Date.now();
    try {
      let result;
      if (feature.kind === "homepage") result = await this.testHomepage(scraper, feature);
      else if (feature.kind === "search") result = await this.testSearch(scraper, feature);
      else if (feature.kind === "details") result = await this.testDetails(scraper, feature);
      else if (feature.kind === "author") result = await this.testAuthor(scraper, feature);
      else if (feature.kind === "tag") result = await this.testTag(scraper, feature);
      else if (feature.kind === "tagList") result = await this.testTagList(scraper, feature);
      else if (feature.kind === "chapters") result = await this.testChapters(scraper, feature);
      else if (feature.kind === "pages") result = await this.testPages(scraper, feature);
      else result = { ok: true, skipped: true, message: "Unsupported feature kind." };
      return { kind: feature.kind, status: feature.status, durationMs: Date.now() - start, ...result };
    } catch (error) {
      return { kind: feature.kind, status: feature.status, durationMs: Date.now() - start, ...buildFailureResult(error) };
    }
  }

  async fetch(request) {
    return fetchScraperDocument(request, this.options);
  }

  async validateResources(scraper, resources) {
    if (this.options.skipUrlChecks) {
      return [];
    }

    const groupCounts = new Map();
    const seen = new Set();
    const selected = [];

    for (const resource of resources) {
      const url = String(resource.url || "").trim();
      if (!url) continue;

      const groupKey = `${resource.type}:${resource.label}`;
      const currentCount = groupCounts.get(groupKey) || 0;
      if (currentCount >= this.options.maxUrlChecks) continue;

      const seenKey = `${resource.type}:${url}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      groupCounts.set(groupKey, currentCount + 1);
      selected.push({ ...resource, url });
    }

    const checks = [];
    for (const resource of selected) {
      const result = await this.fetch({
        baseUrl: scraper.baseUrl,
        targetUrl: resource.url,
        validateImage: resource.type === "image",
      });
      const ok = resource.type === "image"
        ? result.ok && isImageLikeContentType(result.contentType)
        : result.ok;
      checks.push({
        ...resource,
        ok,
        requestedUrl: result.requestedUrl,
        finalUrl: result.finalUrl,
        status: result.status,
        contentType: result.contentType,
        message: ok
          ? undefined
          : result.error || (resource.type === "image" ? "Resource is not a usable image." : "Link request failed."),
      });
    }

    return checks;
  }

  applyResourceChecks(result, resourceChecks) {
    const failedResources = resourceChecks.filter((check) => !check.ok);
    if (!failedResources.length) {
      return { ...result, resourceChecks };
    }

    return {
      ...result,
      ok: false,
      message: `${result.message || "Module failed."}; ${failedResources.length} resource check(s) failed`,
      resourceChecks,
    };
  }

  async testHomepage(scraper, feature) {
    const config = getHomepageConfig(feature);
    const targetUrl = resolveSearchTargetUrl(scraper.baseUrl, config, "", { pageIndex: 0 });
    const requestConfig = resolveRequestConfig(config, "", { pageIndex: 0 });
    return this.testCardListing(scraper, config, targetUrl, requestConfig, "homepage");
  }

  async testSearch(scraper, feature) {
    const config = getSearchConfig(feature);
    const query = config.testQuery || scraper.globalConfig?.homeSearch?.query || "";
    const targetUrl = resolveSearchTargetUrl(scraper.baseUrl, config, query, { pageIndex: 0 });
    const requestConfig = resolveRequestConfig(config, query, { pageIndex: 0 });
    return this.testCardListing(scraper, config, targetUrl, requestConfig, "search");
  }

  async testAuthor(scraper, feature) {
    const config = getListingConfig(feature, "authorNameSelector");
    const input = await this.getListingInput(scraper, feature, config, "author");
    const context = await this.getTemplateContext(scraper);
    const targetUrl = resolveListingTargetUrl(scraper.baseUrl, config, input, { pageIndex: 0, templateContext: context });
    return this.testCardListing(scraper, config, targetUrl, undefined, "author");
  }

  async testTag(scraper, feature) {
    const config = getListingConfig(feature, "tagNameSelector");
    const input = await this.getListingInput(scraper, feature, config, "tag");
    const targetUrl = resolveTagTargetUrl(scraper.baseUrl, config, input, { pageIndex: 0 });
    return this.testCardListing(scraper, config, targetUrl, undefined, "tag");
  }

  async testCardListing(scraper, config, targetUrl, requestConfig, label) {
    const documentResult = await this.fetch({ baseUrl: scraper.baseUrl, targetUrl, requestConfig });
    if (!documentResult.ok || !documentResult.html) return buildDocumentFailure(documentResult);
    const doc = parseDocument(documentResult.html);
    const page = extractSearchPage(doc, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });
    const titles = page.items.map((item) => item.title).filter(Boolean);
    const checks = [
      buildSelectorCheck("title", config.titleSelector, true, titles),
      ...(getListingNameSelector(config) ? [buildSelectorCheck(label === "author" ? "authors" : "tags", getListingNameSelector(config), false, page.listingNames)] : []),
      ...(config.thumbnailSelector ? [buildSelectorCheck("cover", config.thumbnailSelector, false, page.items.map((item) => item.thumbnailUrl).filter(Boolean))] : []),
      ...(config.authorUrlSelector ? [buildSelectorCheck("authorUrl", config.authorUrlSelector, false, page.items.map((item) => item.authorUrl).filter(Boolean))] : []),
      ...(config.summarySelector ? [buildSelectorCheck("description", config.summarySelector, false, page.items.map((item) => item.summary).filter(Boolean))] : []),
      ...(config.pageCountSelector ? [buildSelectorCheck("pageCount", config.pageCountSelector, false, page.items.map((item) => item.pageCount).filter(Boolean))] : []),
      ...(config.languageDetection?.detectFromTitle || config.languageDetection?.languageSelector || config.languageDetection?.processedLanguageSelector
        ? [buildSelectorCheck("language", "Language", false, uniqueValues(page.items.flatMap((item) => item.languageCodes || [])))]
        : []),
    ];
    const resourceChecks = await this.validateResources(scraper, [
      ...page.items.flatMap((item) => [
        { type: "link", label: "detailUrl", url: item.detailUrl },
        { type: "link", label: "authorUrl", url: item.authorUrl },
        ...(item.authorUrls || []).map((url) => ({ type: "link", label: "authorUrl", url })),
        { type: "image", label: "thumbnail", url: item.thumbnailUrl },
      ]),
      { type: "link", label: "nextPage", url: page.nextPageUrl },
    ]);

    return this.applyResourceChecks({
      ok: titles.length > 0,
      message: titles.length > 0 ? `${titles.length} result(s)` : "No card title found.",
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      checks,
      samples: titles.slice(0, 5),
    }, resourceChecks);
  }

  async testDetails(scraper, feature = getFeature(scraper, "details")) {
    const cacheKey = scraper.id || scraper.name;
    if (this.detailsCache.has(cacheKey)) {
      return this.detailsCache.get(cacheKey);
    }

    const promise = this.resolveDetails(scraper, feature);
    this.detailsCache.set(cacheKey, promise);
    return promise;
  }

  async resolveDetails(scraper, feature) {
    const config = getDetailsConfig(feature);
    if (!config) return buildFailureResult("Details feature is not configured.");
    const input = config.urlStrategy === "template"
      ? config.testValue || feature.validation?.requestedUrl || feature.validation?.finalUrl || ""
      : config.testUrl || feature.validation?.requestedUrl || feature.validation?.finalUrl || "";
    const targetUrl = resolveDetailsTargetUrl(scraper.baseUrl, config, input);
    const documentResult = await this.fetch({ baseUrl: scraper.baseUrl, targetUrl });
    if (!documentResult.ok || !documentResult.html) return buildDocumentFailure(documentResult);

    const doc = parseDocument(documentResult.html);
    const details = extractDetails(doc, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      html: documentResult.html,
    });
    const checks = [];
    const errors = [];
    const addCheck = (key, selector, required, values) => {
      const check = buildSelectorCheck(key, selector, required, values);
      checks.push(check);
      if (required && !values.length) errors.push(key);
    };

    addCheck("title", config.titleSelector, true, details.fieldValues.title || []);
    if (config.coverSelector) addCheck("cover", config.coverSelector, false, details.fieldValues.cover || []);
    if (config.descriptionSelector) addCheck("description", config.descriptionSelector, false, details.fieldValues.description || []);
    if (config.authorsSelector) addCheck("authors", config.authorsSelector, false, details.fieldValues.authors || []);
    if (config.authorUrlSelector) addCheck("authorUrl", config.authorUrlSelector, false, details.authorUrls || []);
    if (config.tagsSelector) addCheck("tags", config.tagsSelector, false, details.fieldValues.tags || []);
    if (config.tagUrlSelector) addCheck("tagUrl", config.tagUrlSelector, false, details.tagUrls || []);
    if (config.statusSelector) addCheck("status", config.statusSelector, false, details.fieldValues.status || []);
    if (config.pageCountSelector) addCheck("pageCount", config.pageCountSelector, false, details.fieldValues.pageCount || []);
    if (config.thumbnailsSelector) addCheck("thumbnails", config.thumbnailsSelector, false, details.thumbnails || []);
    if (config.thumbnailsNextPageSelector) {
      addCheck("thumbnailsNextPage", config.thumbnailsNextPageSelector, false, details.thumbnailsNextPageUrl ? [details.thumbnailsNextPageUrl] : []);
    }
    if (config.languageDetection?.detectFromTitle || config.languageDetection?.languageSelector || config.languageDetection?.processedLanguageSelector) {
      addCheck("language", "Language", false, details.languageCodes || []);
    }
    for (const derivedValue of details.derivedValueResults) {
      if (derivedValue.issueCode) errors.push(`derived:${derivedValue.key}`);
    }
    const resourceChecks = await this.validateResources(scraper, [
      { type: "image", label: "cover", url: details.cover },
      ...(details.thumbnails || []).map((url) => ({ type: "image", label: "thumbnail", url })),
      ...(details.authorUrls || []).map((url) => ({ type: "link", label: "authorUrl", url })),
      ...(details.tagUrls || [])
        .filter(looksLikeHttpResourceUrl)
        .map((url) => ({ type: "link", label: "tagUrl", url })),
      { type: "link", label: "thumbnailsNextPage", url: details.thumbnailsNextPageUrl },
    ]);

    return this.applyResourceChecks({
      ok: errors.length === 0,
      message: errors.length ? `Failed checks: ${errors.join(", ")}` : `Title: ${details.title}`,
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      checks,
      derivedValues: details.derivedValueResults,
      details,
      samples: [details.title].filter(Boolean),
    }, resourceChecks);
  }

  async getListingInput(scraper, feature, config, kind) {
    const direct = config.urlStrategy === "template" ? config.testValue : config.testUrl;
    if (direct) return direct;
    if (feature.validation?.requestedUrl) return feature.validation.requestedUrl;
    if (feature.validation?.finalUrl) return feature.validation.finalUrl;

    const detailsResult = await this.testDetails(scraper);
    if (detailsResult.details) {
      if (kind === "author") {
        return detailsResult.details.authorUrls?.[0] || detailsResult.details.authors?.[0] || "";
      }
      return detailsResult.details.tagUrls?.[0] || detailsResult.details.tags?.[0] || "";
    }

    throw new Error(`No test input is available for ${kind}.`);
  }

  async getTemplateContext(scraper) {
    const detailsResult = await this.testDetails(scraper);
    return detailsResult.details ? buildTemplateContextFromDetails(detailsResult.details) : {};
  }

  async testTagList(scraper, feature) {
    const config = getTagListConfig(feature);
    const targetUrl = resolveSearchTargetUrl(scraper.baseUrl, config, "", { pageIndex: 0 });
    const documentResult = await this.fetch({ baseUrl: scraper.baseUrl, targetUrl });
    if (!documentResult.ok || !documentResult.html) return buildDocumentFailure(documentResult);
    const doc = parseDocument(documentResult.html);
    const page = extractTagListPage(doc, config, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });
    const tagNames = page.items.map((tag) => tag.name).filter(Boolean);
    const checks = [
      buildSelectorCheck("tags", config.tagNameSelector, true, tagNames),
      ...(config.tagUrlSelector ? [buildSelectorCheck("tagUrl", config.tagUrlSelector, false, page.items.map((tag) => tag.url).filter(Boolean))] : []),
      ...(config.tagCountSelector ? [buildSelectorCheck("pageCount", config.tagCountSelector, false, page.items.map((tag) => tag.count).filter(Boolean))] : []),
    ];
    const resourceChecks = await this.validateResources(scraper, [
      ...page.items
        .map((tag) => tag.url)
        .filter(looksLikeHttpResourceUrl)
        .map((url) => ({ type: "link", label: "tagUrl", url })),
      ...page.paginationUrls.map((url) => ({ type: "link", label: "pagination", url })),
      { type: "link", label: "nextPage", url: page.nextPageUrl },
    ]);

    return this.applyResourceChecks({
      ok: tagNames.length > 0,
      message: tagNames.length > 0 ? `${tagNames.length} tag(s)` : "No tag name found.",
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      checks,
      samples: tagNames.slice(0, 8),
    }, resourceChecks);
  }

  async testChapters(scraper, feature = getFeature(scraper, "chapters")) {
    const cacheKey = scraper.id || scraper.name;
    if (this.chaptersCache.has(cacheKey)) {
      return this.chaptersCache.get(cacheKey);
    }

    const promise = this.resolveChapters(scraper, feature);
    this.chaptersCache.set(cacheKey, promise);
    return promise;
  }

  async resolveChapters(scraper, feature) {
    const config = getChaptersConfig(feature);
    if (!config) return buildFailureResult("Chapters feature is not configured.");
    const detailsResult = await this.testDetails(scraper);
    if (!detailsResult.details) {
      return buildFailureResult(`Details dependency failed: ${detailsResult.message}`);
    }

    const detailsUrl = detailsResult.details.finalUrl || detailsResult.details.requestedUrl;
    const context = buildTemplateContextFromDetails(detailsResult.details);
    const usesPagination = config.urlStrategy === "template" && hasChapterPagePlaceholder(config.urlTemplate);
    let sourceResult = null;
    let chapters = [];

    for (let pageIndex = 0; pageIndex < this.options.maxChapterPages; pageIndex += 1) {
      const targetUrl = resolveChaptersSourceUrl(scraper.baseUrl, config, context, detailsUrl, pageIndex + 1);
      const documentResult = await this.fetch({ baseUrl: scraper.baseUrl, targetUrl });
      if (!sourceResult) sourceResult = documentResult;
      if (!documentResult.ok || !documentResult.html) {
        if (pageIndex === 0) return buildDocumentFailure(documentResult);
        break;
      }

      const doc = parseDocument(documentResult.html);
      const pageChapters = extractChapters(doc, config, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
      });
      if (!pageChapters.length) {
        if (pageIndex === 0) break;
        break;
      }

      const before = chapters.length;
      chapters = uniqueChapters([...chapters, ...pageChapters]);
      if (!usesPagination || (pageIndex > 0 && chapters.length === before)) break;
    }

    const checks = [
      buildSelectorCheck("chapters", config.chapterItemSelector, true, chapters.map((chapter) => chapter.label)),
    ];
    const resourceChecks = await this.validateResources(scraper, [
      ...chapters.map((chapter) => ({ type: "link", label: "chapterUrl", url: chapter.url })),
      ...chapters.map((chapter) => ({ type: "image", label: "chapterImage", url: chapter.image })),
    ]);

    return this.applyResourceChecks({
      ok: chapters.length > 0,
      message: chapters.length ? `${chapters.length} chapter(s)` : "No chapter found.",
      requestedUrl: sourceResult?.requestedUrl,
      finalUrl: sourceResult?.finalUrl,
      status: sourceResult?.status,
      contentType: sourceResult?.contentType,
      checks,
      chapters,
      samples: chapters.slice(0, 5).map((chapter) => chapter.label),
    }, resourceChecks);
  }

  async testPages(scraper, feature) {
    const config = getPagesConfig(feature);
    const detailsResult = await this.testDetails(scraper);
    if (!detailsResult.details) {
      return buildFailureResult(`Details dependency failed: ${detailsResult.message}`);
    }

    let chapter = null;
    if (usesPagesChapters(config)) {
      const chaptersResult = await this.testChapters(scraper);
      if (!chaptersResult.ok || !chaptersResult.chapters?.length) {
        return buildFailureResult(`Chapters dependency failed: ${chaptersResult.message}`);
      }
      chapter = chaptersResult.chapters[0];
    }

    const details = detailsResult.details;
    const detailsUrl = details.finalUrl || details.requestedUrl;
    const targetUrl = config.urlStrategy === "template"
      ? buildPageTemplateUrl(
        scraper.baseUrl,
        config,
        buildTemplateContextFromDetails(details, chapter),
        resolveTemplateBaseUrl(scraper.baseUrl, config.templateBase, usesPagesTemplateChapterContext(config)
          ? chapter?.url || detailsUrl
          : detailsUrl),
        0,
      )
      : usesPagesChapterSource(config)
        ? chapter?.url || ""
        : detailsUrl;

    const documentResult = await this.fetch({ baseUrl: scraper.baseUrl, targetUrl });
    if (!documentResult.ok) return buildDocumentFailure(documentResult);
    const pagesCheck = await this.buildPagesCheck(scraper, config, details, chapter, documentResult);
    const pageUrls = pagesCheck.samples || (pagesCheck.sample ? [pagesCheck.sample] : []);
    const resourceChecks = await this.validateResources(
      scraper,
      pageUrls.map((url) => ({ type: "image", label: "page", url })),
    );

    return this.applyResourceChecks({
      ok: pagesCheck.matchedCount > 0,
      message: pagesCheck.matchedCount ? `${pagesCheck.matchedCount} page URL(s)` : "No page URL found.",
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
      status: documentResult.status,
      contentType: documentResult.contentType,
      checks: [pagesCheck],
      samples: pagesCheck.samples || (pagesCheck.sample ? [pagesCheck.sample] : []),
    }, resourceChecks);
  }

  async buildPagesCheck(scraper, config, details, chapter, firstResult) {
    if (!hasFieldSelectorValue(config.pageImageSelector)) {
      if (config.urlStrategy === "template" && hasPagePlaceholder(config.urlTemplate)) {
        const urls = [];
        const templateContext = buildTemplateContextFromDetails(details, chapter);
        const detailsUrl = details.finalUrl || details.requestedUrl;
        const templateBaseUrl = resolveTemplateBaseUrl(scraper.baseUrl, config.templateBase, usesPagesTemplateChapterContext(config)
          ? chapter?.url || detailsUrl
          : detailsUrl);

        for (let pageIndex = 0; pageIndex < this.options.maxTemplatePages; pageIndex += 1) {
          const pageUrl = buildPageTemplateUrl(scraper.baseUrl, config, templateContext, templateBaseUrl, pageIndex);
          const result = pageIndex === 0 ? firstResult : await this.fetch({ baseUrl: scraper.baseUrl, targetUrl: pageUrl });
          if (!result.ok || !isImageLikeContentType(result.contentType)) break;
          urls.push(result.finalUrl || result.requestedUrl);
        }
        return buildSelectorCheck("pages", "", true, urls);
      }

      const directPageUrl = firstResult.finalUrl || firstResult.requestedUrl;
      return buildSelectorCheck("pages", "", true, isImageLikeContentType(firstResult.contentType) ? [directPageUrl] : []);
    }

    const selector = config.pageImageSelector;
    const selectorLabel = formatFieldSelector(selector);
    if (config.urlStrategy === "template" && hasPagePlaceholder(config.urlTemplate)) {
      const urls = [];
      const seen = new Set();
      const templateContext = buildTemplateContextFromDetails(details, chapter);
      const detailsUrl = details.finalUrl || details.requestedUrl;
      const templateBaseUrl = resolveTemplateBaseUrl(scraper.baseUrl, config.templateBase, usesPagesTemplateChapterContext(config)
        ? chapter?.url || detailsUrl
        : detailsUrl);

      for (let pageIndex = 0; pageIndex < this.options.maxTemplatePages; pageIndex += 1) {
        const pageUrl = buildPageTemplateUrl(scraper.baseUrl, config, templateContext, templateBaseUrl, pageIndex);
        const result = pageIndex === 0 ? firstResult : await this.fetch({ baseUrl: scraper.baseUrl, targetUrl: pageUrl });
        if (!result.ok || !result.html) break;
        const doc = parseDocument(result.html);
        const pageDocumentUrl = result.finalUrl || result.requestedUrl;
        const nextUrls = extractValues(doc, selector)
          .map((value) => toAbsoluteScraperUrl(value, pageDocumentUrl))
          .filter((url) => {
            if (seen.has(url)) return false;
            seen.add(url);
            return true;
          });
        if (!nextUrls.length) break;
        urls.push(...nextUrls);
      }
      return buildSelectorCheck("pages", selectorLabel, true, urls);
    }

    if (!firstResult.html) {
      return buildSelectorCheck("pages", selectorLabel, true, []);
    }

    const doc = parseDocument(firstResult.html);
    const documentUrl = firstResult.finalUrl || firstResult.requestedUrl;
    const urls = extractValues(doc, selector).map((value) => toAbsoluteScraperUrl(value, documentUrl));
    return buildSelectorCheck("pages", selectorLabel, true, urls);
  }
}

function uniqueChapters(chapters) {
  const seen = new Set();
  return chapters.filter((chapter) => {
    const key = `${chapter.url}::${chapter.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getConfiguredFeatures(scraper, moduleFilter) {
  const byKind = new Map((scraper.features || []).map((feature) => [feature.kind, feature]));
  return FEATURE_ORDER
    .map((kind) => byKind.get(kind))
    .filter((feature) => feature && isFeatureConfigured(feature))
    .filter((feature) => !moduleFilter.size || moduleFilter.has(normalizeToken(feature.kind)));
}

function shouldRunScraper(scraper, options) {
  const candidates = [scraper.id, scraper.name, scraper.baseUrl].map(normalizeToken).filter(Boolean);
  if (options.include.size && !candidates.some((candidate) => options.include.has(candidate))) {
    return false;
  }
  if (options.exclude.size && candidates.some((candidate) => options.exclude.has(candidate))) {
    return false;
  }
  return true;
}

function formatStatus(result) {
  if (result.skipped) return "SKIP";
  return result.ok ? "OK" : "FAIL";
}

function formatResourceFailure(check) {
  const statusText = typeof check.status === "number" ? `HTTP ${check.status}` : check.message || "request failed";
  return check.contentType ? `${statusText} ${check.contentType}` : statusText;
}

function printModuleResult(result, verbose) {
  const status = formatStatus(result).padEnd(4);
  const message = result.message ? ` - ${result.message}` : "";
  const timing = ` (${result.durationMs} ms)`;
  console.log(`  [${status}] ${result.kind}${timing}${message}`);
  if (verbose && result.requestedUrl) console.log(`         ${result.requestedUrl}`);
  if (!result.ok && result.checks?.length) {
    const failed = result.checks.filter((check) => check.issueCode || (check.required && check.matchedCount === 0));
    for (const check of failed.slice(0, 3)) {
      console.log(`         check ${check.key}: ${check.issueCode || "required_no_match"} (${check.selector})`);
    }
  }
  if (!result.ok && result.resourceChecks?.length) {
    const failedResources = result.resourceChecks.filter((check) => !check.ok);
    for (const check of failedResources.slice(0, 3)) {
      const typeText = check.type === "image" ? "image" : "link";
      console.log(`         ${typeText} ${check.label}: ${formatResourceFailure(check)} (${check.url})`);
    }
  }
}

function printSummary(runResults) {
  const moduleResults = runResults.flatMap((scraper) => scraper.modules);
  const failed = runResults.flatMap((scraper) =>
    scraper.modules.filter((moduleResult) => !moduleResult.ok && !moduleResult.skipped).map((moduleResult) => ({
      scraper: scraper.name,
      baseUrl: scraper.baseUrl,
      ...moduleResult,
    })),
  );
  const okCount = moduleResults.filter((result) => result.ok && !result.skipped).length;
  const skippedCount = moduleResults.filter((result) => result.skipped).length;

  console.log("");
  console.log(`Summary: ${okCount} ok, ${failed.length} failed, ${skippedCount} skipped.`);
  if (!failed.length) {
    return;
  }

  console.log("");
  console.log("Failed modules:");
  for (const result of failed) {
    const firstFailedCheck = result.checks?.find((check) => check.issueCode || (check.required && check.matchedCount === 0));
    const firstFailedResource = result.resourceChecks?.find((check) => !check.ok);
    const checkText = firstFailedCheck
      ? ` | ${firstFailedCheck.key}: ${firstFailedCheck.issueCode || "required_no_match"}`
      : firstFailedResource
        ? ` | ${firstFailedResource.type} ${firstFailedResource.label}: ${formatResourceFailure(firstFailedResource)}`
      : "";
    console.log(`- ${result.scraper} / ${result.kind}: ${result.message || "failed"}${checkText}`);
    if (result.requestedUrl) console.log(`  URL: ${result.requestedUrl}`);
    if (firstFailedResource?.url) console.log(`  Resource: ${firstFailedResource.url}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scrapersFile = findScrapersFile(options.scrapersFile);
  const scrapers = readJsonArray(scrapersFile);
  const selectedScrapers = scrapers.filter((scraper) => shouldRunScraper(scraper, options));

  console.log(`Scrapers file: ${scrapersFile}`);
  console.log(`Selected scrapers: ${selectedScrapers.length}/${scrapers.length}`);

  if (options.listOnly) {
    for (const scraper of selectedScrapers) {
      const modules = getConfiguredFeatures(scraper, options.modules).map((feature) => `${feature.kind}:${feature.status}`);
      console.log(`- ${scraper.name} (${scraper.id}) [${modules.join(", ")}]`);
    }
    return;
  }

  const runner = new ScraperTestRunner(options);
  const runResults = [];

  for (const scraper of selectedScrapers) {
    const features = getConfiguredFeatures(scraper, options.modules);
    console.log("");
    console.log(`${scraper.name} (${scraper.baseUrl})`);

    const modules = [];
    for (const feature of features) {
      const result = await runner.testFeature(scraper, feature);
      modules.push(result);
      printModuleResult(result, options.verbose);
    }

    runResults.push({
      id: scraper.id,
      name: scraper.name,
      baseUrl: scraper.baseUrl,
      modules,
    });
  }

  printSummary(runResults);

  if (options.jsonOut) {
    const outputPath = path.resolve(options.jsonOut);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({
      scrapersFile,
      checkedAt: new Date().toISOString(),
      results: runResults,
    }, null, 2));
    console.log(`JSON report: ${outputPath}`);
  }

  const failedCount = runResults.flatMap((scraper) => scraper.modules).filter((result) => !result.ok && !result.skipped).length;
  process.exitCode = failedCount ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
