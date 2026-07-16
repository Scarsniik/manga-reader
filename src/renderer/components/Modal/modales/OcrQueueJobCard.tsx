import React from "react";
import { OpenBookIcon } from "@/renderer/components/icons";

type JobAction = "pause" | "resume" | "cancel";

type Props = {
  job: any;
  onAction: (action: JobAction, jobId: string) => void;
};

const formatJobStatus = (status?: string | null) => {
  switch (status) {
    case "queued": return "En attente";
    case "detecting_language": return "Detection langue";
    case "running": return "En cours";
    case "paused": return "En pause";
    case "completed": return "Termine";
    case "error": return "Erreur";
    case "cancelled": return "Annule";
    default: return "Inconnu";
  }
};

const getJobProgress = (job: any): number => {
  const completedPages = Number(job?.completedPages) || 0;
  const totalPages = Number(job?.totalPages) || 0;
  return totalPages > 0
    ? Math.min(100, Math.max(0, (completedPages / totalPages) * 100))
    : 0;
};

export default function OcrQueueJobCard({ job, onAction }: Props) {
  const progress = getJobProgress(job);

  return (
    <article className={`ocr-queue-job status-${job.status || "unknown"}`}>
      <div className="ocr-queue-job-header">
        <div className="ocr-queue-job-title">
          <span aria-hidden="true"><OpenBookIcon /></span>
          <div>
            <h4>{job.mangaTitle}</h4>
            <small>
              {job.mode === "full_manga" ? "Manga complet" : "A la volee"}
              {" · "}{job.heavyPass ? "Passe lourde" : "Standard rapide"}
            </small>
          </div>
        </div>
        <span className={`ocr-job-badge ${job.status}`}>{formatJobStatus(job.status)}</span>
      </div>
      <div className="ocr-job-progress-row">
        <div className="ocr-job-progress" aria-label={`Progression ${Math.round(progress)}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong>{job.completedPages || 0}/{job.totalPages || 0}</strong>
      </div>
      <div className="ocr-job-meta">
        {typeof job.currentPage === "number" ? <span>Page {job.currentPage}</span> : null}
        {job.languageDetection?.status ? <span>Langue : {job.languageDetection.status}</span> : null}
        {job.message ? <span className="ocr-job-message">{job.message}</span> : null}
      </div>
      <div className="ocr-queue-actions">
        {job.status === "running" ? (
          <button type="button" className="secondary" onClick={() => onAction("pause", job.id)}>Pause</button>
        ) : null}
        {job.status === "paused" ? (
          <button type="button" onClick={() => onAction("resume", job.id)}>Reprendre</button>
        ) : null}
        {!["completed", "cancelled"].includes(job.status) ? (
          <button type="button" className="secondary" onClick={() => onAction("cancel", job.id)}>Annuler</button>
        ) : null}
      </div>
    </article>
  );
}
