import { isValidElement, useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { zipSync, strToU8 } from 'fflate';
import {
  Archive,
  ArrowLeft,
  PanelTopClose,
  PanelTopOpen,
  SlidersHorizontal,
  Link2,
  ListOrdered,
  Strikethrough,
  Bold,
  CheckSquare,
  Code2,
  Download,
  FileText,
  FolderPlus,
  Italic,
  List,
  Plus,
  Quote,
  Save,
  Search,
  Table2,
  Upload,
} from 'lucide-react';
import { api, errorMessage } from './api';
import { useChanges } from './changes';
import { MermaidDiagram, waitForDiagrams } from './MermaidDiagram';
import { noteFonts, exportFontCss } from './noteFonts';
import { noteDiagrams, noteDiagramCategories } from './noteDiagrams';
import '@fontsource/lora/latin-400.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import './styles/notes-editor.css';
import { Badge, Empty, ErrorBox, Field, Modal } from './components';
import {
  colors,
  colorNames,
  type Note,
  type NoteFolder,
  type Space,
  type Workspace,
} from './types';
const markdownComponents: Components = {
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    if (
      isValidElement<{ className?: string; children?: unknown }>(child) &&
      child.props.className?.split(' ').includes('language-mermaid')
    )
      return <MermaidDiagram source={String(child.props.children || '').replace(/\n$/, '')} />;
    return <pre>{children}</pre>;
  },
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => (
    <span className="image-placeholder">Imagen: {alt || 'referencia externa'}</span>
  ),
};
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      [
        'className',
        'ink-red',
        'ink-blue',
        'ink-green',
        'ink-purple',
        'ink-orange',
        'font-serif',
        'font-mono',
        ...noteFonts.map((font) => `font-${font.id}`),
        'mark-highlight',
      ],
    ],
    div: [['className', 'callout', 'callout-info', 'callout-warning', 'callout-success']],
    code: [['className', /^language-/]],
  },
};
const exportCss =
  'body{max-width:900px;margin:40px auto;padding:24px;color:#1b1c2c;background:white;font:16px/1.7 system-ui}pre{white-space:pre-wrap;background:#f1f2f9;padding:18px;border-radius:12px}code{font-family:monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px}blockquote,.callout{border-left:4px solid #7b61ff;padding:12px 20px;background:#f5f6fb}.ink-red{color:#b74532}.ink-blue{color:#3265bd}.ink-green{color:#087f61}.ink-purple{color:#6548df}.ink-orange{color:#9a5709}.font-serif{font-family:Georgia,serif}.font-mono{font-family:monospace}.mark-highlight{background:#fff1ad}.callout-warning{border-color:#9a5709}.callout-success{border-color:#087f61}';
const safeName = (name: string) =>
  name
    // eslint-disable-next-line no-control-regex -- Strip forbidden filename control characters.
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 80) || 'nota';
function download(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const markdownFile = (n: Pick<Note, 'title' | 'markdown' | 'color' | 'font'>) =>
  `---\naegitasks: 1\ntitle: ${JSON.stringify(n.title)}\ncolor: ${JSON.stringify(n.color)}\nfont: ${JSON.stringify(n.font)}\n---\n\n${n.markdown}`;
const templates: Record<string, string> = {
  technical:
    '# Referencia técnica\n\n> [!NOTE]\n> Contexto y alcance de esta documentación.\n\n## Conexión\n\n| Campo | Valor |\n| --- | --- |\n| Entorno | Producción |\n| Host | |\n| Responsable | |\n\n## Procedimiento\n\n1. Verificar el entorno.\n2. Ejecutar el procedimiento.\n\n```bash\n# Comando de ejemplo\necho "ready"\n```\n\n## Verificación\n\n- [ ] Conectividad\n- [ ] Validación del equipo\n',
  meeting:
    '# Notas de reunión\n\n## Objetivo\n\n## Acuerdos\n\n- [ ] Acción · responsable · fecha\n\n## Decisiones\n\n> Motivo de la decisión.\n',
  idea: '# Una idea para después\n\n## El problema\n\n## La propuesta\n\n## Siguiente paso\n\n- [ ] Validar la idea\n',
};
export function NotesPage({
  editorId,
  onSavedRoute,
  space,
  workspace: w,
  canTasks,
  openTask,
}: {
  editorId: string | null;
  onSavedRoute: (id: string) => void;
  space: Space;
  workspace: Workspace;
  canTasks: boolean;
  openTask: (id: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const editor = editorId;
  const setEditor = (id: string | null) => {
    location.hash = id ? `notes/${id}` : 'notes';
  };
  const [folderEdit, setFolderEdit] = useState<Partial<NoteFolder> | null>(null);
  const [error, setError] = useState('');
  const [imported, setImported] = useState<Partial<Note> | null>(null);
  const loadVersion = useRef(0);
  useChanges(['notes'], () => void load().catch((e) => setError(errorMessage(e))));
  async function load(signal?: AbortSignal) {
    const version = ++loadVersion.current;
    const params = new URLSearchParams({ q: query, archived: String(archived) });
    if (folder) params.set('folder', folder);
    const [n, f] = await Promise.all([
      api<Note[]>(`/notes?${params}`, 'GET', undefined, signal),
      api<NoteFolder[]>('/note-folders', 'GET', undefined, signal),
    ]);
    if (signal?.aborted || version !== loadVersion.current) return;
    setNotes(n);
    setFolders(f);
  }
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        void load(controller.signal).catch((e) => {
          if (alive) setError(errorMessage(e));
        }),
      200,
    );
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [space.id, folder, query, archived]);
  async function exportSpace() {
    try {
      const data = await api<{ notes: Note[]; folders: NoteFolder[] }>('/notes/export');
      const files: Record<string, Uint8Array> = {};
      for (const n of data.notes) {
        let path = '';
        let id = n.folderId;
        const visited = new Set<string>();
        while (id && !visited.has(id)) {
          visited.add(id);
          const f = data.folders.find((f) => f.id === id);
          if (!f) break;
          path = `${safeName(f.name)}/` + path;
          id = f.parentId;
        }
        files[
          `${n.archived ? 'Archivadas/' : ''}${path}${safeName(n.title)}-${n.id.slice(0, 8)}.md`
        ] = strToU8(markdownFile(n));
      }
      files['aegitasks-index.json'] = strToU8(JSON.stringify(data, null, 2));
      const bytes = zipSync(files);
      download(`${safeName(space.name)}-notas.zip`, bytes.buffer as ArrayBuffer, 'application/zip');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function importFile(file: File) {
    if (file.size > 800000) {
      setError('El archivo es demasiado grande. Máximo 800 KB.');
      return;
    }
    let body = await file.text();
    let title = file.name.replace(/\.md$/i, '');
    let color = 'purple',
      font = 'sans';
    const match = body.match(/^---\r?\naegitasks: 1\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (match) {
      for (const line of match[1]!.split('\n')) {
        const [key, ...value] = line.split(':');
        try {
          const parsed = JSON.parse(value.join(':'));
          if (typeof parsed !== 'string') continue;
          if (key === 'title') title = parsed;
          if (key === 'color' && colors.includes(parsed)) color = parsed;
          if (key === 'font' && noteFonts.some((font) => font.id === parsed)) font = parsed;
        } catch {}
      }
      body = body.slice(match[0].length).replace(/^\n/, '');
    }
    setImported({ title, markdown: body, color, font });
    setEditor('new');
  }
  const tree = (parent: string | null, depth = 0): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parent)
      .map((f) => (
        <div key={f.id}>
          <div className="note-folder-row" style={{ paddingLeft: Math.min(depth, 16) * 12 }}>
            <button className={folder === f.id ? 'active' : ''} onClick={() => setFolder(f.id)}>
              ▱ {f.name}
            </button>
            <button
              className="folder-more"
              aria-label={`Editar carpeta ${f.name}`}
              onClick={() => setFolderEdit(f)}
            >
              ···
            </button>
          </div>
          {tree(f.id, depth + 1)}
        </div>
      ));
  if (editor)
    return (
      <NoteEditor
        id={editor === 'new' ? undefined : editor}
        initial={editor === 'new' ? imported || undefined : undefined}
        folderId={folder}
        folders={folders}
        workspace={w}
        canTasks={canTasks}
        openTask={openTask}
        onClose={() => setEditor(null)}
        onSaved={async (n) => {
          onSavedRoute(n.id);
          await load();
        }}
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {space.isPersonal ? 'TU CONOCIMIENTO, SOLO TUYO' : 'CONOCIMIENTO COMPARTIDO'}
          </div>
          <h1>
            Notas<span className="heading-dot">.</span>
          </h1>
          <p>Ideas, documentación y referencias. Todo en su lugar.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setImported(null);
            setEditor('new');
          }}
        >
          <Plus size={18} />
          Nueva nota
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="notes-layout">
        <aside className="card notes-folders">
          <div className="section-heading">
            <h3>Carpetas</h3>
            <button
              className="btn-icon"
              aria-label="Crear carpeta de notas"
              onClick={() => setFolderEdit({ parentId: folder || null })}
            >
              <FolderPlus size={18} />
            </button>
          </div>
          <button className={`all-notes ${!folder ? 'active' : ''}`} onClick={() => setFolder('')}>
            Todas las notas
          </button>
          {tree(null)}
          <div className="notes-tools">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Archivadas
            </label>
            <label className="btn btn-ghost upload">
              <Upload size={16} />
              Importar Markdown
              <input
                aria-label="Importar Markdown"
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button className="btn btn-ghost" onClick={() => void exportSpace()}>
              <Download size={16} />
              Exportar espacio
            </button>
          </div>
        </aside>
        <section>
          <div className="search-field notes-search">
            <Search size={18} />
            <input
              aria-label="Buscar notas"
              placeholder="Buscar en títulos y contenido…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="notes-grid">
            {notes.map((n) => (
              <button
                className={`card note-card tone-border-${n.color}`}
                key={n.id}
                onClick={() => setEditor(n.id)}
              >
                <div className="section-heading">
                  <FileText size={20} />
                  {n.pinned && <Badge color="purple">Fijada</Badge>}
                </div>
                <h2>{n.title}</h2>
                <p>{folders.find((f) => f.id === n.folderId)?.name || 'Sin carpeta'}</p>
                <div className="note-card-bottom">
                  <span>{new Date(n.updatedAt).toLocaleDateString('es-MX')}</span>
                  {n.linkedTaskId && <Badge color="green">Con pendiente</Badge>}
                </div>
              </button>
            ))}
          </div>
          {!notes.length && (
            <div className="card">
              <Empty icon={<FileText size={32} />} title="Un lugar para tus ideas">
                Crea una nota, importa Markdown o cambia los filtros.
              </Empty>
            </div>
          )}
        </section>
      </div>
      {folderEdit && (
        <FolderEditor
          folder={folderEdit}
          folders={folders}
          onClose={() => setFolderEdit(null)}
          onSaved={async () => {
            await load();
            setFolderEdit(null);
          }}
        />
      )}
    </>
  );
}
function FolderEditor({
  folder,
  folders,
  onClose,
  onSaved,
}: {
  folder: Partial<NoteFolder>;
  folders: NoteFolder[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(folder.name || '');
  const [parent, setParent] = useState(folder.parentId || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(remove = false) {
    setBusy(true);
    setError('');
    try {
      await api(
        `/note-folders${folder.id ? `/${folder.id}` : ''}`,
        remove ? 'DELETE' : folder.id ? 'PUT' : 'POST',
        remove ? undefined : { name, parentId: parent || null },
      );
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={folder.id ? 'Editar carpeta de notas' : 'Crear carpeta de notas'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ErrorBox message={error} />
        <Field label="Nombre de carpeta">
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Carpeta superior">
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Nivel principal</option>
            {folders
              .filter((f) => f.id !== folder.id)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-actions">
          {folder.id && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (confirm('¿Eliminar esta carpeta vacía?')) void save(true);
              }}
            >
              Eliminar carpeta
            </button>
          )}
          <button className="btn btn-primary" disabled={busy}>
            Guardar carpeta
          </button>
        </div>
      </form>
    </Modal>
  );
}
function NoteEditor({
  id,
  initial,
  folderId,
  folders,
  workspace: w,
  canTasks,
  openTask,
  onClose,
  onSaved,
}: {
  id?: string;
  initial?: Partial<Note>;
  folderId: string;
  folders: NoteFolder[];
  workspace: Workspace;
  canTasks: boolean;
  openTask: (id: string) => void;
  onClose: () => void;
  onSaved: (n: Note) => Promise<void>;
}) {
  const [note, setNote] = useState<Partial<Note>>({
    title: '',
    markdown: '',
    folderId: folderId || null,
    projectId: null,
    color: 'purple',
    font: 'sans',
    pinned: false,
    archived: false,
    ...initial,
  });
  const [dirty, setDirty] = useState(!!initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [mode, setMode] = useState(() =>
    matchMedia('(min-width: 1024px)').matches ? 'split' : 'edit',
  );
  const [exporting, setExporting] = useState(false);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id || note.id === id) return;
    setLoaded(false);
    setError('');
    const c = new AbortController();
    void api<Note>(`/notes/${id}`, 'GET', undefined, c.signal)
      .then((n) => {
        setNote(n);
        setDirty(false);
        setLoaded(true);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const update = <K extends keyof Note>(key: K, value: Note[K]) => {
    setNote((n) => ({ ...n, [key]: value }));
    setDirty(true);
  };
  const close = () => {
    if (!busy && !exporting) onClose();
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      const noteId = note.id || id;
      const n = await api<Note>(
        noteId ? `/notes/${noteId}` : '/notes',
        noteId ? 'PUT' : 'POST',
        note,
      );
      setNote(n);
      setDirty(false);
      await onSaved(n);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function insert(before: string, after = '') {
    const el = text.current;
    if (!el) return;
    if (mode === 'preview') setMode('edit');
    const start = el.selectionStart,
      end = el.selectionEnd;
    const value = note.markdown || '';
    update(
      'markdown',
      value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  }
  async function exportNote(html = false) {
    setExporting(true);
    setError('');
    try {
      if (html) {
        await waitForDiagrams(preview.current);
        const fonts = await exportFontCss();
        const safeTitle = (note.title || 'Nota').replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
        );
        download(
          `${safeName(note.title || 'Nota')}.html`,
          `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>${exportCss}${fonts}.mermaid-diagram{margin:24px 0;overflow:auto}.mermaid-svg svg{max-width:100%;height:auto}.mermaid-error{color:#b74532}</style><body class="font-${note.font}"><h1>${safeTitle}</h1>${preview.current?.innerHTML || ''}</body></html>`,
          'text/html',
        );
      } else
        download(
          `${safeName(note.title || 'Nota')}.md`,
          markdownFile(note as Note),
          'text/markdown;charset=utf-8',
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  async function convert() {
    if (!id || !note.projectId) {
      setError('Guarda la nota y selecciona un proyecto para crear el pendiente.');
      return;
    }
    if (dirty) {
      setError('Guarda los cambios antes de crear el pendiente.');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string }>(`/notes/${id}/task`, 'POST', {
        projectId: note.projectId,
        version: note.version,
      });
      setNote(await api<Note>(`/notes/${id}`));
      openTask(r.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="note-editor-page note-editor"
      data-unsaved-note={dirty || busy}
      data-update-blocked={dirty || busy || exporting}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (!busy && !exporting)
            document.querySelector<HTMLFormElement>('#note-form')?.requestSubmit();
        }
      }}
    >
      <header className="note-editor-header">
        <button
          className="btn-icon"
          aria-label="Volver a notas"
          title="Volver a notas"
          onClick={close}
          disabled={busy || exporting}
        >
          <ArrowLeft size={20} />
        </button>
        <input
          className="note-title-input"
          aria-label="Título de nota"
          form="note-form"
          required
          maxLength={200}
          value={note.title}
          disabled={!loaded || busy || exporting}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Título de la nota"
        />
        <div className="note-editor-context">
          <h1>{note.id || id ? 'Editar nota' : 'Nueva nota'}</h1>
          <span role="status">
            {busy
              ? 'Guardando…'
              : dirty
                ? 'Cambios sin guardar'
                : note.id
                  ? 'Guardado'
                  : 'Borrador nuevo'}
          </span>
        </div>
        <button
          type="submit"
          form="note-form"
          className="btn btn-primary"
          disabled={!loaded || busy || exporting}
        >
          <Save size={16} />
          Guardar nota
        </button>
        <div className="tabs note-view-tabs" aria-label="Vista de la nota">
          {['edit', 'split', 'preview'].map((v) => (
            <button
              type="button"
              key={v}
              className={mode === v ? 'active' : ''}
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
            >
              {v === 'edit' ? 'Editar' : v === 'split' ? 'Dividida' : 'Vista previa'}
            </button>
          ))}
        </div>
        <button
          className="btn-icon note-tools-toggle"
          aria-label={toolsCollapsed ? 'Mostrar herramientas' : 'Ocultar herramientas'}
          title={toolsCollapsed ? 'Mostrar herramientas' : 'Ocultar herramientas'}
          aria-expanded={!toolsCollapsed}
          aria-controls="note-tools"
          onClick={() => setToolsCollapsed((value) => !value)}
        >
          {toolsCollapsed ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
        </button>
      </header>
      <ErrorBox message={error} />
      {!loaded ? (
        <p>Cargando nota…</p>
      ) : (
        <>
          <form
            id="note-form"
            inert={busy || exporting}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="note-tools" id="note-tools" hidden={toolsCollapsed}>
              <details
                className="note-details"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.currentTarget.open = false;
                    e.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary title="Propiedades, plantillas y exportación">
                  <SlidersHorizontal size={15} />
                  <span>Opciones</span>
                </summary>
                <div className="note-properties-panel">
                  <div className="note-properties">
                    <Field label="Carpeta de nota">
                      <select
                        value={note.folderId || ''}
                        onChange={(e) => update('folderId', e.target.value || null)}
                      >
                        <option value="">Sin carpeta</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Proyecto relacionado">
                      <select
                        value={note.projectId || ''}
                        onChange={(e) => update('projectId', e.target.value || null)}
                      >
                        <option value="">Ninguno · nota independiente</option>
                        {w.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tipografía">
                      <select value={note.font} onChange={(e) => update('font', e.target.value)}>
                        {noteFonts.map((font) => (
                          <option value={font.id} key={font.id}>
                            {font.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Color de nota">
                      <select value={note.color} onChange={(e) => update('color', e.target.value)}>
                        {colors.map((c) => (
                          <option key={c} value={c}>
                            {colorNames[c]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="note-options">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={note.pinned}
                        onChange={(e) => update('pinned', e.target.checked)}
                      />
                      Fijar nota
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={note.archived}
                        onChange={(e) => update('archived', e.target.checked)}
                      />
                      <Archive size={15} />
                      Archivada
                    </label>
                    <select
                      aria-label="Insertar plantilla"
                      value=""
                      onChange={(e) => {
                        if (
                          !note.markdown ||
                          confirm('¿Reemplazar el contenido con esta plantilla?')
                        )
                          update('markdown', templates[e.target.value] || '');
                      }}
                    >
                      <option value="">Usar plantilla…</option>
                      <option value="technical">Referencia técnica</option>
                      <option value="meeting">Reunión</option>
                      <option value="idea">Idea / pendiente</option>
                    </select>
                  </div>
                  <div className="note-export-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={exporting || busy}
                      onClick={() => void exportNote()}
                    >
                      <Download size={15} />
                      Markdown
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={exporting || busy}
                      onClick={() => void exportNote(true)}
                    >
                      HTML
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={exporting || busy}
                      onClick={async () => {
                        setExporting(true);
                        setError('');
                        try {
                          await waitForDiagrams(preview.current);
                          await document.fonts.ready;
                          window.print();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setExporting(false);
                        }
                      }}
                    >
                      Imprimir / PDF
                    </button>
                    {canTasks && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || !id}
                        onClick={() =>
                          note.linkedTaskId ? openTask(note.linkedTaskId) : void convert()
                        }
                      >
                        {note.linkedTaskId ? 'Abrir pendiente' : 'Crear pendiente desde nota'}
                      </button>
                    )}
                  </div>
                </div>
              </details>

              <div className="markdown-toolbar" aria-label="Formato Markdown">
                <select
                  aria-label="Insertar diagrama Mermaid"
                  value=""
                  onChange={(e) => {
                    const diagram = noteDiagrams.find((d) => d.id === e.target.value);
                    if (diagram) insert(`\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n`);
                  }}
                >
                  <option value="">Diagrama Mermaid…</option>
                  {noteDiagramCategories.map((category) => (
                    <optgroup label={category} key={category}>
                      {noteDiagrams
                        .filter((d) => d.category === category)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                {[
                  { name: 'Negrita', icon: Bold, a: '**', b: '**' },
                  { name: 'Cursiva', icon: Italic, a: '_', b: '_' },
                  { name: 'Tachado', icon: Strikethrough, a: '~~', b: '~~' },
                  { name: 'Enlace', icon: Link2, a: '[', b: '](https://)' },
                  { name: 'Lista numerada', icon: ListOrdered, a: '\n1. ', b: '' },
                  { name: 'Título', icon: FileText, a: '\n## ', b: '' },
                  { name: 'Código inline', icon: Code2, a: '`', b: '`' },
                  { name: 'Bloque de código', icon: Code2, a: '\n```javascript\n', b: '\n```\n' },
                  { name: 'Cita', icon: Quote, a: '\n> ', b: '\n' },
                  { name: 'Lista', icon: List, a: '\n- ', b: '' },
                  { name: 'Checklist', icon: CheckSquare, a: '\n- [ ] ', b: '' },
                  {
                    name: 'Tabla',
                    icon: Table2,
                    a: '\n| Columna | Valor |\n| --- | --- |\n| ',
                    b: ' | |\n',
                  },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.name}
                    aria-label={t.name}
                    title={t.name}
                    onClick={() => insert(t.a, t.b)}
                  >
                    <t.icon size={17} />
                  </button>
                ))}
                <select
                  aria-label="Estilo de texto"
                  value=""
                  onChange={(e) => {
                    const style = e.target.value;
                    if (style) insert(`<span class="${style}">`, '</span>');
                  }}
                >
                  <option value="">Color / estilo</option>
                  {[
                    'ink-purple',
                    'ink-blue',
                    'ink-green',
                    'ink-red',
                    'ink-orange',
                    'mark-highlight',
                    ...noteFonts.map((font) => `font-${font.id}`),
                  ].map((x) => (
                    <option key={x} value={x}>
                      {(
                        {
                          'ink-purple': 'Violeta',
                          'ink-blue': 'Azul',
                          'ink-green': 'Verde',
                          'ink-red': 'Coral',
                          'ink-orange': 'Ámbar',
                          'mark-highlight': 'Resaltado',
                          'font-serif': 'Serif',
                          'font-mono': 'Monoespaciado',
                        } as Record<string, string>
                      )[x] || noteFonts.find((font) => `font-${font.id}` === x)?.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => insert('\n<div class="callout callout-info">\n\n', '\n\n</div>\n')}
                >
                  Callout
                </button>
              </div>
            </div>
            <div className={`markdown-panels mode-${mode}`}>
              <textarea
                ref={text}
                aria-label="Contenido Markdown"
                className={`markdown-source font-${note.font}`}
                spellCheck={false}
                maxLength={200000}
                value={note.markdown}
                onChange={(e) => update('markdown', e.target.value)}
                placeholder="# Escribe algo que valga la pena recordar…"
              />
              <article
                tabIndex={0}
                aria-label="Vista previa Markdown"
                ref={preview}
                className={`markdown-preview font-${note.font} note-print`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    rehypeRaw,
                    [rehypeSanitize, schema],
                    [rehypeHighlight, { plainText: ['mermaid'] }],
                  ]}
                  components={markdownComponents}
                >
                  {note.markdown || '*Tu vista previa aparecerá aquí.*'}
                </ReactMarkdown>
              </article>
            </div>
            <p className="note-word-count muted small">
              {note.markdown?.length || 0} / 200 000 caracteres · Ctrl / ⌘ + S para guardar
            </p>
          </form>
        </>
      )}
    </section>
  );
}
