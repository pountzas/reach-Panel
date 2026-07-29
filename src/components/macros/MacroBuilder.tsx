import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "../../lib/uuid";
import { useAppStore, getMacroSteps } from "../../stores/appStore";
import { INTERNAL_PROFILE_ID, type MacroDef, type MacroStep } from "../../lib/types";

export function MacroBuilder() {
  const {
    macros,
    loadMacros,
    saveActiveProfile,
    setShowMacroBuilder,
  } = useAppStore();
  const [name, setName] = useState("Open YouTube");
  const [steps, setSteps] = useState<MacroStep[]>([]);
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");

  useEffect(() => {
    if (macros.length > 0) {
      loadMacroSteps(macros[0].id);
    }
  }, [macros]);

  const loadMacroSteps = async (macroId: string) => {
    const loaded = await getMacroSteps(macroId);
    setSteps(loaded);
    const macro = macros.find((m) => m.id === macroId);
    if (macro) setName(macro.name);
  };

  const addStep = (actionType: string, payload: Record<string, unknown>) => {
    if (macros.length === 0) return;
    const macroId = macros[0]?.id ?? uuidv4();
    setSteps((prev) => [
      ...prev,
      {
        id: uuidv4(),
        macro_id: macroId,
        step_order: prev.length,
        action_type: actionType,
        payload_json: JSON.stringify(payload),
      },
    ]);
  };

  const save = async () => {
    const macroDef: MacroDef = {
      id: macros[0]?.id ?? uuidv4(),
      profile_id: INTERNAL_PROFILE_ID,
      name,
    };
    await invoke("cmd_save_macro", {
      payload: { macroDef, steps },
    });
    await loadMacros();
    await saveActiveProfile();
  };

  const run = async () => {
    if (macros[0]) {
      await invoke("cmd_run_macro", { macroId: macros[0].id });
    }
  };

  const doExport = async () => {
    if (!macros[0]) return;
    const json = await invoke<string>("cmd_export_macro", {
      macroId: macros[0].id,
    });
    setExportJson(json);
  };

  const doImport = async () => {
    await invoke("cmd_import_macro", { json: importJson });
    await loadMacros();
    await saveActiveProfile();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-bold">Macro Builder</h2>
        <button type="button" onClick={() => setShowMacroBuilder(false)}>
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <input
          className="mb-3 w-full rounded border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Macro name"
        />

        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => addStep("open_program", { target: "chrome" })}>
            + Open Chrome
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => addStep("wait", { ms: 2000 })}>
            + Wait 2s
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => addStep("open_url", { url: "https://youtube.com" })}>
            + Open YouTube
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1 text-sm" onClick={() => addStep("speak", { text: "Opening YouTube" })}>
            + Speak
          </button>
        </div>

        <ol className="mb-4 space-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={s.id} className="rounded bg-slate-50 px-2 py-1">
              {i + 1}. {s.action_type}: {s.payload_json}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={save}>
            Save
          </button>
          <button type="button" className="rounded-lg bg-green-600 px-4 py-2 text-white" onClick={run}>
            Run
          </button>
          <button type="button" className="rounded-lg bg-slate-200 px-4 py-2" onClick={doExport}>
            Export
          </button>
        </div>

        {exportJson && (
          <textarea className="mt-3 w-full rounded border p-2 text-xs" rows={4} readOnly value={exportJson} />
        )}

        <textarea
          className="mt-3 w-full rounded border p-2 text-xs"
          rows={3}
          placeholder="Paste JSON to import"
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
        />
        <button type="button" className="mt-2 rounded-lg bg-slate-200 px-4 py-2" onClick={doImport}>
          Import
        </button>
      </div>
    </div>
  );
}
