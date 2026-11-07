"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { translate } from "@/i18n/runtime";

const PLACEHOLDER = `{
  "zcodejwttoken": "enc:v1:...",
  "oauth:zai:user_info": "enc:v1:..."
}
// Atau format sederhana:
// { "token": "eyJhbGci...", "email": "user@example.com" }
// Atau array [...] untuk banyak akun`;

export default function BulkImportZcodeModal({ isOpen, onClose, onSuccess }) {
  const [jsonText, setJsonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectMsg, setAutoDetectMsg] = useState("");
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState(null);

  const handleClose = () => {
    if (submitting) return;
    setJsonText("");
    setParseError("");
    setAutoDetectMsg("");
    setResult(null);
    onClose();
  };

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    setAutoDetectMsg("");
    setParseError("");
    try {
      const res = await fetch("/api/oauth/zcode/auto-import");
      const data = await res.json();
      if (data.found && data.accounts && data.accounts.length > 0) {
        setAutoDetectMsg(`✓ Ditemukan file lokal di ${data.path} (${data.count} akun)`);
        setJsonText(JSON.stringify(data.accounts, null, 2));
      } else {
        setAutoDetectMsg(data.error || "File ~/.zcode/v2/credentials.json tidak ditemukan.");
      }
    } catch (err) {
      setAutoDetectMsg(`Gagal mendeteksi: ${err.message}`);
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleSubmit = async () => {
    setParseError("");
    setResult(null);

    const trimmed = jsonText.trim();
    if (!trimmed) {
      setParseError(translate("Please paste JSON credentials first"));
      return;
    }

    try {
      JSON.parse(trimmed);
    } catch (err) {
      setParseError(`${translate("Invalid JSON")}: ${err.message}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/oauth/zcode/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonText: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data?.error || `Request failed: ${res.status}`);
        return;
      }
      setResult(data);
      if (data.success > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setParseError(err.message || translate("Request failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const failedItems = result?.results?.filter((r) => !r.ok) || [];

  return (
    <Modal
      isOpen={isOpen}
      title={translate("Import ZCode Credentials (JSON)")}
      onClose={handleClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            {translate(
              "Tempel JSON credentials dari ~/.zcode/v2/credentials.json atau format { token: '...' }."
            )}
          </p>
          <Button
            size="xs"
            variant="secondary"
            icon="auto_awesome"
            onClick={handleAutoDetect}
            disabled={autoDetecting || submitting}
          >
            {autoDetecting ? "Mencari..." : "Deteksi ~/.zcode"}
          </Button>
        </div>

        {autoDetectMsg && (
          <p
            className={`text-xs ${
              autoDetectMsg.startsWith("✓") ? "text-green-400" : "text-amber-400"
            }`}
          >
            {autoDetectMsg}
          </p>
        )}

        <textarea
          className="w-full rounded border border-accent/30 bg-sidebar p-2 text-sm font-mono resize-y min-h-[220px] focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={PLACEHOLDER}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          disabled={submitting}
        />

        {parseError && (
          <p className="text-xs text-red-500 break-words">{parseError}</p>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            <div
              className={`text-sm font-medium ${
                result.failed > 0 ? "text-yellow-400" : "text-green-400"
              }`}
            >
              ✓ {result.success} {translate("added")}
              {result.failed > 0 ? `, ✗ ${result.failed} ${translate("failed")}` : ""}
            </div>
            {failedItems.length > 0 && (
              <ul className="rounded border border-accent/20 bg-sidebar/50 p-2 text-xs font-mono max-h-40 overflow-y-auto">
                {failedItems.map((item) => (
                  <li key={item.index} className="text-red-400">
                    [{item.index}] {item.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={submitting || !jsonText.trim()}
          >
            {submitting ? translate("Importing...") : translate("Import Credentials")}
          </Button>
          <Button
            onClick={handleClose}
            variant="ghost"
            fullWidth
            disabled={submitting}
          >
            {translate("Close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

BulkImportZcodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};
