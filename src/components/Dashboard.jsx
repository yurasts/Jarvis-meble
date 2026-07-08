import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import FileLightbox from './FileLightbox';
import ProjectCard from './ProjectCard';
import AddTaskModal from './AddTaskModal';
import ClientInfoModal from './ClientInfoModal';
import { groupByClient } from './dashboardHelpers';
import s from './Dashboard.module.css';

const Dashboard = ({
  clients, updateClient, openProjectModal, setIsModalOpen,
  profilesById = {}, canCreate = true, currentProfile = null
}) => {
  const [newTaskParams,      setNewTaskParams]      = useState({});
  const [confirmDeleteId,    setConfirmDeleteId]    = useState(null);
  const [expandedTaskId,     setExpandedTaskId]     = useState(null);
  // Свёрнутые группы клиентов (Set с именами клиентов)
  const [collapsedClients,   setCollapsedClients]   = useState(new Set());
  // По умолчанию выполненные задачи скрыты для каждого проекта
  const [showDoneByProject,  setShowDoneByProject]  = useState({});
  const [fileViewer, setFileViewer] = useState(null); // { files, categoryLabel } | null
  const [fileCounts, setFileCounts] = useState({}); // { [clientId]: { [category]: count } }
  const [addTaskModal, setAddTaskModal] = useState(null); // project | null
  const [clientInfoModal, setClientInfoModal] = useState(null); // { clientName, address, phone } | null

  useEffect(() => {
    const loadFileCounts = async () => {
      const { data } = await supabase.from('project_files').select('client_id, category');
      if (!data) return;
      const counts = {};
      data.forEach(f => {
        if (!counts[f.client_id]) counts[f.client_id] = {};
        counts[f.client_id][f.category] = (counts[f.client_id][f.category] || 0) + 1;
      });
      setFileCounts(counts);
    };
    loadFileCounts();
  }, []);

  const openFileCategory = async (project, cat) => {
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('client_id', project.id)
      .eq('category', cat.key)
      .order('uploaded_at', { ascending: true });
    setFileViewer({ files: data || [], categoryLabel: `${cat.icon} ${cat.label}` });
  };

  const toggleShowDone = (projectId) => {
    setShowDoneByProject(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const activeProjects = (clients || []).filter(
    c => c.status !== 'Zrealizowane' && c.status !== 'Zakończone'
  );

  const groups = groupByClient(activeProjects);

  const toggleClientGroup = (clientName) => {
    setCollapsedClients(prev => {
      const next = new Set(prev);
      next.has(clientName) ? next.delete(clientName) : next.add(clientName);
      return next;
    });
  };

  const handleAddTask = (clientId) => {
    const params = newTaskParams[clientId];
    if (!params?.text) return;
    const project = activeProjects.find(c => c.id === clientId);
    const newTask = {
      id: Date.now(), text: params.text, date: params.date || '', isDone: false,
      createdById: currentProfile?.id || null, createdByName: currentProfile?.full_name || null,
      createdByColor: currentProfile?.color || '#718096', createdAt: new Date().toISOString(),
    };
    updateClient(clientId, { tasks: [...(project.tasks || []), newTask] });
    setNewTaskParams(prev => ({ ...prev, [clientId]: { text: '', date: '' } }));
    setAddTaskModal(null);
  };

  const toggleTaskStatus = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, {
      tasks: (project.tasks || []).map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t)
    });
  };

  const deleteTask = (clientId, taskId) => {
    const project = activeProjects.find(c => c.id === clientId);
    updateClient(clientId, { tasks: (project.tasks || []).filter(t => t.id !== taskId) });
    setConfirmDeleteId(null);
  };

  return (
    <div className={s.page}>
      <div className={s.list}>

        {canCreate && (
          <div className={s.desktopNewBtn}>
            <button className={s.btnNewProject} onClick={() => setIsModalOpen(true)}>
              + Nowy projekt
            </button>
          </div>
        )}

        {activeProjects.length === 0 ? (
          <div className={s.empty}>Brak aktywnych projektów.</div>
        ) : (
          groups.map(([clientName, projects]) => {
            const isCollapsed = collapsedClients.has(clientName);
            const groupAddress = projects.find(p => p.address)?.address;
            const groupPhone   = projects.find(p => p.phone)?.phone;
            return (
              <div key={clientName} className={s.clientGroup}>

                {/* Заголовок группы клиента */}
                <div
                  className={s.clientGroupHeader}
                  onClick={() => toggleClientGroup(clientName)}
                >
                  <div className={s.clientGroupNameCol}>
                    {(groupAddress || groupPhone) && (
                      <button
                        className={s.clientInfoBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientInfoModal({ clientName, address: groupAddress, phone: groupPhone });
                        }}
                        title="Informacje o kliencie"
                      >
                        ℹ️
                      </button>
                    )}
                    <span className={s.clientGroupName}>👤 {clientName}</span>
                  </div>
                  <span className={s.clientGroupMeta}>
                    {projects.length} {projects.length === 1 ? 'projekt' : 'projekty'}
                  </span>
                  <span className={s.clientGroupArrow}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                </div>

                {/* Проекты клиента */}
                {!isCollapsed && projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    fileCounts={fileCounts}
                    onOpenProject={() => openProjectModal(project)}
                    onOpenFileCategory={(cat) => openFileCategory(project, cat)}
                    onOpenAddTask={() => setAddTaskModal(project)}
                    showDone={showDoneByProject[project.id]}
                    onToggleShowDone={() => toggleShowDone(project.id)}
                    confirmDeleteId={confirmDeleteId}
                    setConfirmDeleteId={setConfirmDeleteId}
                    expandedTaskId={expandedTaskId}
                    setExpandedTaskId={setExpandedTaskId}
                    onToggleTaskStatus={(taskId) => toggleTaskStatus(project.id, taskId)}
                    onDeleteTask={(taskId) => deleteTask(project.id, taskId)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {fileViewer && (
        <FileLightbox
          files={fileViewer.files}
          categoryLabel={fileViewer.categoryLabel}
          onClose={() => setFileViewer(null)}
        />
      )}

      {addTaskModal && (
        <AddTaskModal
          project={addTaskModal}
          value={newTaskParams[addTaskModal.id] || {}}
          onChangeText={(text) => setNewTaskParams(prev => ({ ...prev, [addTaskModal.id]: { ...prev[addTaskModal.id], text } }))}
          onChangeDate={(date) => setNewTaskParams(prev => ({ ...prev, [addTaskModal.id]: { ...prev[addTaskModal.id], date } }))}
          onSubmit={() => handleAddTask(addTaskModal.id)}
          onClose={() => setAddTaskModal(null)}
        />
      )}

      {clientInfoModal && (
        <ClientInfoModal
          info={clientInfoModal}
          onClose={() => setClientInfoModal(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
