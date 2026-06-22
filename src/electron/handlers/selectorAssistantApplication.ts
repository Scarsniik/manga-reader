import { BrowserWindow } from "electron";
import type { SelectorAssistantWindowSession } from "./selectorAssistantSession";
import type { SelectorAssistantAppliedValue } from "../../shared/selectorAssistant";

export const applySelectorAssistantValueToOwner = (
  session: SelectorAssistantWindowSession | undefined,
  value: unknown,
): boolean => {
  if (!session || !value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectorAssistantAppliedValue>;
  if (typeof candidate.fieldName !== "string" || typeof candidate.selector !== "string") return false;

  const isSelectorField = session.request.fields.some((item) => item.name === candidate.fieldName);
  const isUrlPattern = session.request.urlPattern?.fieldName === candidate.fieldName;
  if (!isSelectorField && !isUrlPattern) return false;

  const owner = BrowserWindow.getAllWindows().find((window) => (
    window.webContents.id === session.ownerWebContentsId
  ));
  if (!owner || owner.isDestroyed()) {
    session.window.close();
    return false;
  }

  owner.webContents.send("selector-assistant-value-applied", {
    formSessionId: session.request.formSessionId,
    fieldName: candidate.fieldName,
    selector: candidate.selector,
  } satisfies SelectorAssistantAppliedValue);
  return true;
};
