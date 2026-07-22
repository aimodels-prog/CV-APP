import React, { useState, useEffect } from "react";
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';

interface BrandingModalProps {
  tender: any;
  onClose: () => void;
  onSave: () => void;
}

export function BrandingModal({ tender, onClose, onSave }: BrandingModalProps) {
  const [branding, setBranding] = useState(tender.branding || {
    header_base64: "",
    footer_base64: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [brandings, setBrandings] = useState<any[]>([]);
  const [selectedBrandingId, setSelectedBrandingId] = useState<string>('');

  useEffect(() => {
    async function load() {
      const data = await api.getBrandings();
      setBrandings(data);
      
      // Try to match current tender branding with existing branding profiles
      if (tender.branding?.header_base64 || tender.branding?.footer_base64) {
        const match = data.find((b: any) => b.header_base64 === tender.branding.header_base64 && b.footer_base64 === tender.branding.footer_base64);
        if (match) {
          setSelectedBrandingId(match.id);
        }
      }
    }
    load();
  }, [tender]);

  const handleSelectBranding = (id: string) => {
    setSelectedBrandingId(id);
    const match = brandings.find(b => b.id === id);
    if (match) {
      setBranding({ header_base64: match.header_base64, footer_base64: match.footer_base64 });
    } else {
      setBranding({ header_base64: "", footer_base64: "" });
    }
  };

  const handleBrandingImage = (
    field: 'header_base64' | 'footer_base64',
    file?: File,
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setBranding((current: any) => ({
        ...current,
        [field]: reader.result as string,
      }));
      setSelectedBrandingId('');
    };
    reader.readAsDataURL(file);
  };

  const removeBrandingImage = (field: 'header_base64' | 'footer_base64') => {
    setBranding((current: any) => ({ ...current, [field]: '' }));
    setSelectedBrandingId('');
  };


  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateTenderBranding(tender.id, branding);
      onSave();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save branding settings: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 sm:p-6">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Technical Output Branding</h2>
            <p className="text-sm text-slate-500 mt-0.5">Tender: {tender.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        
        <div className="p-6 space-y-6 overflow-y-auto">
          <section className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800">Select Visual Identity</h4>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">Saved Branding Profiles</label>
              <select
                value={selectedBrandingId}
                onChange={(e) => handleSelectBranding(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
              >
                <option value="">-- Select a branding profile --</option>
                {brandings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">You can create new branding profiles in Settings.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">Header</label>
                <div className="relative aspect-[4/1] bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                  {branding.header_base64 ? (
                    <img src={branding.header_base64} className="w-full h-full object-contain p-2" alt="Tender header preview" />
                  ) : (
                    <span className="text-xs text-slate-400">No header selected</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100">
                    <ImageIcon size={14} />
                    {branding.header_base64 ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(event) => handleBrandingImage('header_base64', event.target.files?.[0])}
                    />
                  </label>
                  {branding.header_base64 && (
                    <button
                      type="button"
                      onClick={() => removeBrandingImage('header_base64')}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Recommended: 1800 × 250 px</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">Footer</label>
                <div className="relative aspect-[4/1] bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                  {branding.footer_base64 ? (
                    <img src={branding.footer_base64} className="w-full h-full object-contain p-2" alt="Tender footer preview" />
                  ) : (
                    <span className="text-xs text-slate-400">No footer selected</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100">
                    <ImageIcon size={14} />
                    {branding.footer_base64 ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(event) => handleBrandingImage('footer_base64', event.target.files?.[0])}
                    />
                  </label>
                  {branding.footer_base64 && (
                    <button
                      type="button"
                      onClick={() => removeBrandingImage('footer_base64')}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Recommended: 1800 × 180 px</p>
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 rounded-b-xl">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
             <span className="text-sm font-medium text-slate-600">Settings will persist globally</span>
           </div>
           <div className="flex items-center gap-3">
             <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors shadow-sm">
                Cancel
             </button>
             <button 
               onClick={handleSave}
               disabled={isSaving}
               className="px-5 py-2.5 bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-colors shadow-sm flex items-center gap-2"
             >
               {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
               {isSaving ? "Syncing..." : "Apply Global Branding"}
             </button>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
