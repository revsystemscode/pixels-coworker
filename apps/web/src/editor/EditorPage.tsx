import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  MAPS,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MAP_NAME_MAX_LENGTH,
  can,
  emptyMap,
  parseObjectValue,
  parseTiledForEditing,
  resizeMap,
  toTiled,
  type EditableMap,
  type MapEditorResponse,
  type MapObjectRect,
  type MapRect,
  type SaveDraftResponse,
  type SpaceSummary,
} from '@pixels/shared';
import { ApiRequestError, api, errorMessage } from '../api.js';
import { EditorCanvas } from './EditorCanvas.js';
import { Palette } from './Palette.js';
import { problemOf, useEditor, type Selection } from './store.js';

/** Tras el último cambio, el borrador se guarda solo pasado este tiempo. */
const AUTOSAVE_MS = 1_500;

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: string }
  | { status: 'error'; message: string };

const parseOrThrow = (raw: unknown): EditableMap => {
  const parsed = parseTiledForEditing(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.map;
};

/** /s/:spaceId/editor: editor del mapa del espacio (dueño y admins). */
export function EditorPage() {
  const { spaceId = '' } = useParams();
  const [space, setSpace] = useState<SpaceSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'discard' | 'blank' | 'office' | null>(null);
  const [busy, setBusy] = useState(false);
  const map = useEditor((s) => s.map);
  const rev = useEditor((s) => s.rev);
  const unsaved = useEditor((s) => s.unsaved);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const zoom = useEditor((s) => s.zoom);
  const showGrid = useEditor((s) => s.showGrid);
  const showCollision = useEditor((s) => s.showCollision);
  const set = useEditor((s) => s.set);
  const problem = map ? problemOf(map) : null;

  // Carga el espacio y el mapa (el borrador si hay uno).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const summary = await api<SpaceSummary>('GET', `/spaces/${spaceId}`);
        if (!can.editMap(summary.role)) {
          throw new Error('Solo el dueño y los admins pueden editar el mapa.');
        }
        const editor = await api<MapEditorResponse>('GET', `/spaces/${spaceId}/editor`);
        if (!alive) return;
        setSpace(summary);
        setHasDraft(!!editor.draft);
        useEditor.getState().load(parseOrThrow(editor.draft ?? editor.published));
        if (editor.draftUpdatedAt) setSave({ status: 'saved', at: editor.draftUpdatedAt });
      } catch (err) {
        if (!alive) return;
        const missing = err instanceof ApiRequestError && err.status === 404;
        setLoadError(missing ? 'Espacio no encontrado.' : errorMessage(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [spaceId]);

  const saveDraft = useCallback(async () => {
    const { map: current, rev: savedRev } = useEditor.getState();
    if (!current || problemOf(current)) return false;
    setSave({ status: 'saving' });
    try {
      const res = await api<SaveDraftResponse>('PUT', `/spaces/${spaceId}/editor/draft`, {
        map: toTiled(current),
      });
      useEditor.getState().markSaved(savedRev);
      setHasDraft(true);
      setSave({ status: 'saved', at: res.draftUpdatedAt });
      return true;
    } catch (err) {
      setSave({ status: 'error', message: errorMessage(err) });
      return false;
    }
  }, [spaceId]);

  // Guardado automático del borrador.
  useEffect(() => {
    if (!unsaved || problem) return;
    const timer = window.setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [rev, unsaved, problem, saveDraft]);

  // Aviso al cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  // Atajos: deshacer, rehacer, borrar lo seleccionado, Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault();
        s.deleteSelection();
      } else if (e.key === 'Escape') {
        s.set({ selection: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const publish = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (useEditor.getState().unsaved && !(await saveDraft())) return;
      await api('POST', `/spaces/${spaceId}/editor/publish`);
      setHasDraft(false);
      setSave({ status: 'idle' });
      setMessage('Mapa publicado. Quien está en el espacio ya lo ve.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await api('DELETE', `/spaces/${spaceId}/editor/draft`);
      const editor = await api<MapEditorResponse>('GET', `/spaces/${spaceId}/editor`);
      useEditor.getState().load(parseOrThrow(editor.published));
      setHasDraft(false);
      setSave({ status: 'idle' });
      setMessage('Borrador descartado: vuelves a ver el mapa publicado.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage('El archivo es demasiado grande (máximo 2 MB).');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setMessage('El archivo no es un JSON válido. Exporta el mapa desde Tiled en formato JSON.');
      return;
    }
    const parsed = parseTiledForEditing(raw);
    if (!parsed.ok) {
      setMessage(`No se pudo importar: ${parsed.error}`);
      return;
    }
    useEditor.getState().load(parsed.map, { unsaved: true, keepHistory: true });
    setMessage(`Mapa importado (${parsed.map.width}×${parsed.map.height}). Revísalo y publícalo.`);
  };

  const onExport = () => {
    const current = useEditor.getState().map;
    if (!current) return;
    // Las imágenes de los tilesets, por su nombre: cópialas junto al archivo para abrirlo en Tiled.
    const json = JSON.stringify(toTiled(current, ''), null, 1);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-${(space?.name ?? 'espacio').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError) {
    return (
      <main className="page page-center">
        <section className="panel card">
          <h1>No se puede editar el mapa</h1>
          <p className="subtitle">{loadError}</p>
          <Link to={`/s/${spaceId}`}>Volver al espacio</Link>
        </section>
      </main>
    );
  }
  if (!map || !space) {
    return (
      <main className="page page-center">
        <p className="subtitle">Cargando el editor…</p>
      </main>
    );
  }

  const status =
    problem !== null
      ? { text: `No se puede guardar: ${problem}`, error: true }
      : save.status === 'saving'
        ? { text: 'Guardando…', error: false }
        : save.status === 'error'
          ? { text: `No se pudo guardar: ${save.message}`, error: true }
          : unsaved
            ? { text: 'Cambios sin guardar', error: false }
            : hasDraft
              ? { text: 'Borrador guardado (sin publicar)', error: false }
              : { text: 'Sin cambios: es el mapa publicado', error: false };

  return (
    <div className="editor">
      <header className="editor-header">
        <Link to={`/s/${spaceId}`} className="muted-link">
          ← Volver al espacio
        </Link>
        <h1>Mapa de {space.name}</h1>
        <p className={`editor-status${status.error ? ' error' : ''}`} role="status">
          {status.text}
        </p>
        <div className="editor-actions">
          <button
            type="button"
            className="secondary"
            disabled={!canUndo}
            onClick={() => useEditor.getState().undo()}
            title="Ctrl+Z"
          >
            Deshacer
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canRedo}
            onClick={() => useEditor.getState().redo()}
            title="Ctrl+Shift+Z"
          >
            Rehacer
          </button>
          <span className="editor-zoom" aria-label="Zoom">
            <button
              type="button"
              className="secondary"
              aria-label="Alejar"
              disabled={zoom <= 1}
              onClick={() => set({ zoom: zoom - 1 })}
            >
              −
            </button>
            {zoom}×
            <button
              type="button"
              className="secondary"
              aria-label="Acercar"
              disabled={zoom >= 4}
              onClick={() => set({ zoom: zoom + 1 })}
            >
              +
            </button>
          </span>
          <label className="editor-toggle">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => set({ showGrid: e.target.checked })}
            />
            Cuadrícula
          </label>
          <label className="editor-toggle">
            <input
              type="checkbox"
              checked={showCollision}
              onChange={(e) => set({ showCollision: e.target.checked })}
            />
            Ver bloqueos
          </label>
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
            Importar de Tiled
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.tmj,application/json"
            hidden
            onChange={(e) => void onImport(e)}
            aria-label="Archivo de Tiled"
          />
          <button type="button" className="secondary" onClick={onExport}>
            Exportar
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!hasDraft && !unsaved}
            onClick={() => setConfirm('discard')}
          >
            Descartar borrador
          </button>
          <button
            type="button"
            disabled={busy || problem !== null || (!hasDraft && !unsaved)}
            onClick={() => setConfirm('publish')}
          >
            Publicar
          </button>
        </div>
      </header>
      {message && (
        <p className="editor-message" role="alert">
          {message}
          <button type="button" className="link-button" onClick={() => setMessage(null)}>
            Cerrar
          </button>
        </p>
      )}
      <div className="editor-body">
        <Palette />
        <div className="editor-viewport">
          <EditorCanvas onMessage={setMessage} />
        </div>
        <Properties onReset={(kind) => setConfirm(kind)} />
      </div>
      {confirm && (
        <ConfirmDialog
          kind={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'publish') void publish();
            else if (confirm === 'discard') void discard();
            else {
              const next =
                confirm === 'blank' ? emptyMap(30, 20) : parseOrThrow(structuredClone(MAPS.office));
              // Los ids de objetos nunca se reutilizan (el contenido viejo no aparece en uno nuevo).
              next.nextObjectId = Math.max(
                next.nextObjectId,
                useEditor.getState().map!.nextObjectId,
              );
              useEditor.getState().load(next, { unsaved: true, keepHistory: true });
              setConfirm(null);
            }
          }}
        />
      )}
    </div>
  );
}

const CONFIRM_TEXT = {
  publish: {
    title: '¿Publicar el mapa?',
    body: 'Quien esté en el espacio verá el cambio al momento. Si quitaste pizarras u objetos, se borra lo que tenían.',
    action: 'Publicar',
  },
  discard: {
    title: '¿Descartar el borrador?',
    body: 'Se pierden los cambios sin publicar y vuelves al mapa publicado.',
    action: 'Descartar',
  },
  blank: {
    title: '¿Empezar un mapa en blanco?',
    body: 'Se sustituye todo por una sala vacía de 30×20. Puedes deshacerlo.',
    action: 'Empezar en blanco',
  },
  office: {
    title: '¿Volver a la plantilla de oficina?',
    body: 'Se sustituye todo por la oficina original. Puedes deshacerlo.',
    action: 'Usar la plantilla',
  },
} as const;

function ConfirmDialog({
  kind,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: keyof typeof CONFIRM_TEXT;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const text = CONFIRM_TEXT[kind];
  return (
    <div className="editor-dialog-backdrop">
      <section
        className="panel editor-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={text.title}
      >
        <h2>{text.title}</h2>
        <p className="subtitle">{text.body}</p>
        <div className="object-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Un momento…' : text.action}
          </button>
        </div>
      </section>
    </div>
  );
}

const KIND_LABELS = {
  link: 'Enlace',
  video: 'Video',
  note: 'Nota',
  game: 'Mesa de juegos',
} as const;
const LAYER_LABELS = { zones: 'Zona privada', whiteboards: 'Pizarra', objects: 'Objeto' } as const;

/** Columna derecha: lo seleccionado o, si no hay nada, el tamaño del mapa. */
function Properties({ onReset }: { onReset: (kind: 'blank' | 'office') => void }) {
  const map = useEditor((s) => s.map)!;
  const selection = useEditor((s) => s.selection);
  useEditor((s) => s.rev);
  const rect = selection
    ? (map[selection.layer] as (MapRect | MapObjectRect)[]).find((r) => r.id === selection.id)
    : undefined;

  return (
    <aside className="editor-sidebar editor-properties" aria-label="Propiedades">
      {selection && rect ? (
        <RectProperties key={`${selection.layer}-${rect.id}`} selection={selection} rect={rect} />
      ) : (
        // Al cambiar el tamaño (o deshacerlo), el formulario empieza de cero.
        <MapProperties key={`${map.width}x${map.height}`} onReset={onReset} />
      )}
    </aside>
  );
}

function RectProperties({
  selection,
  rect,
}: {
  selection: Selection;
  rect: MapRect | MapObjectRect;
}) {
  const map = useEditor((s) => s.map)!;
  const update = useEditor((s) => s.updateRect);
  const checkpoint = useEditor((s) => s.checkpoint);
  const remove = useEditor((s) => s.deleteSelection);
  const object = 'kind' in rect ? rect : null;
  const [value, setValue] = useState(object?.value ?? '');
  const [valueError, setValueError] = useState<string | null>(null);

  const setNumber = (key: 'x' | 'y' | 'width' | 'height', raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const max =
      key === 'x'
        ? map.width - rect.width
        : key === 'y'
          ? map.height - rect.height
          : key === 'width'
            ? map.width - rect.x
            : map.height - rect.y;
    const min = key === 'width' || key === 'height' ? 1 : 0;
    checkpoint();
    update(selection, { [key]: Math.min(Math.max(n, min), max) });
  };

  const applyValue = () => {
    if (!object) return;
    const parsed = parseObjectValue(object.kind, value);
    if (!parsed.ok) {
      setValueError(parsed.error);
      return;
    }
    setValueError(null);
    if (parsed.value === object.value) return;
    checkpoint();
    update(selection, { value: parsed.value });
  };

  return (
    <div className="editor-form">
      <h2>{object ? KIND_LABELS[object.kind] : LAYER_LABELS[selection.layer]}</h2>
      <label className="field">
        <span>Nombre</span>
        <input
          value={rect.name}
          maxLength={MAP_NAME_MAX_LENGTH}
          onFocus={() => checkpoint()}
          onChange={(e) => update(selection, { name: e.target.value })}
        />
      </label>
      <div className="editor-numbers">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <label key={key} className="field">
            <span>{{ x: 'X', y: 'Y', width: 'Ancho', height: 'Alto' }[key]}</span>
            <input
              type="number"
              value={rect[key]}
              onChange={(e) => setNumber(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      {object && object.kind !== 'game' && (
        <label className="field">
          <span>Contenido inicial</span>
          {object.kind === 'note' ? (
            <textarea
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={applyValue}
            />
          ) : (
            <input
              value={value}
              placeholder={object.kind === 'link' ? 'https://…' : 'Enlace de YouTube o Vimeo'}
              onChange={(e) => setValue(e.target.value)}
              onBlur={applyValue}
            />
          )}
        </label>
      )}
      {valueError && (
        <p className="error" role="alert">
          {valueError}
        </p>
      )}
      <p className="subtitle">
        {selection.layer === 'zones'
          ? 'Dentro de la zona solo se ve y se oye a quien también está dentro.'
          : 'Se abre desde 2 casillas o menos. Mejor colócalo sobre una pared o un mueble.'}
      </p>
      <button type="button" className="danger" onClick={remove}>
        Quitar
      </button>
    </div>
  );
}

function MapProperties({ onReset }: { onReset: (kind: 'blank' | 'office') => void }) {
  const map = useEditor((s) => s.map)!;
  const [width, setWidth] = useState(String(map.width));
  const [height, setHeight] = useState(String(map.height));
  const w = Number(width);
  const h = Number(height);
  const valid = [w, h].every((n) => Number.isInteger(n) && n >= MAP_MIN_SIZE && n <= MAP_MAX_SIZE);

  return (
    <div className="editor-form">
      <h2>Mapa</h2>
      <p className="subtitle">
        Elige una herramienta a la izquierda y pinta sobre el mapa. Los cambios se guardan solos
        como borrador; nadie los ve hasta que pulsas <strong>Publicar</strong>.
      </p>
      <form
        className="editor-numbers"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || (w === map.width && h === map.height)) return;
          useEditor.getState().load(resizeMap(map, w, h), { unsaved: true, keepHistory: true });
        }}
      >
        <label className="field">
          <span>Ancho</span>
          <input
            type="number"
            min={MAP_MIN_SIZE}
            max={MAP_MAX_SIZE}
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Alto</span>
          <input
            type="number"
            min={MAP_MIN_SIZE}
            max={MAP_MAX_SIZE}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <button type="submit" className="secondary" disabled={!valid}>
          Cambiar tamaño
        </button>
      </form>
      <p className="subtitle">
        Entre {MAP_MIN_SIZE} y {MAP_MAX_SIZE} casillas. Al recortar se pierde lo que queda fuera
        (por la derecha y por abajo).
      </p>
      <h3>Empezar de nuevo</h3>
      <div className="object-actions">
        <button type="button" className="secondary" onClick={() => onReset('blank')}>
          Mapa en blanco
        </button>
        <button type="button" className="secondary" onClick={() => onReset('office')}>
          Plantilla de oficina
        </button>
      </div>
    </div>
  );
}
