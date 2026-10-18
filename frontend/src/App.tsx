import React, { useState, useEffect } from 'react';
import { api } from './api/client';
import { Project, Task, ApprovalRequest, ProjectMemoryEntry, ForgeTelemetryEvent } from './types';
import { Navbar } from './components/Navbar';
import { GlobalStopBanner } from './components/GlobalStopBanner';
import { DashboardView } from './components/DashboardView';
import { WorkspaceView } from './components/WorkspaceView';
import { AgentMonitorView } from './components/AgentMonitorView';
import { ExecutionTimelineView } from './components/ExecutionTimelineView';
import { VerificationCenterView } from './components/VerificationCenterView';
import { ApprovalCenterView } from './components/ApprovalCenterView';
import { ProjectMemoryView } from './components/ProjectMemoryView';
import { ModelConfigView } from './components/ModelConfigView';

import { CitySimulationView } from './components/CitySimulationView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('city3d');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<ProjectMemoryEntry[]>([]);
  const [events, setEvents] = useState<ForgeTelemetryEvent[]>([]);
  const [isEmergencyStopped, setIsEmergencyStopped] = useState<boolean>(false);

  // Load initial projects
  const loadProjects = async () => {
    try {
      const projs = await api.listProjects();
      setProjects(projs);
      if (projs.length > 0 && !selectedProject) {
        setSelectedProject(projs[0]);
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  };

  // Load project details (tasks, approvals, memory)
  const loadProjectDetails = async (projectId: string) => {
    try {
      const [tList, aList, mList, bStatus] = await Promise.all([
        api.listTasks(projectId),
        api.listApprovals(projectId),
        api.getMemory(projectId),
        api.getBudget(projectId)
      ]);
      setTasks(tList);
      setApprovals(aList);
      setMemoryEntries(mList);
      setIsEmergencyStopped(bStatus.is_emergency_stopped);
    } catch (e) {
      console.error('Failed to load project details', e);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectDetails(selectedProject.id);
      const interval = setInterval(() => {
        loadProjectDetails(selectedProject.id);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedProject?.id]);

  // Connect WebSocket for live telemetry
  useEffect(() => {
    let ws: WebSocket;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (msg) => {
        try {
          const ev: ForgeTelemetryEvent = JSON.parse(msg.data);
          setEvents((prev) => [...prev, ev]);
          if (selectedProject) {
            loadProjectDetails(selectedProject.id);
          }
        } catch (err) {
          // parse error
        }
      };
    } catch (e) {
      console.warn('WebSocket connection not active', e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [selectedProject?.id]);

  // Handlers
  const handleLaunchNewProject = async (name: string, description: string, budget: number) => {
    try {
      const newProj = await api.createProject(name, description, budget);
      setProjects((prev) => [newProj, ...prev]);
      setSelectedProject(newProj);
      setActiveTab('workspace');
      // Automatically kick off pipeline
      await api.startAutonomousPipeline(newProj.id);
    } catch (err) {
      alert(`Error launching project: ${err}`);
    }
  };

  const handleStartPipeline = async (projectId: string) => {
    try {
      await api.startAutonomousPipeline(projectId);
      setActiveTab('workspace');
    } catch (err) {
      alert(`Error starting pipeline: ${err}`);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      await api.retryTask(taskId);
      if (selectedProject) loadProjectDetails(selectedProject.id);
    } catch (err) {
      alert(`Error retrying task: ${err}`);
    }
  };

  const handleDecideApproval = async (approvalId: string, approved: boolean, note?: string) => {
    try {
      await api.decideApproval(approvalId, approved, note);
      if (selectedProject) loadProjectDetails(selectedProject.id);
    } catch (err) {
      alert(`Error deciding approval: ${err}`);
    }
  };

  const handleToggleEmergencyStop = async () => {
    try {
      const nextState = !isEmergencyStopped;
      await api.toggleEmergencyStop(nextState);
      setIsEmergencyStopped(nextState);
    } catch (err) {
      alert(`Failed to toggle stop: ${err}`);
    }
  };

  return (
    <div className={`${activeTab === 'city3d' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-[#080B11] text-slate-100 flex flex-col font-sans`}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={(p) => setSelectedProject(p)}
        onNewProject={() => setActiveTab('dashboard')}
        isEmergencyStopped={isEmergencyStopped}
        onToggleEmergencyStop={handleToggleEmergencyStop}
      />

      <GlobalStopBanner
        isEmergencyStopped={isEmergencyStopped}
        onResume={handleToggleEmergencyStop}
      />

      <main className="flex-1 min-h-0">
        {activeTab === 'city3d' && (
          <CitySimulationView />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            projects={projects}
            tasks={tasks}
            selectedProject={selectedProject}
            onSelectProject={(p) => setSelectedProject(p)}
            onLaunchNewProject={handleLaunchNewProject}
            onStartPipeline={handleStartPipeline}
          />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceView
            project={selectedProject}
            tasks={tasks}
            onRetryTask={handleRetryTask}
          />
        )}

        {activeTab === 'agents' && (
          <AgentMonitorView tasks={tasks} />
        )}

        {activeTab === 'timeline' && (
          <ExecutionTimelineView events={events} />
        )}

        {activeTab === 'verification' && (
          <VerificationCenterView tasks={tasks} />
        )}

        {activeTab === 'approvals' && (
          <ApprovalCenterView
            approvals={approvals}
            onDecide={handleDecideApproval}
          />
        )}

        {activeTab === 'memory' && (
          <ProjectMemoryView memoryEntries={memoryEntries} />
        )}

        {activeTab === 'models' && (
          <ModelConfigView />
        )}
      </main>
    </div>
  );
};
