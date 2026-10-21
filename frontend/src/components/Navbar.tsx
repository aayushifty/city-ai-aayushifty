import React from 'react';
import { 
  Layers, 
  Terminal, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  BookOpen, 
  CheckSquare, 
  Settings, 
  AlertOctagon, 
  PlusCircle,
  Building2 
} from 'lucide-react';
import { Project } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (proj: Project) => void;
  onNewProject: () => void;
  isEmergencyStopped: boolean;
  onToggleEmergencyStop: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  projects,
  selectedProject,
  onSelectProject,
  onNewProject,
  isEmergencyStopped,
  onToggleEmergencyStop
}) => {
  const tabs = [
    { id: 'city3d', label: '3D Agent City', icon: Building2 },
    { id: 'dashboard', label: 'Dashboard', icon: Layers },
    { id: 'workspace', label: 'Workspace & DAG', icon: Terminal },
    { id: 'agents', label: 'Agent Monitor', icon: Cpu },
    { id: 'timeline', label: 'Timeline', icon: Activity },
    { id: 'verification', label: 'Verification Center', icon: ShieldCheck },
    { id: 'memory', label: 'Project Memory', icon: BookOpen },
    { id: 'approvals', label: 'Approvals', icon: CheckSquare },
    { id: 'models', label: 'Model Router', icon: Settings },
  ];

  return (
    <header className="border-b border-[#1E293B] bg-[#0A0E17]/90 backdrop-blur sticky top-0 z-50 px-3 md:px-6 py-2 md:py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      {/* Brand & Project Selector */}
      <div className="flex items-center gap-3 md:gap-6 min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            C
          </div>
          <div className="hidden sm:block">
            <div className="text-base font-bold tracking-wider text-slate-100 flex items-center gap-2">
              city_ai_aayushifty
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                METROPOLIS
              </span>
            </div>
            <div className="hidden sm:block text-xs text-slate-500 font-mono">AUTONOMOUS 3D AI NATION</div>
          </div>
        </div>

        {/* Project Selector dropdown */}
        <div className="flex items-center gap-2 pl-3 md:pl-4 border-l border-slate-800 min-w-0">
          <select 
            aria-label="Active Project"
            className="bg-[#121824] border border-[#1E293B] text-slate-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 min-w-0 max-w-[150px] md:max-w-none"
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const p = projects.find(x => x.id === e.target.value);
              if (p) onSelectProject(p);
            }}
          >
            {projects.length === 0 && <option value="">No Projects Created</option>}
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
            ))}
          </select>

          <button 
            onClick={onNewProject}
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded transition border border-slate-700"
            title="Create New Project"
          >
            <PlusCircle size={14} className="text-blue-400" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 order-last xl:order-none w-full xl:w-auto overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition ${
                isActive 
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/40 shadow-sm shadow-blue-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global Emergency Stop Action */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleEmergencyStop}
          title={isEmergencyStopped ? 'System halted: click to resume' : 'Global stop'}
          className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded transition ${
            isEmergencyStopped 
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/50 animate-pulse'
              : 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30'
          }`}
        >
          <AlertOctagon size={16} />
          <span className="hidden sm:inline">{isEmergencyStopped ? 'SYSTEM HALTED' : 'GLOBAL STOP'}</span>
        </button>
      </div>
    </header>
  );
};
