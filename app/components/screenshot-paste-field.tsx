"use client";

import {
  ClipboardEvent,
  DragEvent,
  useRef,
  useState,
} from "react";

type ScreenshotPasteFieldProps = {
  label: string;
  slot: "before" | "after";
  value: string;
  onChange: (value: string) => void;
  scopeId?: string | null;
  disabled?: boolean;
};

function getScreenshotDisplayUrl(value: string) {
  if (!value) return value;

  if (value.startsWith("/api/trades/screenshots?path=")) {
    return value;
  }

  if (value.startsWith("users/")) {
    return `/api/trades/screenshots?path=${encodeURIComponent(value)}`;
  }

  if (value.includes("/storage/v1/object/public/trade-screenshots/")) {
    const marker = "/storage/v1/object/public/trade-screenshots/";
    const index = value.indexOf(marker);
    const path = decodeURIComponent(value.slice(index + marker.length).split("?")[0]);
    return `/api/trades/screenshots?path=${encodeURIComponent(path)}`;
  }

  return value;
}

export function ScreenshotPasteField({
  label,
  slot,
  value,
  onChange,
  scopeId,
  disabled = false,
}: ScreenshotPasteFieldProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [dragActive, setDragActive] =
    useState(false);

  async function upload(file: File) {
    if (disabled || uploading) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      window.alert(
        "Solo se pueden pegar o subir imágenes.",
      );
      return;
    }

    try {
      setUploading(true);

      const body = new FormData();

      body.append("file", file);
      body.append("slot", slot);
      body.append("scopeId", scopeId ?? "draft");

      /*
       * Si ya existe una imagen y estamos
       * reemplazándola, enviamos su URL anterior
       * para que el backend pueda encargarse de ella.
       */
      if (value) {
        body.append("oldUrl", value);
      }

      const response = await fetch(
        "/api/trades/screenshots",
        {
          method: "POST",
          body,
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        url?: string;
        path?: string;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.url
      ) {
        throw new Error(
          result.error ??
            "No se pudo subir el screenshot.",
        );
      }

      onChange(result.path ?? result.url);
    } catch (error) {
      console.error(error);

      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo subir el screenshot.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(
    event: ClipboardEvent<HTMLDivElement>,
  ) {
    if (disabled || uploading) {
      return;
    }

    const imageItem = Array.from(
      event.clipboardData.items,
    ).find(
      (item) =>
        item.kind === "file" &&
        item.type.startsWith("image/"),
    );

    if (!imageItem) {
      return;
    }

    event.preventDefault();

    const file = imageItem.getAsFile();

    if (file) {
      void upload(file);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);

    if (disabled || uploading) {
      return;
    }

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      void upload(file);
    }
  }

  function handleDragEnter(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!disabled && !uploading) {
      setDragActive(true);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!disabled && !uploading) {
      setDragActive(true);
    }
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    /*
     * Evita que el estado de drag se apague
     * al pasar de la caja al contenido interno.
     */
    if (
      event.currentTarget ===
      event.target
    ) {
      setDragActive(false);
    }
  }

  function handleClear(
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (disabled || uploading) {
      return;
    }

    onChange("");
  }

  function handleOpenFilePicker() {
    if (disabled || uploading) {
      return;
    }

    inputRef.current?.click();
  }

  return (
    <div className="screenshot-field">
      <style jsx>{`
        .screenshot-field {
          display: grid;
          gap: 8px;
          width: 100%;
        }

        .screenshot-field-label {
          color: var(--text-dim);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.3px;
          text-transform: uppercase;
        }

        .screenshot-dropzone {
          position: relative;
          width: 100%;
          min-height: 190px;
          overflow: hidden;
          border: 1px dashed var(--border-strong);
          border-radius: 10px;
          background: var(--surface);
          cursor: pointer;
          outline: none;
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .screenshot-dropzone:hover,
        .screenshot-dropzone:focus,
        .screenshot-dropzone.is-dragging {
          border-color: var(--accent);
          background: rgba(0, 216, 144, 0.035);
          box-shadow:
            0 0 0 1px
            rgba(0, 216, 144, 0.08);
        }

        .screenshot-dropzone.is-disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .screenshot-empty {
          min-height: 190px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 8px;
          padding: 24px;
          color: var(--text-dim);
          text-align: center;
        }

        .screenshot-empty strong {
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 700;
        }

        .screenshot-empty span {
          font-size: 12px;
        }

        .screenshot-empty .hint {
          color: #5f6770;
          font-size: 11px;
        }

        .screenshot-preview {
          position: relative;
          width: 100%;
          min-height: 190px;
          background: var(--background);
        }

        .screenshot-preview img {
          display: block;
          width: 100%;
          max-height: 420px;
          min-height: 190px;
          object-fit: contain;
        }

        /*
         * X para eliminar:
         * queda siempre arriba a la derecha,
         * sobre la imagen.
         */
        .screenshot-remove {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 5;

          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid
            rgba(255, 107, 131, 0.45);

          border-radius: 50%;

          color: #ffffff;
          background: rgba(15, 17, 18, 0.88);

          cursor: pointer;

          font-size: 17px;
          font-weight: 500;
          line-height: 1;

          box-shadow:
            0 3px 12px
            rgba(0, 0, 0, 0.45);

          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            transform 0.15s ease;
        }

        .screenshot-remove:hover {
          border-color: var(--danger);
          background: rgba(255, 52, 94, 0.18);
          transform: scale(1.06);
        }

        .screenshot-remove:active {
          transform: scale(0.96);
        }

        .screenshot-remove:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .screenshot-status {
          position: absolute;
          left: 10px;
          bottom: 10px;
          z-index: 4;

          display: inline-flex;
          align-items: center;

          border: 1px solid
            rgba(255, 255, 255, 0.1);

          border-radius: 6px;

          padding: 6px 9px;

          color: var(--text-primary);
          background: rgba(10, 12, 13, 0.86);

          font-size: 11px;
          font-weight: 600;
        }

        .screenshot-status.uploading {
          color: #00ed9c;
          border-color:
            rgba(0, 216, 144, 0.25);
        }

        .screenshot-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #646c75;
          font-size: 11px;
        }

        .screenshot-action-hint {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .screenshot-change-button {
          flex-shrink: 0;

          border: 1px solid #30363c;
          border-radius: 6px;

          padding: 6px 9px;

          color: #aeb4bb;
          background: transparent;

          cursor: pointer;

          font-size: 10px;
          font-weight: 600;
        }

        .screenshot-change-button:hover {
          border-color: #4a525b;
          color: #e1e4e7;
          background: #1b1e20;
        }

        .screenshot-change-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <div className="screenshot-field-label">
        {label}
      </div>

      <div
        className={`screenshot-dropzone${
          dragActive
            ? " is-dragging"
            : ""
        }${
          value
            ? " has-image"
            : ""
        }${
          disabled
            ? " is-disabled"
            : ""
        }`}
        tabIndex={
          disabled ? -1 : 0
        }
        onPaste={handlePaste}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={
          handleOpenFilePicker
        }
        onKeyDown={(event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            handleOpenFilePicker();
          }
        }}
        role="button"
        aria-label={`${label}. Pega una imagen con Ctrl+V, arrastra una imagen o selecciona un archivo.`}
      >
        {value ? (
          <div className="screenshot-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getScreenshotDisplayUrl(value)}
              alt={label}
            />

            <button
              type="button"
              className="screenshot-remove"
              aria-label={`Eliminar ${label}`}
              title="Eliminar screenshot"
              onClick={handleClear}
              disabled={
                uploading ||
                disabled
              }
            >
              ×
            </button>

            {uploading && (
              <div className="screenshot-status uploading">
                Subiendo...
              </div>
            )}
          </div>
        ) : (
          <div className="screenshot-empty">
            <strong>
              {uploading
                ? "Subiendo screenshot..."
                : "Pega tu screenshot aquí"}
            </strong>

            {!uploading && (
              <>
                <span>
                  Ctrl + V desde TradingView
                </span>

                <span>
                  o arrastra una imagen aquí
                </span>

                <span className="hint">
                  También puedes hacer clic para
                  seleccionar un archivo
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {value && !uploading && (
        <div className="screenshot-actions">
          <span className="screenshot-action-hint">
            Ctrl + V o arrastra otra imagen para
            reemplazarla
          </span>

          <button
            type="button"
            className="screenshot-change-button"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenFilePicker();
            }}
            disabled={
              disabled ||
              uploading
            }
          >
            Reemplazar
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        disabled={
          disabled ||
          uploading
        }
        onChange={(event) => {
          const file =
            event.target.files?.[0];

          if (file) {
            void upload(file);
          }

          event.currentTarget.value =
            "";
        }}
      />
    </div>
  );
}