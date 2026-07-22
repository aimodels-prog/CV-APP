import React, { useState, useEffect } from 'react';
import { Image,  
  User,
  Users,
  ShieldCheck,
  Globe,
  Plus,
  XCircle,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Save,
  Folder,
  LayoutDashboard
} from 'lucide-react';
import { api } from '../lib/api';
import { useReferenceData } from '../lib/ReferenceDataContext';
import UsersComponent from './Users';
import { useSearchParams } from 'react-router-dom';

export default function Settings() {
  const { values } = useReferenceData();
  const moduleOptions = values('app_module');
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const isAdmin = currentUser?.localRole === 'ADMIN';
  const [folderId, setFolderId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [brandings, setBrandings] = useState<any[]>([]);
  const [newBranding, setNewBranding] = useState({ name: '', header_base64: '', footer_base64: '' });
  
  const loadBrandings = async () => {
    const data = await api.getBrandings();
    setBrandings(data);
  };
  
  const handleCreateBranding = async () => {
    if (!newBranding.name) return;
    await api.createBranding(newBranding);
    setNewBranding({ name: '', header_base64: '', footer_base64: '' });
    loadBrandings();
  };

  const handleDeleteBranding = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this branding?")) {
      await api.deleteBranding(id);
      loadBrandings();
    }
  };

  const [loading, setLoading] = useState(true);
  const [taxonomy, setTaxonomy] = useState<string[]>([]);
  const [newTaxonomy, setNewTaxonomy] = useState('');
  
  const [hiddenModules, setHiddenModules] = useState<string[]>(['matches', 'generated-cvs']);

  useEffect(() => {
    async function load() {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
      if (user.localRole !== 'ADMIN') {
        setActiveTab('profile');
        setLoading(false);
        return;
      }

      const [config, tax, savedModules] = await Promise.all([
        api.getGoogleDriveSettings(),
        api.getTaxonomy(),
        api.getAppSetting('hidden-modules', ['matches', 'generated-cvs']),
        loadBrandings(),
      ]);
      if (config) {
        setFolderId(config.folderId || '');
        setApiKey(config.apiKey ? '***' : '');
      }
      setTaxonomy(tax);
      if (Array.isArray(savedModules)) setHiddenModules(savedModules);
      setLoading(false);
    }
    void load();
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'data-backup') {
      setActiveTab('profile');
      return;
    }
    const adminTabs = new Set(['taxonomy', 'users', 'branding', 'integrations', 'modules']);
    if (tab && (!adminTabs.has(tab) || isAdmin)) {
      setActiveTab(tab);
    } else if (tab && currentUser) {
      setActiveTab('profile');
    }
  }, [searchParams, isAdmin, currentUser]);

  const handleSaveIntegration = async () => {
    const config = await api.getGoogleDriveSettings();
    const newConfig = {
      folderId,
      apiKey: apiKey === '***' ? config.apiKey : apiKey
    };
    await api.saveGoogleDriveSettings(newConfig);

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleSaveTaxonomy = async () => {
    await api.saveTaxonomy(taxonomy);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddTaxonomy = () => {
    if (newTaxonomy.trim() && !taxonomy.includes(newTaxonomy.trim())) {
      setTaxonomy([...taxonomy, newTaxonomy.trim()]);
      setNewTaxonomy('');
    }
  };

  const removeTaxonomy = (index: number) => {
    setTaxonomy(taxonomy.filter((_, i) => i !== index));
  };

  const toggleModule = async (moduleName: string) => {
    const next = hiddenModules.includes(moduleName)
      ? hiddenModules.filter(m => m !== moduleName)
      : [...hiddenModules, moduleName];
      
    setHiddenModules(next);
    await api.saveAppSetting('hidden-modules', next);
    window.dispatchEvent(new Event('settingsUpdated'));
  };

  return (
    <div className="space-y-6 max-w-full w-full mx-auto pb-32">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your account and system preferences</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 mt-8">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Settings</h3>
            </div>
            <div className="p-2 space-y-1">
              <button 
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'profile' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <User size={16} />
                My Account
              </button>
              {isAdmin && (
                <>
              <button 
                onClick={() => setActiveTab('taxonomy')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'taxonomy' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Folder size={16} />
                Taxonomy
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'users' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users size={16} />
                Users
              </button>
              
              <button 
                onClick={() => setActiveTab('branding')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'branding' 
                    ? 'bg-[#2563eb]/10 text-[#2563eb]' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Image size={18} />
                Branding Profiles
              </button>

              <button 
                onClick={() => setActiveTab('integrations')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'integrations' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Globe size={16} />
                Integrations
              </button>
              <button 
                onClick={() => setActiveTab('modules')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'modules' 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard size={16} />
                Modules
              </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {isAdmin && activeTab === 'modules' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Feature Modules</h3>
                  <p className="text-sm text-slate-500 mt-1">Control which application modules are visible and accessible.</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {moduleOptions.map(module => {
                  const moduleId = String(module.metadata?.route || '').replace(/^\//, '') || module.code.toLowerCase();
                  const isVisible = !hiddenModules.includes(moduleId);
                  return (
                    <div key={module.code} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{module.label}</p>
                        <p className="text-sm text-slate-500">{module.metadata?.description || module.description}</p>
                      </div>
                      <button
                        onClick={() => void toggleModule(moduleId)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}
                      >
                        <span className="sr-only">Toggle {module.label}</span>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isVisible ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          
          {isAdmin && activeTab === 'branding' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Branding Profiles</h3>
                  <p className="text-sm text-slate-500 mt-1">Manage header and footer branding for generated CVs</p>
                </div>
              </div>
              
               <div className="max-w-3xl space-y-8">
                 {/* Add new branding */}
                 <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-4">
                   <h4 className="text-sm font-semibold text-slate-800">Add New Branding</h4>
                   <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                     <p className="text-sm font-semibold text-blue-900">Perfect PDF image sizes</p>
                     <div className="mt-2 text-xs text-blue-900">
                       <p>Header: 1800 × 250 px</p>
                       <p>Footer: 1800 × 120 px</p>
                     </div>
                     <p className="mt-2 text-xs text-blue-800">
                       Use PNG or JPEG. Exact sizes fill the available area; other sizes are centered and scaled without stretching or cropping.
                     </p>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Branding Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Acme Corp Default"
                        value={newBranding.name}
                        onChange={e => setNewBranding({...newBranding, name: e.target.value})}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Header Image</label>
                      <label className="cursor-pointer flex flex-col items-center justify-center h-32 bg-white border-2 border-dashed border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                        {newBranding.header_base64 ? (
                          <img src={newBranding.header_base64} className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="text-center text-slate-500">
                            <Image size={24} className="mx-auto mb-1 opacity-50" />
                            <span className="text-xs font-medium">Upload Header</span>
                          </div>
                        )}
                         <input 
                           type="file" 
                           accept="image/png,image/jpeg" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setNewBranding({...newBranding, header_base64: reader.result as string});
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                       </label>
                       <p className="text-xs text-slate-500">Recommended size: 1800 × 250 px</p>
                       {newBranding.header_base64 && (
                        <button onClick={() => setNewBranding({...newBranding, header_base64: ''})} className="text-xs text-red-500 hover:underline mt-1">Remove Header</button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Footer Image</label>
                      <label className="cursor-pointer flex flex-col items-center justify-center h-32 bg-white border-2 border-dashed border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                        {newBranding.footer_base64 ? (
                          <img src={newBranding.footer_base64} className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="text-center text-slate-500">
                            <Image size={24} className="mx-auto mb-1 opacity-50" />
                            <span className="text-xs font-medium">Upload Footer</span>
                          </div>
                        )}
                         <input 
                           type="file" 
                           accept="image/png,image/jpeg" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setNewBranding({...newBranding, footer_base64: reader.result as string});
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                       </label>
                       <p className="text-xs text-slate-500">Recommended size: 1800 × 120 px</p>
                       {newBranding.footer_base64 && (
                        <button onClick={() => setNewBranding({...newBranding, footer_base64: ''})} className="text-xs text-red-500 hover:underline mt-1">Remove Footer</button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={handleCreateBranding}
                      disabled={!newBranding.name}
                      className="px-4 py-2 bg-[#2563eb] hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Save Branding
                    </button>
                  </div>
                </div>

                {/* List existing brandings */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-800">Saved Brandings</h4>
                  {brandings.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                      No brandings saved yet.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {brandings.map(b => (
                        <div key={b.id} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="font-semibold text-slate-900">{b.name}</h5>
                              <button onClick={() => handleDeleteBranding(b.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors">
                                <XCircle size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4 h-24">
                              <div className="bg-slate-50 border border-slate-100 rounded flex items-center justify-center p-2 relative group">
                                {b.header_base64 ? (
                                  <img src={b.header_base64} className="max-w-full max-h-full object-contain" />
                                ) : (
                                  <span className="text-xs text-slate-400">No header</span>
                                )}
                              </div>
                              <div className="bg-slate-50 border border-slate-100 rounded flex items-center justify-center p-2 relative group">
                                {b.footer_base64 ? (
                                  <img src={b.footer_base64} className="max-w-full max-h-full object-contain" />
                                ) : (
                                  <span className="text-xs text-slate-400">No footer</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isAdmin && activeTab === 'users' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-hidden">
               <UsersComponent currentUserId={currentUser?.id} />
            </div>
          )}

          {isAdmin && activeTab === 'integrations' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Google Drive Integration</h3>
                  <p className="text-sm text-slate-500 mt-1">Configure Google Drive settings for automated CV ingestion</p>
                </div>
                <button 
                  onClick={handleSaveIntegration}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  {isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  {isSaved ? 'Saved' : 'Save Configuration'}
                </button>
              </div>

              {!loading && (
                <div className="space-y-8">
                  <div className="space-y-4 max-w-2xl">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Google Drive Folder ID</label>
                      <input 
                        type="text" 
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                        placeholder="e.g. 1BxiMVs0XRY5nArticleVn..."
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <p className="text-xs text-slate-500 mt-1.5">
                        The ID from your Google Drive folder URL. Make sure the folder is accessible.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Google Drive API Key</label>
                      <textarea 
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Paste a Google Drive API key..."
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors font-mono min-h-[100px]"
                      />
                      <div className="mt-2 text-sm">
                        <details className="group border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                          <summary className="cursor-pointer px-4 py-2 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors list-none flex justify-between items-center">
                            How to get this?
                            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                          </summary>
                          <div className="p-4 space-y-4 text-slate-600 text-xs">
                            <div>
                              <h4 className="font-bold text-slate-800 mb-1">API Key for a read-only shared folder</h4>
                              <ol className="list-decimal list-inside space-y-1 ml-1">
                                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a>.</li>
                                <li>Enable the <strong>Google Drive API</strong>.</li>
                                <li>Go to <strong>Credentials</strong> &gt; <strong>Create Credentials</strong> &gt; <strong>API Key</strong>.</li>
                                <li>Ensure your Google Drive folder's sharing settings are set to <strong>"Anyone with the link can view"</strong>.</li>
                              </ol>
                            </div>
                            <p>Restrict the key to the Google Drive API and this application domain. The current integration supports API-key access to a read-only shared folder; it does not accept service-account JSON.</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isAdmin && activeTab === 'taxonomy' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Taxonomy Management</h3>
                  <p className="text-sm text-slate-500 mt-1">Configure global standard disciplines mapped during AI processing</p>
                </div>
                <button 
                  onClick={handleSaveTaxonomy}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  {isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  {isSaved ? 'Saved' : 'Save Configuration'}
                </button>
              </div>

              {!loading && (
                <div className="max-w-3xl space-y-6">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-4">
                     <input 
                       type="text"
                       value={newTaxonomy}
                       onChange={e => setNewTaxonomy(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleAddTaxonomy()}
                       placeholder="Add new primary position format..."
                       className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
                     />
                     <button onClick={handleAddTaxonomy} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2">
                        <Plus size={16} /> Add Position
                     </button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                     {taxonomy.map((tax, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm px-4 py-2.5 rounded-lg group">
                           <span className="text-sm font-semibold text-slate-700 uppercase tracking-tight">{tax}</span>
                           <button onClick={() => removeTaxonomy(idx)} className="text-slate-400 hover:text-red-500 transition-colors ml-2">
                              <XCircle size={16} />
                           </button>
                        </div>
                     ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">My Account</h3>
                  <p className="text-sm text-slate-500 mt-1">Your identity and access are managed by VIA Portal and Google Workspace.</p>
                </div>
              </div>
              <div className="max-w-2xl space-y-5">
                <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold uppercase text-blue-700">
                    {(currentUser?.name || 'VIA User').split(' ').map((part: string) => part[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{currentUser?.name || 'Loading VIA identity...'}</p>
                    <p className="truncate text-sm text-slate-500">{currentUser?.email || ''}</p>
                    <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                      {currentUser?.localRole === 'ADMIN' ? 'Administrator' : 'Staff'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 rounded-lg border border-blue-100 bg-blue-50 p-5">
                  <ShieldCheck className="mt-0.5 shrink-0 text-blue-700" size={22} />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Managed by VIA Portal</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Authentication, passwords, application access, and identity details are controlled through VIA Google Workspace. This application never receives or stores your Google password.
                    </p>
                    <a href="https://portal.via-int.com" className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800">
                      Open VIA Portal
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
