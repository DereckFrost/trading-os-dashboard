"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Trade = {
  id: string;
  title: string | null;
  trading_day_id: string | null;
  setup_id: string | null;
  trade_date: string;
  instrument: string;
  direction: string;
  setup_quality: string | null;
  execution_quality: string | null;
  emotion: string | null;
  close_type: string | null;
  r: number | null;
  before_screenshot_url: string | null;
  after_screenshot_url: string | null;
  notes: string | null;
};

type Setup = {
  id: string;
  name: string;
  active: boolean;
};

type TradingDay = {
  id: string;
  date: string;
  mental_state: string | null;
  waited_for_setup: boolean;
  only_one_trade: boolean;
  did_not_recover_losses: boolean;
  session_finished: boolean;
  notes: string | null;
};

function formatDate(date: string) {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function formatR(value: number | null) {
  if (value === null || Number.isNaN(value)) return "0.00R";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

function resultLabel(closeType: string | null, r: number | null) {
  if (closeType === "🟢 TP") return "GANADOR";
  if (closeType === "🔴 SL") return "PÉRDIDA";
  if (closeType === "PARCIAL") return "PARCIAL";
  if (closeType === "⚪ BE") return "BREAK EVEN";
  if (r !== null && r > 0) return "GANADOR";
  if (r !== null && r < 0) return "PÉRDIDA";
  return "—";
}

function resultClass(closeType: string | null, r: number | null) {
  if (closeType === "🟢 TP" || (r !== null && r > 0)) {
    return "positive";
  }
  if (closeType === "🔴 SL" || (r !== null && r < 0)) {
    return "negative";
  }
  return "neutral";
}

function qualityClass(value: string | null) {
  if (value === "A+") return "aplus";
  if (value === "B+") return "bplus";
  if (value === "B") return "b";
  if (value === "C") return "c";
  return "";
}

function screenshotSrc(value: string | null) {
  if (!value) return "";

  if (value.startsWith("/api/trades/screenshots?path=")) {
    return value;
  }

  if (value.startsWith("users/")) {
    return `/api/trades/screenshots?path=${encodeURIComponent(value)}`;
  }

  const marker = "/storage/v1/object/public/trade-screenshots/";
  const index = value.indexOf(marker);

  if (index !== -1) {
    const path = decodeURIComponent(
      value.slice(index + marker.length).split("?")[0],
    );
    return `/api/trades/screenshots?path=${encodeURIComponent(path)}`;
  }

  return value;
}

export default function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [tradeId, setTradeId] = useState("");
  const [trade, setTrade] = useState<Trade | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [tradingDay, setTradingDay] = useState<TradingDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    void params.then(({ id }) => {
      if (!cancelled) setTradeId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!tradeId) return;

    let cancelled = false;

    async function loadTrade() {
      try {
        setLoading(true);
        setError("");
        setSuccess("");

        const tradeResponse = await fetch(
          `/api/trades?id=${encodeURIComponent(tradeId)}`,
          { cache: "no-store" },
        );

        const tradeResult = await tradeResponse.json();

        if (!tradeResponse.ok || !tradeResult.success) {
          throw new Error(
            tradeResult.error || "No se pudo cargar el trade.",
          );
        }

        const loadedTrade = tradeResult.trade as Trade;

        const { supabaseBrowserFetch } = await import("@/app/lib/supabase/browser-fetch");

        const [loadedSetupRows, loadedDayRows] = await Promise.all([
          loadedTrade.setup_id
            ? supabaseBrowserFetch<Setup[]>(
                "setups",
                `?select=id,name,active&id=eq.${encodeURIComponent(loadedTrade.setup_id)}&limit=1`,
              )
            : Promise.resolve([] as Setup[]),
          supabaseBrowserFetch<TradingDay[]>(
            "trading_days",
            `?select=*&date=eq.${encodeURIComponent(loadedTrade.trade_date)}&limit=1`,
          ),
        ]);

        let loadedSetup: Setup | null = null;

        loadedSetup = loadedSetupRows?.[0] ?? null;
        const loadedDay: TradingDay | null = loadedDayRows?.[0] ?? null;

        if (!cancelled) {
          setTrade(loadedTrade);
          setSetup(loadedSetup);
          setTradingDay(loadedDay);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el trade.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTrade();

    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  useEffect(() => {
    if (!lightboxImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxImage(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxImage]);

  async function handleDelete() {
    if (!trade) return;

    const confirmed = window.confirm(
      `¿Eliminar el trade de ${formatDate(trade.trade_date)} · ${trade.instrument}?\n\nEsta acción no se puede deshacer.`,
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/trades?id=${encodeURIComponent(trade.id)}`,
        { method: "DELETE" },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "No se pudo eliminar el trade.",
        );
      }

      setSuccess("Trade eliminado correctamente.");

      window.setTimeout(() => {
        router.push("/journal");
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el trade.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <div className="container">
          <div className="empty">Cargando trade...</div>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (error || !trade) {
    return (
      <main className="page">
        <div className="container">
          <Link href="/journal" className="back">
            ← Volver al Journal
          </Link>

          <div className="card error-card">
            <p>{error || "Trade no encontrado."}</p>
          </div>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  const r = trade.r ?? 0;
  const outcomeClass = resultClass(trade.close_type, trade.r);
  const isPositive = r > 0;
  const isNegative = r < 0;

  return (
    <main className="page">
      <div className="container">
        <div className="topbar">
          <Link href="/journal" className="back">
            ← Volver al Journal
          </Link>

          <div className="actions">
            <Link
              href={`/journal?edit=${encodeURIComponent(trade.id)}`}
              className="button secondary"
            >
              Editar
            </Link>

            <button
              type="button"
              className="button danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <header className="hero">
          <div>
            <p className="eyebrow">TRADE DETAIL</p>
            <h1>
              {trade.instrument} · {trade.direction}
            </h1>
            <p className="subtitle">
              {formatDate(trade.trade_date)}
              {setup ? ` · ${setup.name}` : ""}
            </p>
          </div>

          <div className={`hero-r ${outcomeClass}`}>
            {formatR(trade.r)}
            <span>{resultLabel(trade.close_type, trade.r)}</span>
          </div>
        </header>

        <section className="grid">
          <div className="card">
            <p className="card-label">OPERACIÓN</p>

            <div className="details">
              <div>
                <span>Instrumento</span>
                <strong>{trade.instrument || "—"}</strong>
              </div>

              <div>
                <span>Dirección</span>
                <strong>{trade.direction || "—"}</strong>
              </div>

              <div>
                <span>Resultado</span>
                <strong>{trade.close_type || "—"}</strong>
              </div>

              <div>
                <span>R</span>
                <strong className={isPositive ? "green" : isNegative ? "red" : ""}>
                  {formatR(trade.r)}
                </strong>
              </div>

              <div>
                <span>Setup</span>
                <strong>{setup?.name || "—"}</strong>
              </div>

              <div>
                <span>Calidad del setup</span>
                <strong className={`quality ${qualityClass(trade.setup_quality)}`}>
                  {trade.setup_quality || "—"}
                </strong>
              </div>

              <div>
                <span>Ejecución</span>
                <strong>{trade.execution_quality || "—"}</strong>
              </div>

              <div>
                <span>Emoción</span>
                <strong>{trade.emotion || "—"}</strong>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="card-label">JORNADA</p>

            {tradingDay ? (
              <div className="details">
                <div>
                  <span>Fecha</span>
                  <strong>{formatDate(tradingDay.date)}</strong>
                </div>

                <div>
                  <span>Estado</span>
                  <strong>
                    {tradingDay.session_finished
                      ? "Finalizada"
                      : "En progreso"}
                  </strong>
                </div>

                <div>
                  <span>Esperó setup</span>
                  <strong>
                    {tradingDay.waited_for_setup ? "Sí" : "No"}
                  </strong>
                </div>

                <div>
                  <span>Una operación</span>
                  <strong>
                    {tradingDay.only_one_trade ? "Sí" : "No"}
                  </strong>
                </div>

                <div>
                  <span>No recuperó pérdidas</span>
                  <strong>
                    {tradingDay.did_not_recover_losses ? "Sí" : "No"}
                  </strong>
                </div>

                <div className="full">
                  <span>Notas de jornada</span>
                  <strong>{tradingDay.notes || "—"}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-small">
                No hay información adicional de Trading Days para esta fecha.
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="card-label">EVIDENCIA</p>
            </div>
          </div>

          <div className="screenshots">
            <div className="screenshot">
              <div className="screenshot-label">ANTES</div>
              {trade.before_screenshot_url ? (
                <button
                  type="button"
                  className="screenshot-trigger"
                  onClick={() =>
                    setLightboxImage({
                      url: screenshotSrc(trade.before_screenshot_url),
                      alt: "Screenshot antes de la entrada",
                    })
                  }
                  aria-label="Expandir screenshot antes de la entrada"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotSrc(trade.before_screenshot_url)}
                    alt="Screenshot antes de la entrada"
                  />
                </button>
              ) : (
                <div className="no-image">
                  Sin screenshot antes de la entrada.
                </div>
              )}
            </div>

            <div className="screenshot">
              <div className="screenshot-label">DESPUÉS</div>
              {trade.after_screenshot_url ? (
                <button
                  type="button"
                  className="screenshot-trigger"
                  onClick={() =>
                    setLightboxImage({
                      url: screenshotSrc(trade.after_screenshot_url),
                      alt: "Screenshot después del cierre",
                    })
                  }
                  aria-label="Expandir screenshot después del cierre"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotSrc(trade.after_screenshot_url)}
                    alt="Screenshot después del cierre"
                  />
                </button>
              ) : (
                <div className="no-image">
                  Sin screenshot después del cierre.
                </div>
              )}
            </div>
          </div>
        </section>

        {lightboxImage && (
          <div
            className="lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Screenshot ampliado"
            onClick={() => setLightboxImage(null)}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setLightboxImage(null)}
              aria-label="Cerrar screenshot ampliado"
            >
              ×
            </button>
            <div
              className="lightbox-content"
              onClick={(event) => event.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.alt}
              />
            </div>
          </div>
        )}

        <section className="card">
          <p className="card-label">NOTAS</p>
          <div className="notes">
            {trade.notes || "No hay notas registradas para este trade."}
          </div>
        </section>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 48px 32px 80px;
    color: var(--text-primary);
    background: var(--surface);
  }

  .container {
    width: min(1180px, 100%);
    margin: 0 auto;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 28px;
  }

  .back {
    color: #aab0b8;
    text-decoration: none;
    font-size: 13px;
  }

  .back:hover {
    color: var(--accent);
  }

  .actions {
    display: flex;
    gap: 9px;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 7px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .secondary {
    border: 1px solid var(--border-strong);
    color: #d1d5da;
    background: transparent;
  }

  .secondary:hover {
    background: #202327;
  }

  .danger {
    border: 1px solid var(--danger-border);
    color: var(--danger);
    background: transparent;
  }

  .danger:hover {
    background: rgba(255, 52, 94, 0.08);
  }

  .danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 22px;
  }

  .eyebrow {
    margin: 0 0 8px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
  }

  h1 {
    margin: 0;
    font-size: 34px;
    letter-spacing: -1px;
  }

  .subtitle {
    margin: 9px 0 0;
    color: var(--text-dim);
    font-size: 14px;
  }

  .hero-r {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    font-size: 30px;
    font-weight: 800;
  }

  .hero-r span {
    margin-bottom: 5px;
    font-size: 10px;
    letter-spacing: 1.5px;
  }

  .positive {
    color: var(--accent);
  }

  .negative {
    color: var(--danger);
  }

  .neutral {
    color: #c3c7cc;
  }

  .grid {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .card {
    margin-bottom: 16px;
    padding: 22px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
  }

  .grid .card {
    margin-bottom: 0;
  }

  .card-label {
    margin: 0 0 18px;
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
  }

  .details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 18px 28px;
  }

  .details div {
    min-width: 0;
  }

  .details .full {
    grid-column: 1 / -1;
  }

  .details span {
    display: block;
    margin-bottom: 6px;
    color: #707780;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .details strong {
    color: #e8e9eb;
    font-size: 14px;
    line-height: 1.4;
  }

  .green {
    color: var(--accent) !important;
  }

  .red {
    color: var(--danger) !important;
  }

  .quality {
    display: inline-flex;
    width: fit-content;
    padding: 4px 7px;
    border: 1px solid #505760;
    border-radius: 5px;
    font-size: 11px !important;
  }

  .quality.aplus {
    border-color: #008e61;
    color: var(--accent) !important;
  }

  .quality.bplus,
  .quality.b {
    border-color: #8e7a12;
    color: #e8d34c !important;
  }

  .quality.c {
    border-color: #9d2948;
    color: var(--danger) !important;
  }

  .section-heading {
    margin-bottom: 18px;
  }

  .section-heading h2 {
    margin: -6px 0 0;
    font-size: 18px;
  }

  .screenshots {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .screenshot {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
  }

  .screenshot-label {
    padding: 11px 13px;
    border-bottom: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
  }

  .screenshot-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .screenshot-trigger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .screenshot img {
    display: block;
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    background: var(--background);
    transition: opacity 160ms ease;
  }

  .screenshot-trigger:hover img {
    opacity: 0.9;
  }

  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background: rgba(0, 0, 0, 0.86);
    backdrop-filter: blur(4px);
    cursor: zoom-out;
  }

  .lightbox-content {
    max-width: min(1500px, 94vw);
    max-height: 92vh;
    cursor: default;
  }

  .lightbox-content img {
    display: block;
    max-width: 100%;
    max-height: 92vh;
    width: auto;
    height: auto;
    object-fit: contain;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    background: var(--background);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }

  .lightbox-close {
    position: fixed;
    top: 18px;
    right: 22px;
    z-index: 1;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--text-primary);
    background: var(--surface-2);
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
  }

  .lightbox-close:hover {
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .no-image {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    padding: 20px;
    color: #686f78;
    text-align: center;
    font-size: 13px;
  }

  .notes {
    color: var(--text-secondary);
    white-space: pre-wrap;
    line-height: 1.7;
  }

  .empty,
  .empty-small {
    color: #737a84;
  }

  .empty {
    padding: 80px 20px;
    text-align: center;
  }

  .empty-small {
    padding: 20px 0;
    font-size: 13px;
    line-height: 1.6;
  }

  .alert {
    margin-bottom: 16px;
    padding: 13px 15px;
    border: 1px solid;
    border-radius: 8px;
    font-size: 13px;
  }

  .alert.error {
    border-color: #7f2539;
    color: var(--danger);
    background: rgba(127, 37, 57, 0.18);
  }

  .alert.success {
    border-color: #087b55;
    color: #32eaa7;
    background: rgba(0, 216, 144, 0.08);
  }

  .error-card {
    color: var(--danger);
  }

  @media (max-width: 850px) {
    .page {
      padding: 30px 16px 60px;
    }

    .hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .grid,
    .screenshots {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .topbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .actions {
      width: 100%;
    }

    .button {
      flex: 1;
    }

    h1 {
      font-size: 28px;
    }

    .details {
      grid-template-columns: 1fr;
    }

    .details .full {
      grid-column: auto;
    }
  }
`;