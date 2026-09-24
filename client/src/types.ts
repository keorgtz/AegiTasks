export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  archived: boolean;
}
export interface Folder {
  id: string;
  projectId: string;
  name: string;
}
export interface Status {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  isDone: boolean;
}
export interface Tag {
  id: string;
  name: string;
  color: string;
}
export interface Workspace {
  projects: Project[];
  folders: Folder[];
  statuses: Status[];
  tags: Tag[];
  users: User[];
}
export interface Space {
  id: string;
  name: string;
  ownerId: string;
  isPersonal: boolean;
}
export interface SpaceSession {
  spaces: Space[];
  permissions: string[];
}
export interface NoteFolder {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
}
export interface Note {
  id: string;
  spaceId: string;
  title: string;
  markdown: string;
  folderId: string | null;
  projectId: string | null;
  linkedTaskId: string | null;
  font: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  version: string;
  updatedAt: string;
}
export interface TaskItem {
  id: string;
  title: string;
  description: string;
  projectId: string;
  folderId: string | null;
  statusId: string;
  assigneeId: string | null;
  createdById: string;
  priority: number | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  archived: boolean;
  version: string;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}
export interface TaskDetail {
  item: TaskItem;
  activities: { id: string; userId: string; body: string; kind: string; createdAt: string }[];
  attachments: { id: string; name: string; size: number; contentType: string }[];
}
export interface TaskPage {
  items: TaskItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Summary {
  open: number;
  urgent: number;
  overdue: number;
  done: number;
}
export const priorities = ['Sin prioridad', 'Baja', 'Media', 'Alta', 'Urgente'];
export const priorityColors = ['neutral', 'blue', 'purple', 'orange', 'red'];
export const colors = ['purple', 'pink', 'green', 'blue', 'orange', 'red'];
export const colorNames: Record<string, string> = {
  purple: 'Violeta',
  pink: 'Rosa',
  green: 'Verde',
  blue: 'Azul',
  orange: 'Ámbar',
  red: 'Coral',
};
export const initials = (name: string) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const dateLabel = (date: string) =>
  new Date(date.length === 10 ? date + 'T12:00:00' : date).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
