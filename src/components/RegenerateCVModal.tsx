import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, RefreshCw, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { resolveOutputBranding } from '../lib/outputBranding';

interface RegenerateCVModalProps {
  cv: any;
  onClose: () => void;
  onRegenerate: (cvId: string, customBranding?: any) => Promise<void>;
}

export function RegenerateCVModal({ cv, onClose, onRegenerate }: RegenerateCVModalProps) {
  const [branding, setBranding] = useState({
    header_base64: "",
    footer_base64: ""
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  
  const [brandings, setBrandings] = useState<any[]>([]);
  const [selectedBrandingId, setSelectedBrandingId] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const [tender, allBrandings] = await Promise.all([
          api.getTender(cv.tenderId),
          api.getBrandings()
        ]);
        
        setBrandings(allBrandings);
        
        const currentBranding = resolveOutputBranding(cv.customBranding, tender?.branding);
        const currentHeader = currentBranding?.header_base64 || '';
        const currentFooter = currentBranding?.footer_base64 || '';
        
        setBranding({
          profile_id: currentBranding?.profile_id,
          profile_name: currentBranding?.profile_name,
          header_base64: currentHeader,
          footer_base64: currentFooter
        });
        
        if (currentHeader || currentFooter) {
          const currentProfileId = currentBranding?.profile_id;
          const match = allBrandings.find((b: any) =>
            b.id === currentProfileId ||
            (b.header_base64 === currentHeader && b.footer_base64 === currentFooter),
          );
          if (match) {
            setSelectedBrandingId(match.id);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [cv]);

  const handleSelectBranding = (id: string) => {
    setSelectedBrandingId(id);
    const match = brandings.find(b => b.id === id);
    if (match) {
      setBranding({
        profile_id: match.id,
        profile_name: match.name,
        header_base64: match.header_base64,
        footer_base64: match.footer_base64,
      });
    } else {
      setBranding({ header_base64: "", footer_base64: "" });
    }
  };


  
  const handleConfirm = async () => {
    setIsGenerating(true);
    await onRegenerate(cv.id, branding);
    setIsGenerating(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 20 }} 
        className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Regenerate CV</h3>
            <p className="text-sm text-slate-500 font-medium">Customize branding for this specific CV (Optional)</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-8 space-y-8">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : (
            
            <section className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">Select Branding Profile</label>
                <select
                  value={selectedBrandingId}
                  onChange={(e) => handleSelectBranding(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none shadow-sm"
                >
                  <option value="">-- Use default or no branding --</option>
                  {brandings.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1 pl-1">You can create new branding profiles in Settings.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 block">Header Preview</label>
                  <div className="relative aspect-[4/1] bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                    {branding.header_base64 ? (
                      <img src={branding.header_base64} className="w-full h-full object-contain p-2" />
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">No header</span>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 block">Footer Preview</label>
                  <div className="relative aspect-[4/1] bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                    {branding.footer_base64 ? (
                      <img src={branding.footer_base64} className="w-full h-full object-contain p-2" />
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">No footer</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-3">
           <button 
             onClick={onClose}
             disabled={isGenerating}
             className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-xl transition-all"
           >
             Cancel
           </button>
           <button 
             onClick={handleConfirm}
             disabled={isGenerating || loading}
             className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all shadow-sm flex items-center gap-2"
           >
             {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
             {isGenerating ? "Regenerating..." : "Regenerate CV"}
           </button>
        </div>
      </motion.div>
    </div>
  );
}
