/**
 * Schema-driven debug bindings — an object DECLARES its knobs by returning a
 * {@link DebugSchema}; the generic {@link bindSchema} does the Tweakpane wiring.
 * No `addBinding`/`.on("change")` pairs written by hand, no DEFAULTS object kept
 * in sync with the UI.
 *
 * A {@link DebugField} is self-binding: it carries its current value, its
 * Tweakpane metadata, and a `write(v)` that pushes a new value back to wherever
 * it lives. The one store every helper reads/writes through is a {@link ValueRef}
 * — `{ value }`. TSL `uniform()` nodes already ARE that shape, so `slider(myUniform,
 * range)` binds a uniform with zero glue; {@link ref} adapts anything else (a
 * plain prop, a value that fans out to several targets) into the same shape.
 *
 * `debug.bind(title, thunk)` (see debug-tools.ts) mounts a single schema as a
 * folder, with an optional copy button that serializes its live values. A
 * {@link Debuggable} owns one or more such folders as {@link DebugFolder}s and is
 * mounted wholesale with `debug.register(x)` — a class with several folders (each
 * its own concern) collapses to that one method.
 *
 * Ported from the JOYCO jam project's `lib/debug.ts`, unchanged: this file has
 * no engine coupling — no ticker, no Disposer, no renderer — just Tweakpane
 * types and plain data.
 */
import type { Color } from 'three/webgpu'
import type { FolderApi } from '@tweakpane/core'

/** The `{ value }` store every helper reads/writes through. A TSL `uniform()`
 * satisfies this directly. */
export type ValueRef<T> = { value: T }

/** Adapt an arbitrary get/set into a {@link ValueRef} — a plain prop, a derived
 * value, or a write that fans out to several targets. */
export function ref<T>(get: () => T, set: (v: T) => void): ValueRef<T> {
  return {
    get value() {
      return get()
    },
    set value(v: T) {
      set(v)
    },
  }
}

/** Adapt one mutable object property into the shared debug value shape. */
export function property<TObject, TKey extends keyof TObject>(
  object: TObject,
  key: TKey,
): ValueRef<TObject[TKey]> {
  return ref(
    () => object[key],
    (value) => {
      object[key] = value
    },
  )
}

export type RgbValue = { r: number; g: number; b: number }
export type OklchValue = { l: number; c: number; h: number }

/** One self-binding debug knob: its current value, its Tweakpane metadata, and
 * the writer that applies a new value. `label` overrides the key as the shown
 * name. */
export type DebugField =
  | {
      kind: 'folder'
      schema: () => DebugSchema
      label?: string
      expanded?: boolean
      copy?: boolean
    }
  | {
      kind: 'slider'
      value: number
      min: number
      max: number
      step?: number
      label?: string
      /** Poll {@link read} each frame and push the value back into the pane, so a
       * slider driven by external state (a game-updated uniform) tracks it live
       * instead of showing its bind-time snapshot. Needs a frame registrar (see
       * {@link bindSchema}); user-driven knobs leave this off. */
      live?: boolean
      /** Live value source for {@link live} — re-reads the backing ref's getter. */
      read?: () => number
      write: (v: number) => void
    }
  | {
      kind: 'enum'
      value: number
      options: Record<string, number>
      label?: string
      rebuildOnChange?: boolean
      write: (v: number) => void
    }
  | {
      kind: 'select'
      value: string
      options: Record<string, string>
      label?: string
      write: (v: string) => void
    }
  | {
      kind: 'bool'
      value: boolean
      label?: string
      rebuildOnChange?: boolean
      write: (v: boolean) => void
    }
  | {
      kind: 'color'
      value: RgbValue
      label?: string
      write: (v: RgbValue) => void
    }
  | {
      kind: 'hexColor'
      value: string
      label?: string
      write: (v: string) => void
    }

export type DebugSchema = Record<string, DebugField>

/** Nest another declarative schema under a child folder. */
export function folder(
  schema: () => DebugSchema,
  opts?: { label?: string; expanded?: boolean; copy?: boolean },
): DebugField {
  return { kind: 'folder', schema, ...opts }
}

/** One debug folder an object contributes: a titled schema plus the same knobs
 * `debug.bind` takes — initial expansion, a `copy` button, and an `extend` for
 * anything a flat schema can't express (imperative buttons, a dropdown with
 * side effects, a cleanup). The `schema` is a THUNK, re-read on copy so the
 * button always sees live values. */
export type DebugFolder = {
  title: string
  schema: () => DebugSchema
  expanded?: boolean
  copy?: boolean
  extend?: (folder: FolderApi) => void | (() => void)
}

/** Anything that owns one or more debug folders. `debug.register(x)` mounts them
 * all and returns a single disposer. A class with several folders (each its own
 * concern) returns an array; a class with just one returns the folder bare — no
 * single-element array to wrap. */
export interface Debuggable {
  debug(): DebugFolder | DebugFolder[]
}

/** Normalize a {@link Debuggable}'s return — one folder or many — to an array. */
export function toFolders(f: DebugFolder | DebugFolder[]): DebugFolder[] {
  return Array.isArray(f) ? f : [f]
}

export function slider(
  store: ValueRef<number>,
  range: {
    min: number
    max: number
    step?: number
    label?: string
    live?: boolean
  },
): DebugField {
  // Spreading `range` (rather than naming `step`/`label`/`live` explicitly)
  // keeps their optionality intact under `exactOptionalPropertyTypes` — a
  // dot-read of an optional field always types as `T | undefined`, which an
  // explicit `key: value` pair can't assign back into an optional key.
  return {
    kind: 'slider',
    value: store.value,
    ...range,
    read: () => store.value,
    write: (v) => {
      store.value = v
    },
  }
}

/** A three `Color` bound as a float color picker. */
export function color(store: ValueRef<Color>, opts?: { label?: string }): DebugField {
  const c = store.value
  return {
    kind: 'color',
    value: { r: c.r, g: c.g, b: c.b },
    ...opts,
    write: (v) => c.setRGB(v.r, v.g, v.b),
  }
}

/** A perceptual OKLCH color authored as three sliders. Conversion into a
 * renderer color stays at the caller boundary because debug values are not
 * necessarily colors consumed by Three. */
export function oklchColor(store: ValueRef<OklchValue>, opts?: { label?: string; expanded?: boolean }): DebugField {
  const component = (key: keyof OklchValue) =>
    ref(
      () => store.value[key],
      (value) => {
        store.value = { ...store.value, [key]: value }
      },
    )
  return folder(
    () => ({
      l: slider(component('l'), {
        min: 0,
        max: 1,
        step: 0.001,
        label: 'lightness (L)',
      }),
      c: slider(component('c'), {
        min: 0,
        max: 0.4,
        step: 0.001,
        label: 'chroma (C)',
      }),
      h: slider(component('h'), {
        min: 0,
        max: 360,
        step: 0.1,
        label: 'hue (H)',
      }),
    }),
    opts,
  )
}

/** A hex string (`#rrggbb`) bound as a color picker — for state authored/copied
 * as hex (e.g. a gradient's palette stops). */
export function hexColor(store: ValueRef<string>, opts?: { label?: string }): DebugField {
  return {
    kind: 'hexColor',
    value: store.value,
    ...opts,
    write: (v) => {
      store.value = v
    },
  }
}

export function enumField(
  store: ValueRef<number>,
  options: Record<string, number>,
  opts?: { label?: string; rebuildOnChange?: boolean },
): DebugField {
  return {
    kind: 'enum',
    value: store.value,
    options,
    ...opts,
    write: (v) => {
      store.value = v
    },
  }
}

/** A string dropdown — `options` maps label → value (both strings). */
export function select(store: ValueRef<string>, options: Record<string, string>, opts?: { label?: string }): DebugField {
  return {
    kind: 'select',
    value: store.value,
    options,
    ...opts,
    write: (v) => {
      store.value = v
    },
  }
}

export function bool(store: ValueRef<boolean>, opts?: { label?: string; rebuildOnChange?: boolean }): DebugField {
  return {
    kind: 'bool',
    value: store.value,
    ...opts,
    write: (v) => {
      store.value = v
    },
  }
}

/** The schema's current values, keyed by field name — what a "copy values"
 * button serializes. Re-read from a fresh `debugSchema()` so it reflects live
 * state, not the values captured at bind time. */
export function schemaValues(schema: DebugSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(schema)) {
    out[key] = def.kind === 'folder' ? schemaValues(def.schema()) : def.value
  }
  return out
}

/** Add a scoped JSON copy button to any schema folder. */
export function addCopyButton(folder: FolderApi, get: () => unknown): void {
  const btn = folder.addButton({ title: 'copy values' })
  btn.on('click', () => {
    const text = JSON.stringify(get(), null, 2)
    console.info(text)
    void navigator.clipboard?.writeText(text).then(
      () => {
        btn.title = 'copied ✓'
        setTimeout(() => (btn.title = 'copy values'), 1200)
      },
      () => {},
    )
  })
}

/** Tweakpane options for a field — anything `folder.addBinding` accepts. */
type BindingOptions = Parameters<FolderApi['addBinding']>[2]

function bindingOptionsFor(def: DebugField): BindingOptions {
  const label = def.label !== undefined ? { label: def.label } : {}
  if (def.kind === 'slider') {
    const opts: { min: number; max: number; step?: number; label?: string } = {
      min: def.min,
      max: def.max,
      ...label,
    }
    if (def.step !== undefined) opts.step = def.step
    return opts
  }
  if (def.kind === 'enum' || def.kind === 'select') {
    return { options: def.options, ...label }
  }
  if (def.kind === 'color') return { color: { type: 'float' }, ...label }
  return label
}

/**
 * Bind every field of a schema into `folder`, recursing into declared
 * subfolders. Controls write straight through their `write` — no per-frame
 * apply, no flattening. `onRebuild` fires when an enum/bool field marked
 * `rebuildOnChange` changes (e.g. a knob that flips a shader define).
 * `registerFrame` (if given) wires a per-frame callback used to poll `live`
 * sliders back into the pane — pass `ticker.add` from the GL layer; omit it and
 * `live` is inert (the lib stays ticker-agnostic). Returns a disposer that tears
 * the bindings, subfolders, and any frame poll down.
 */
export function bindSchema(
  folder: FolderApi,
  schema: DebugSchema,
  onRebuild?: () => void,
  registerFrame?: (fn: () => void) => () => void,
): () => void {
  const target: Record<string, number | boolean | string | RgbValue> = {}
  const cleanups: Array<() => void> = []
  let refreshing = false
  // Sliders whose value is driven externally — polled each frame below.
  const live: { field: string; read: () => number; refresh: () => void }[] = []

  for (const [field, def] of Object.entries(schema)) {
    if (def.kind === 'folder') {
      const sub = folder.addFolder({
        title: def.label ?? field,
        ...(def.expanded !== undefined ? { expanded: def.expanded } : {}),
      })
      const disposeSchema = bindSchema(sub, def.schema(), onRebuild, registerFrame)
      if (def.copy) {
        addCopyButton(sub, () => schemaValues(def.schema()))
      }
      cleanups.push(() => {
        disposeSchema()
        sub.dispose()
      })
      continue
    }
    target[field] = def.value
    const api = folder.addBinding(target, field, bindingOptionsFor(def))
    api.on('change', (ev) => {
      if (refreshing) return
      def.write(ev.value as never)
      if ((def.kind === 'enum' || def.kind === 'bool') && def.rebuildOnChange) {
        onRebuild?.()
      }
    })
    cleanups.push(() => api.dispose())
    if (def.kind === 'slider' && def.live && def.read) {
      live.push({ field, read: def.read, refresh: () => api.refresh() })
    }
  }

  // Push external changes back into the pane. Refresh only when a live value
  // actually moved, so idle folders cost nothing and a user dragging another
  // knob isn't fought by a per-frame refresh. A drag on the live slider itself
  // writes through to the same source `read()` returns, so it reads back equal
  // — no fight — while the game, when it owns the value, moves it live.
  let stopFrame: (() => void) | undefined
  if (live.length > 0 && registerFrame) {
    stopFrame = registerFrame(() => {
      const changed: typeof live = []
      for (const l of live) {
        const v = l.read()
        if (target[l.field] !== v) {
          target[l.field] = v
          changed.push(l)
        }
      }
      if (changed.length === 0) return
      refreshing = true
      try {
        for (const l of changed) l.refresh()
      } finally {
        refreshing = false
      }
    })
  }

  return () => {
    stopFrame?.()
    for (const cleanup of cleanups) cleanup()
  }
}
