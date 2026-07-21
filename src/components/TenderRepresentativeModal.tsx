import React, { useRef, useState } from "react";
import { Calendar, Loader2, PenLine, Trash2, Upload, X } from "lucide-react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { TenderRepresentativeSettings } from "../lib/certificationSettings";

interface TenderRepresentativeModalProps {
  tender: any;
  onClose: () => void;
  onSave: () => void;
}

const localToday = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export function TenderRepresentativeModal({
  tender,
  onClose,
  onSave,
}: TenderRepresentativeModalProps) {
  const existing = tender.representativeSignatureSettings || {};
  const [repName, setRepName] = useState(existing.repName || "");
  const [repSignatureBase64, setRepSignatureBase64] = useState(
    existing.repSignatureBase64 || "",
  );
  const [repSignatureDate, setRepSignatureDate] = useState(
    existing.repSignatureDate || localToday(),
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const handleSignatureUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Please upload a PNG or JPEG signature image.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRepSignatureBase64(String(reader.result || ""));
      setError("");
    };
    reader.onerror = () => setError("The signature image could not be read.");
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!repName.trim() || !repSignatureDate) {
      setError("Representative name and signature date are required.");
      return;
    }

    const settings: TenderRepresentativeSettings = {
      repName: repName.trim(),
      repSignatureBase64,
      repSignatureDate,
    };

    setIsSaving(true);
    try {
      await api.updateTenderRepresentativeSettings(tender.id, settings);
      onSave();
      onClose();
    } catch (saveError) {
      console.error(saveError);
      setError("Failed to save representative signature settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Representative Signature Settings
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Tender: {tender.name || tender.tender_title || "Untitled Tender"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Authorized Representative Name
            </label>
            <input
              value={repName}
              onChange={(event) => setRepName(event.target.value)}
              placeholder="Enter representative's full name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Authorized Representative Signature
            </label>
            <div className="flex min-h-20 items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {repSignatureBase64 ? (
                <img
                  src={repSignatureBase64}
                  alt="Authorized representative signature"
                  className="h-14 max-w-56 object-contain"
                />
              ) : (
                <div className="flex h-14 w-36 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
                  <PenLine size={22} />
                </div>
              )}
              <button
                onClick={() => signatureInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"
              >
                <Upload size={14} /> Upload PNG/JPEG
              </button>
              {repSignatureBase64 && (
                <button
                  onClick={() => setRepSignatureBase64("")}
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  title="Remove signature"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleSignatureUpload}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Authorized Representative Signature Date
            </label>
            <div className="relative">
              <Calendar
                size={16}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                type="date"
                value={repSignatureDate}
                onChange={(event) => setRepSignatureDate(event.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700">
            These values will be copied into every new CV generated for this
            tender. Existing CVs remain unchanged.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !repName.trim() || !repSignatureDate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Save Settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}
