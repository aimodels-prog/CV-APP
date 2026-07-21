import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, ShieldCheck, ShieldOff, ChevronDown, ChevronUp, ArrowUpAZ, ArrowDownZA } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import ConfirmModal from '../components/ConfirmModal';

export default function Users({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [accessChangeUser, setAccessChangeUser] = useState<any | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const activeColumnMenuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = async () => {
    const data = await api.getUsers();
    setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
    function handleClickOutside(event: MouseEvent) {
      if (activeColumnMenuRef.current && !activeColumnMenuRef.current.contains(event.target as Node)) {
        setActiveColumnMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
          (user.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    
    // Column filters
    for (const [key, value] of Object.entries(columnFilters)) {
      if (!value) continue;
      
      const v = String(value).toLowerCase();
      let userVal = "";
      
      if (key === 'user') userVal = `${user.name || ''} ${user.email || ''}`.toLowerCase();
      else if (key === 'role') userVal = (user.role || '').toLowerCase();
      else if (key === 'status') userVal = (user.status || 'Invited').toLowerCase();
      
      if (!userVal.includes(v)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const mod = direction === 'asc' ? 1 : -1;
    
    let aVal: any = "";
    let bVal: any = "";
    
    if (key === 'user') {
      aVal = a.name || '';
      bVal = b.name || '';
    } else if (key === 'role') {
      aVal = a.role || '';
      bVal = b.role || '';
    } else if (key === 'status') {
      aVal = a.status || 'Invited';
      bVal = b.status || 'Invited';
    } else if (key === 'lastLogin') {
      aVal = new Date(a.lastLogin || 0).getTime();
      bVal = new Date(b.lastLogin || 0).getTime();
    }
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (aVal < bVal) return -1 * mod;
    if (aVal > bVal) return 1 * mod;
    return 0;
  });

  const renderColumnHeader = (id: string, label: string) => (
    <th key={id} className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap relative">
      <div 
        className="flex items-center gap-1 cursor-pointer hover:text-slate-700 select-none"
        onClick={(e) => {
          e.stopPropagation();
          setActiveColumnMenu(activeColumnMenu === id ? null : id);
        }}
      >
        {label} 
        {sortConfig?.key === id ? (
          sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
        ) : (
          <ChevronDown size={12} className="opacity-50" />
        )}
      </div>

      {activeColumnMenu === id && (
        <div 
          ref={activeColumnMenuRef}
          className="absolute left-6 top-10 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-30 font-normal normal-case tracking-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500">Sort</div>
            <button 
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: 'asc' });
                setActiveColumnMenu(null);
              }}
            >
              <ArrowUpAZ size={14} className="text-slate-400" />
              <span>Sort Ascending</span>
            </button>
            <button 
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 rounded-md transition-colors"
              onClick={() => {
                setSortConfig({ key: id, direction: 'desc' });
                setActiveColumnMenu(null);
              }}
            >
              <ArrowDownZA size={14} className="text-slate-400" />
              <span>Sort Descending</span>
            </button>
          </div>
          <div className="h-px bg-slate-100 my-1"></div>
          <div className="p-1 border-t border-slate-100">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500">Filter</div>
            <div className="px-2 pb-2">
              <input 
                type="text" 
                placeholder={`Filter ${label}...`}
                value={columnFilters[id] || ''}
                onChange={(e) => setColumnFilters(prev => ({ ...prev, [id]: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
            {columnFilters[id] && (
               <div className="px-2 pb-2">
                  <button 
                    className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium py-1"
                    onClick={() => setColumnFilters(prev => { const n = {...prev}; delete n[id]; return n; })}
                  >
                    Clear Filter
                  </button>
               </div>
            )}
          </div>
        </div>
      )}
    </th>
  );

  return (
    <div className="space-y-6 max-w-full w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold text-slate-900 mb-1">User Management</h2>
          <p className="text-slate-500 text-sm">Manage access and permissions for your team members</p>
        </div>
        
        <a
          href="https://portal.via-int.com"
          className="flex items-center gap-2 bg-[#004b87] hover:bg-blue-800 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm"
        >
          Manage Access in VIA Portal
        </a>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((visible) => !visible)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
          aria-expanded={showFilters}
        >
          <Filter size={16} />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            value={columnFilters.role || ''}
            onChange={(event) => setColumnFilters((current) => ({ ...current, role: event.target.value }))}
            placeholder="Filter by role..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <input
            type="text"
            value={columnFilters.status || ''}
            onChange={(event) => setColumnFilters((current) => ({ ...current, status: event.target.value }))}
            placeholder="Filter by status..."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="button"
            onClick={() => setColumnFilters({})}
            disabled={Object.keys(columnFilters).length === 0}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Filters
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#fafafa]">
                {renderColumnHeader('user', 'User')}
                {renderColumnHeader('role', 'Role')}
                {renderColumnHeader('status', 'Status')}
                {renderColumnHeader('lastLogin', 'Last Login')}
                <th className="px-6 py-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex items-center justify-center shrink-0">
                          {(user.name || '?').split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        user.status === 'Active' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {user.status || 'Invited'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAccessChangeUser(user)}
                          disabled={user.id === currentUserId}
                          className={clsx(
                            "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                            user.id === currentUserId
                              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                              : user.status === 'Disabled'
                                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                          )}
                          title={user.id === currentUserId ? 'Your active VIA account' : user.status === 'Disabled' ? 'Enable local access' : 'Disable local access'}
                        >
                          {user.id === currentUserId || user.status === 'Disabled' ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                          {user.id === currentUserId ? 'Current User' : user.status === 'Disabled' ? 'Enable' : 'Disable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    No users found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!accessChangeUser}
        title={accessChangeUser?.status === 'Disabled' ? 'Enable Local Access' : 'Disable Local Access'}
        message={accessChangeUser?.status === 'Disabled'
          ? `Allow ${accessChangeUser?.email || 'this user'} to create a new local session when VIA Portal grants access?`
          : `Block ${accessChangeUser?.email || 'this user'} from this application even if VIA Portal grants access?`}
        confirmText={accessChangeUser?.status === 'Disabled' ? 'Enable Access' : 'Disable Access'}
        isDestructive={accessChangeUser?.status !== 'Disabled'}
        onConfirm={async () => {
          if (!accessChangeUser) return;
          await api.updateUser(accessChangeUser.id, {
            status: accessChangeUser.status === 'Disabled' ? 'Active' : 'Disabled',
          });
          setAccessChangeUser(null);
          await fetchUsers();
        }}
        onCancel={() => setAccessChangeUser(null)}
      />
    </div>
  );
}
