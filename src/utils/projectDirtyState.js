const normalizeProjectFields = (project = {}) => ({
  calc_materials: project.calc_materials || [],
  calc_services: project.calc_services || [],
  calc_expenses: project.calc_expenses || [],
  tasks: project.tasks || [],
  notes: project.notes || '',
  important_points: project.important_points || [],
  deadline: project.deadline || '',
  address: project.address || '',
  phone: project.phone || '',
  client_name: project.client_name || '',
  project_name: project.project_name || '',
  budget_coefficient: Number(project.budget_coefficient) || 2.0,
});

export const hasProjectFieldChanges = (project, originalProject) => {
  if (!originalProject) return false;

  return JSON.stringify(normalizeProjectFields(project))
    !== JSON.stringify(normalizeProjectFields(originalProject));
};