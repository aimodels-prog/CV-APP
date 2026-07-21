import React, { useEffect, useRef, useState } from "react";
import { X, Upload, Trash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CertificationSettings {
  show: boolean;
  expertSignatureBase64?: string;
  expertSignatureDate?: string;
  repName?: string;
  repSignatureBase64?: string;
  repSignatureDate?: string;
}

interface CertificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CertificationSettings | undefined;
  onSave: (settings: CertificationSettings) => void;
  expertName: string;
}

export default function CertificationModal({ isOpen, onClose, settings, onSave, expertName }: CertificationModalProps) {
  const today = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
  };

  const [show, setShow] = useState(settings?.show !== false);
  const [repName, setRepName] = useState(settings?.repName || "");
  const [expertSig, setExpertSig] = useState(settings?.expertSignatureBase64 || "");
  const [repSig, setRepSig] = useState(settings?.repSignatureBase64 || "");
  const [expertDate, setExpertDate] = useState(settings?.expertSignatureDate || today());
  const [repDate, setRepDate] = useState(settings?.repSignatureDate || today());
  const [uploadError, setUploadError] = useState("");

  const expertInputRef = useRef<HTMLInputElement>(null);
  const repInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setShow(settings?.show !== false);
    setRepName(settings?.repName || "");
    setExpertSig(settings?.expertSignatureBase64 || "");
    setRepSig(settings?.repSignatureBase64 || "");
    setExpertDate(settings?.expertSignatureDate || today());
    setRepDate(settings?.repSignatureDate || today());
    setUploadError("");
  }, [isOpen, settings]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (s: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        setUploadError("Please upload a PNG or JPEG signature image.");
        e.target.value = "";
        return;
      }

      setUploadError("");
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.onerror = () => setUploadError("The signature image could not be read.");
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (show && (!expertDate || !repDate)) return;

    onSave({
      show,
      repName,
      expertSignatureBase64: expertSig,
      expertSignatureDate: expertDate,
      repSignatureBase64: repSig,
      repSignatureDate: repDate,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg bg-white rounded-xl shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Certification Settings</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
              <span className="font-semibold text-sm text-slate-700">Include Certification Section</span>
            </label>
            
            {show && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Expert Signature</label>
                  <p className="text-xs text-slate-500 mb-2">For: {expertName}</p>
                  <div className="flex items-center gap-4">
                    {expertSig && <img src={expertSig} alt="Expert Signature" className="h-12 border border-slate-200 rounded bg-white px-2 py-1" />}
                    <button onClick={() => expertInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded hover:bg-slate-200">
                      <Upload size={14} /> Upload Image
                    </button>
                    {expertSig && (
                      <button onClick={() => setExpertSig("")} className="text-red-500 hover:bg-red-50 p-1.5 rounded">
                        <Trash size={16} />
                      </button>
                    )}
                    <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" ref={expertInputRef} className="hidden" onChange={(e) => handleFileUpload(e, setExpertSig)} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Expert Signature Date</label>
                  <input type="date" required value={expertDate} onChange={(e) => setExpertDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Authorized Representative Name</label>
                  <input type="text" value={repName} onChange={(e) => setRepName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter representative's name" />
                  <p className="text-xs text-slate-500 mt-1">Saved with this generated CV, so it can vary by tender or submission.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Authorized Representative Signature</label>
                  <div className="flex items-center gap-4">
                    {repSig && <img src={repSig} alt="Rep Signature" className="h-12 border border-slate-200 rounded bg-white px-2 py-1" />}
                    <button onClick={() => repInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded hover:bg-slate-200">
                      <Upload size={14} /> Upload Image
                    </button>
                    {repSig && (
                      <button onClick={() => setRepSig("")} className="text-red-500 hover:bg-red-50 p-1.5 rounded">
                        <Trash size={16} />
                      </button>
                    )}
                    <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" ref={repInputRef} className="hidden" onChange={(e) => handleFileUpload(e, setRepSig)} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Authorized Representative Signature Date</label>
                  <input type="date" required value={repDate} onChange={(e) => setRepDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
              </div>
            )}
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={show && (!expertDate || !repDate)} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg">Save Settings</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
