type OpenMultiSearchJsonDocumentOptions = {
  filename: string;
  content: string;
  setIsExportingJson: (isExporting: boolean) => void;
  setOpenError: (message: string | null) => void;
};

const getJsonDocumentApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const openMultiSearchJsonDocument = async ({
  filename,
  content,
  setIsExportingJson,
  setOpenError,
}: OpenMultiSearchJsonDocumentOptions): Promise<void> => {
  const api = getJsonDocumentApi();
  if (!api || typeof api.openJsonDocument !== "function") {
    setOpenError("L'export JSON n'est pas disponible dans cette version.");
    return;
  }

  setIsExportingJson(true);
  setOpenError(null);

  try {
    const result = await api.openJsonDocument({
      filename,
      content,
    });

    if (!result?.success) {
      throw new Error(String(result?.error || "Impossible d'ouvrir le JSON."));
    }
  } catch (exportError) {
    setOpenError(exportError instanceof Error ? exportError.message : String(exportError));
  } finally {
    setIsExportingJson(false);
  }
};
