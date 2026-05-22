import { useState, useEffect, useRef } from "react";

const DEFAULT_TASKS = [
  "Rough-In Wiring",
  "Panel Installation / Upgrade",
  "Service & Repair",
  "Conduit Bending & Installation",
  "Device & Fixture Installation",
  "Load Calculations",
  "Code Inspection Prep",
  "Troubleshooting & Diagnostics",
  "Generator / Transfer Switch",
  "Low Voltage / Data",
  "Trenching / Underground",
  "Safety & Lockout/Tagout",
  "Blueprint Reading",
  "Tool Maintenance",
  "Other",
];

const STORAGE_KEY = "apprenticeship_tracker_v2";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // migrate v1 data if present
    const old = localStorage.getItem("apprenticeship_tracker_v1");
    if (old) {
      const parsed = JSON.parse(old);
      return { ...parsed, customTasks: [], foremans: [], jobSites: [] };
    }
    return { entries: [], employers: [], supervisors: [], customTasks: [], foremans: [], jobSites: [] };
  } catch { return { entries: [], employers: [], supervisors: [], customTasks: [], foremans: [], jobSites: [] }; }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weekOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
}

function totalHours(entries) {
  return entries.reduce((s, e) => s + Number(e.hours || 0), 0);
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState("log");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [copyEntry, setCopyEntry] = useState(null);
  const [signModal, setSignModal] = useState(null);
  const [filterWeek, setFilterWeek] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }
  }, [toast]);

  function showToast(msg) { setToast(msg); }

  // Auto-learn new values from entries
  function learnFromEntry(entry) {
    setData(d => {
      let updated = { ...d };
      // learn custom tasks
      const allTasks = [...DEFAULT_TASKS, ...(d.customTasks || [])];
      if (entry.task && !allTasks.includes(entry.task)) {
        updated.customTasks = [...(d.customTasks || []), entry.task];
      }
      // learn employers
      if (entry.employer && !d.employers.includes(entry.employer)) {
        updated.employers = [...d.employers, entry.employer];
      }
      // learn foremans
      if (entry.foreman && entry.foreman.trim()) {
        const foremans = d.foremans || [];
        if (!foremans.includes(entry.foreman.trim())) {
          updated.foremans = [...foremans, entry.foreman.trim()];
        }
      }
      // learn supervisors names (just the name string for autocomplete)
      if (entry.supervisor && entry.supervisor.trim()) {
        const supNames = (d.supervisors || []).map(s => typeof s === "string" ? s : s.name);
        if (!supNames.includes(entry.supervisor.trim())) {
          updated.supervisors = [...(d.supervisors || []), { name: entry.supervisor.trim(), role: "Journeyman", pin: "" }];
        }
      }
      return updated;
    });
  }

  function addEntry(entry) {
    if (editId) {
      setData(d => ({ ...d, entries: d.entries.map(e => e.id === editId ? { ...entry, id: editId } : e) }));
      setEditId(null);
      showToast("Entry updated");
    } else {
      const newEntry = { ...entry, id: Date.now(), signatures: [] };
      setData(d => ({ ...d, entries: [newEntry, ...d.entries] }));
      showToast("Hours logged");
    }
    learnFromEntry(entry);
    setShowForm(false);
    setCopyEntry(null);
  }

  function deleteEntry(id) {
    if (window.confirm("Delete this entry?")) {
      setData(d => ({ ...d, entries: d.entries.filter(e => e.id !== id) }));
      showToast("Entry deleted");
    }
  }

  function duplicateEntry(entry) {
    const today = new Date().toISOString().split("T")[0];
    setCopyEntry({ ...entry, date: today });
    setEditId(null);
    setShowForm(true);
    showToast("Entry copied — update date & hours");
  }

  function addSignature(entryId, sig) {
    setData(d => ({
      ...d,
      entries: d.entries.map(e =>
        e.id === entryId
          ? { ...e, signatures: [...(e.signatures || []), { ...sig, date: new Date().toISOString() }] }
          : e
      ),
    }));
    setSignModal(null);
    showToast("Signed off");
  }

  function startEdit(entry) { setEditId(entry.id); setCopyEntry(null); setShowForm(true); }

  const weeks = [...new Set(data.entries.map(e => weekOf(e.date)))].sort((a, b) => b.localeCompare(a));
  const filteredEntries = filterWeek ? data.entries.filter(e => weekOf(e.date) === filterWeek) : data.entries;
  const totalAll = totalHours(data.entries);
  const totalPrimary = totalHours(data.entries.filter(e => e.type === "primary"));
  const totalRelated = totalHours(data.entries.filter(e => e.type === "related"));

  const allTasks = [...DEFAULT_TASKS, ...(data.customTasks || [])];

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <h2 className="sr-only">Electrical Apprenticeship Hour Tracker</h2>

      <div style={{ background: "#1a2332", padding: "1rem 1.25rem 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: 11, color: "#7a9cc0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>IBEW Apprenticeship</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#e8f0f8" }}>Hour Tracker</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#7a9cc0" }}>Total hours</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: "#f0c040" }}>{totalAll.toFixed(1)}</div>
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
          {[["log","ti-list","Log"],["weekly","ti-calendar","Weekly"],["summary","ti-chart-bar","Summary"],["settings","ti-settings","Settings"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, background: "none", border: "none", borderBottom: view === v ? "2px solid #f0c040" : "2px solid transparent",
              color: view === v ? "#f0c040" : "#7a9cc0", padding: "8px 0", fontSize: 11, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <i className={`ti ${icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1a2332", color: "#e8f0f8", padding: "10px 20px", borderRadius: 24,
          fontSize: 13, zIndex: 999, whiteSpace: "nowrap"
        }}>{toast}</div>
      )}

      <div style={{ padding: "1rem 1rem 5rem" }}>
        {view === "log" && <LogView entries={filteredEntries} weeks={weeks} filterWeek={filterWeek} setFilterWeek={setFilterWeek} onEdit={startEdit} onDelete={deleteEntry} onSign={setSignModal} onDuplicate={duplicateEntry} />}
        {view === "weekly" && <WeeklyView entries={data.entries} weeks={weeks} />}
        {view === "summary" && <SummaryView entries={data.entries} totalAll={totalAll} totalPrimary={totalPrimary} totalRelated={totalRelated} />}
        {view === "settings" && <SettingsView data={data} setData={setData} showToast={showToast} allTasks={allTasks} />}
      </div>

      {view === "log" && !showForm && (
        <button onClick={() => { setEditId(null); setCopyEntry(null); setShowForm(true); }} style={{
          position: "fixed", bottom: 24, right: 20, width: 52, height: 52, borderRadius: "50%",
          background: "#f0c040", border: "none", color: "#1a2332", fontSize: 26, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }} aria-label="Add entry">
          <i className="ti ti-plus" aria-hidden="true" />
        </button>
      )}

      {showForm && (
        <EntryForm
          data={data}
          allTasks={allTasks}
          editEntry={editId ? data.entries.find(e => e.id === editId) : copyEntry}
          isCopy={!!copyEntry && !editId}
          onSave={addEntry}
          onCancel={() => { setShowForm(false); setEditId(null); setCopyEntry(null); }}
        />
      )}

      {signModal && (
        <SignModal
          entry={data.entries.find(e => e.id === signModal)}
          supervisors={data.supervisors || []}
          onSign={sig => addSignature(signModal, sig)}
          onClose={() => setSignModal(null)}
        />
      )}
    </div>
  );
}

function LogView({ entries, weeks, filterWeek, setFilterWeek, onEdit, onDelete, onSign, onDuplicate }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const mostRecent = sorted[0] || null;

  return (
    <div>
      {/* Copy last entry banner */}
      {mostRecent && (
        <div style={{
          background: "#1a2332", borderRadius: 10, padding: "10px 14px", marginBottom: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#7a9cc0", marginBottom: 2 }}>Quick copy last entry</div>
            <div style={{ fontSize: 13, color: "#e8f0f8" }}>{mostRecent.task} · {Number(mostRecent.hours).toFixed(1)} hrs</div>
          </div>
          <button onClick={() => onDuplicate(mostRecent)} style={{
            background: "#f0c040", border: "none", color: "#1a2332", borderRadius: 8,
            padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap"
          }}>
            <i className="ti ti-copy" aria-hidden="true" /> Copy
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <i className="ti ti-filter" style={{ color: "#888", fontSize: 16 }} aria-hidden="true" />
        <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ flex: 1, fontSize: 13, padding: "8px 10px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff" }}>
          <option value="">All entries</option>
          {weeks.map(w => <option key={w} value={w}>Week of {formatDate(w)}</option>)}
        </select>
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#888" }}>
          <i className="ti ti-clipboard" style={{ fontSize: 40, display: "block", marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15 }}>No entries yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Tap + to log your first hours</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(entry => (
          <EntryCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} onSign={onSign} onDuplicate={onDuplicate} />
        ))}
      </div>
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete, onSign, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);
  const sigs = entry.signatures || [];
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden" }}>
      <div onClick={() => setExpanded(x => !x)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 2 }}>{formatDate(entry.date)}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 4 }}>{entry.task}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{entry.employer}</div>
          </div>
          <div style={{ textAlign: "right", marginLeft: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: "#f0c040" }}>{Number(entry.hours).toFixed(1)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>hrs</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: entry.type === "primary" ? "#e6f1fb" : "#eaf3de", color: entry.type === "primary" ? "#185fa5" : "#3b6d11" }}>
            {entry.type === "primary" ? "Primary" : "Related"}
          </span>
          {sigs.length > 0 && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#eaf3de", color: "#3b6d11" }}>
              <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" /> {sigs.length} sig{sigs.length > 1 ? "s" : ""}
            </span>
          )}
          <i className={`ti ti-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 14, color: "#888", marginLeft: "auto" }} aria-hidden="true" />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "0.5px solid #eee", padding: "12px 14px" }}>
          {entry.supervisor && <Row label="Supervisor" value={entry.supervisor} />}
          {entry.foreman && <Row label="Foreman" value={entry.foreman} />}
          {entry.notes && <Row label="Notes" value={entry.notes} />}
          {sigs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Sign-offs</div>
              {sigs.map((s, i) => (
                <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "#f5f5f5", borderRadius: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{s.signerName}</span>
                  <span style={{ color: "#888" }}> · {s.role}</span>
                  {s.pin && <span style={{ color: "#888" }}> · PIN verified</span>}
                  <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{new Date(s.date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => onSign(entry.id)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, background: "#1a2332", color: "#f0c040", border: "none", cursor: "pointer" }}>
              <i className="ti ti-writing" aria-hidden="true" /> Sign
            </button>
            <button onClick={() => onDuplicate(entry)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, border: "0.5px solid #ccc", background: "#fff", cursor: "pointer" }}>
              <i className="ti ti-copy" aria-hidden="true" /> Copy
            </button>
            <button onClick={() => onEdit(entry)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, border: "0.5px solid #ccc", background: "#fff", cursor: "pointer" }}>
              <i className="ti ti-edit" aria-hidden="true" /> Edit
            </button>
            <button onClick={() => onDelete(entry.id)} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, color: "#c0392b", borderColor: "#f5c6c6", background: "#fff", border: "0.5px solid #f5c6c6", cursor: "pointer" }}>
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: "#888", minWidth: 80 }}>{label}</span>
      <span style={{ color: "#111", flex: 1 }}>{value}</span>
    </div>
  );
}

function EntryForm({ data, allTasks, editEntry, isCopy, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState(editEntry ? { ...editEntry, date: isCopy ? today : editEntry.date } : {
    date: today, task: allTasks[0], type: "primary",
    hours: "", employer: data.employers[0] || "", supervisor: "", foreman: "", notes: ""
  });
  const [taskInput, setTaskInput] = useState(form.task || "");
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const taskRef = useRef(null);

  const filteredTasks = taskInput.length > 0
    ? allTasks.filter(t => t.toLowerCase().includes(taskInput.toLowerCase()))
    : allTasks;

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function selectTask(t) {
    setTaskInput(t);
    set("task", t);
    setShowTaskSuggestions(false);
  }

  function handleTaskInput(v) {
    setTaskInput(v);
    set("task", v);
    setShowTaskSuggestions(true);
  }

  function submit() {
    if (!form.date || !form.task || !form.hours || Number(form.hours) <= 0) {
      alert("Please fill in date, task, and hours.");
      return;
    }
    onSave({ ...form, task: taskInput || form.task });
  }

  const supNames = (data.supervisors || []).map(s => typeof s === "string" ? s : s.name);
  const foremans = data.foremans || [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "1.25rem 1.25rem 2rem", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {isCopy ? "Copy entry" : editEntry ? "Edit entry" : "Log hours"}
          </div>
          <button onClick={onCancel} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {isCopy && (
          <div style={{ background: "#fff9e6", border: "0.5px solid #f0c040", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#b8860b" }}>
            <i className="ti ti-copy" aria-hidden="true" /> Copied from previous entry — update date and hours as needed
          </div>
        )}

        <Lbl text="Date" />
        <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />

        <Lbl text="Task / work performed today" />
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            ref={taskRef}
            value={taskInput}
            onChange={e => handleTaskInput(e.target.value)}
            onFocus={() => setShowTaskSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTaskSuggestions(false), 150)}
            placeholder="Type or pick a task..."
            style={{ width: "100%", padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }}
          />
          {showTaskSuggestions && filteredTasks.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
              border: "0.5px solid #ccc", borderRadius: 8, zIndex: 50, maxHeight: 200,
              overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}>
              {filteredTasks.map(t => (
                <div key={t} onMouseDown={() => selectTask(t)} style={{
                  padding: "10px 14px", fontSize: 13, cursor: "pointer", borderBottom: "0.5px solid #f0f0f0",
                  background: t === taskInput ? "#f0f7ff" : "#fff", color: "#111"
                }}>{t}</div>
              ))}
              {taskInput && !allTasks.includes(taskInput) && (
                <div onMouseDown={() => selectTask(taskInput)} style={{
                  padding: "10px 14px", fontSize: 13, cursor: "pointer", color: "#185fa5",
                  background: "#f0f7ff", borderTop: "0.5px solid #ddd", fontStyle: "italic"
                }}>
                  <i className="ti ti-plus" aria-hidden="true" /> Add "{taskInput}" as new task
                </div>
              )}
            </div>
          )}
        </div>

        <Lbl text="Hour type" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[["primary", "Primary (on-the-job)"], ["related", "Related (classroom)"]].map(([val, label]) => (
            <button key={val} onClick={() => set("type", val)} style={{
              padding: "10px 8px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              background: form.type === val ? "#1a2332" : "#f5f5f5",
              color: form.type === val ? "#f0c040" : "#666",
              border: form.type === val ? "1px solid #1a2332" : "0.5px solid #ddd",
            }}>{label}</button>
          ))}
        </div>

        <Lbl text="Hours worked" />
        <input type="number" min="0.5" max="24" step="0.5" value={form.hours}
          onChange={e => set("hours", e.target.value)} placeholder="e.g. 8"
          style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />

        <Lbl text="Employer" />
        <input value={form.employer} onChange={e => set("employer", e.target.value)}
          list="employer-list" placeholder="Employer name"
          style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
        <datalist id="employer-list">
          {(data.employers || []).map(e => <option key={e} value={e} />)}
        </datalist>

        <Lbl text="Journeyman / supervisor" />
        <input value={form.supervisor} onChange={e => set("supervisor", e.target.value)}
          list="sup-list" placeholder="Name (type to autocomplete)"
          style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
        <datalist id="sup-list">
          {supNames.map(n => <option key={n} value={n} />)}
        </datalist>

        <Lbl text="Foreman" />
        <input value={form.foreman} onChange={e => set("foreman", e.target.value)}
          list="foreman-list" placeholder="Name (type to autocomplete)"
          style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
        <datalist id="foreman-list">
          {foremans.map(n => <option key={n} value={n} />)}
        </datalist>

        <Lbl text="Notes / work description" />
        <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Describe the work you did today — this becomes part of your official record..."
          rows={4}
          style={{ width: "100%", resize: "vertical", padding: "9px 10px", borderRadius: 8, border: "0.5px solid #ccc", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#111", marginBottom: 16 }} />

        <button onClick={submit} style={{ width: "100%", padding: 13, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
          {isCopy ? "Log copied entry" : editEntry ? "Save changes" : "Log hours"}
        </button>
      </div>
    </div>
  );
}

function Lbl({ text }) {
  return <div style={{ fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>{text}</div>;
}

function WeeklyView({ entries, weeks }) {
  const [selWeek, setSelWeek] = useState(weeks[0] || "");
  useEffect(() => { if (!selWeek && weeks[0]) setSelWeek(weeks[0]); }, [weeks]);
  const weekEntries = entries.filter(e => weekOf(e.date) === selWeek);
  const byTask = {};
  weekEntries.forEach(e => { byTask[e.task] = (byTask[e.task] || 0) + Number(e.hours); });
  const weekTotal = totalHours(weekEntries);
  const primaryHrs = totalHours(weekEntries.filter(e => e.type === "primary"));
  const relatedHrs = totalHours(weekEntries.filter(e => e.type === "related"));
  return (
    <div>
      <select value={selWeek} onChange={e => setSelWeek(e.target.value)} style={{ width: "100%", marginBottom: 14, fontSize: 14, padding: "9px 10px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff" }}>
        {weeks.map(w => <option key={w} value={w}>Week of {formatDate(w)}</option>)}
        {weeks.length === 0 && <option>No entries yet</option>}
      </select>
      {selWeek && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          <StatCard label="Total" value={weekTotal.toFixed(1)} unit="hrs" color="#f0c040" />
          <StatCard label="Primary" value={primaryHrs.toFixed(1)} unit="hrs" color="#5dcaa5" />
          <StatCard label="Related" value={relatedHrs.toFixed(1)} unit="hrs" color="#7f77dd" />
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>Hours by task</div>
          {Object.keys(byTask).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "#888", fontSize: 13 }}>No entries this week</div>}
          {Object.entries(byTask).sort((a, b) => b[1] - a[1]).map(([task, hrs]) => (
            <div key={task} style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#111" }}>{task}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: "#f0f0f0", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (hrs / weekTotal) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 36, textAlign: "right" }}>{hrs.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>Daily breakdown</div>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => {
            const dayIdx = i === 6 ? 0 : i + 1;
            const dayHrs = totalHours(weekEntries.filter(e => new Date(e.date + "T00:00:00").getDay() === dayIdx));
            return (
              <div key={day} style={{ padding: "9px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: dayHrs > 0 ? "#111" : "#aaa", minWidth: 36 }}>{day}</span>
                {dayHrs > 0
                  ? <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <div style={{ width: 80, height: 4, borderRadius: 2, background: "#f0f0f0" }}>
                        <div style={{ width: `${Math.min(100, (dayHrs / 10) * 100)}%`, height: "100%", background: "#5dcaa5", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, minWidth: 48, textAlign: "right" }}>{dayHrs.toFixed(1)} hrs</span>
                    </div>
                  : <span style={{ fontSize: 12, color: "#aaa" }}>—</span>}
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}

function StatCard({ label, value, unit, color }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #ddd", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#888" }}>{unit}</div>
    </div>
  );
}

function SummaryView({ entries, totalAll, totalPrimary, totalRelated }) {
  const NC_LIMITED = 3000, NC_PRIMARY = 2000;
  const byCategory = {}, byEmployer = {};
  entries.forEach(e => { byCategory[e.task] = (byCategory[e.task] || 0) + Number(e.hours); });
  entries.forEach(e => { if (e.employer) byEmployer[e.employer] = (byEmployer[e.employer] || 0) + Number(e.hours); });
  const signed = entries.filter(e => (e.signatures || []).length > 0).length;
  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 500 }}>NC Limited License progress</div>
        <ProgressBar label="Total hours" current={totalAll} target={NC_LIMITED} color="#f0c040" />
        <ProgressBar label="Primary (on-the-job)" current={totalPrimary} target={NC_PRIMARY} color="#5dcaa5" />
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>NC requires 3,000 total hrs (min. 2,000 primary) for Limited EC license</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <StatCard label="Total entries" value={entries.length} unit="records" color="#111" />
        <StatCard label="Signed entries" value={signed} unit="records" color="#5dcaa5" />
        <StatCard label="Primary hrs" value={totalPrimary.toFixed(1)} unit="hrs" color="#5dcaa5" />
        <StatCard label="Related hrs" value={totalRelated.toFixed(1)} unit="hrs" color="#7f77dd" />
      </div>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>Hours by task type</div>
        {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([task, hrs]) => (
          <div key={task} style={{ padding: "9px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#111", flex: 1 }}>{task}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 50, height: 4, borderRadius: 2, background: "#f0f0f0" }}>
                <div style={{ width: `${Math.min(100, (hrs / Math.max(totalAll, 1)) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 40, textAlign: "right" }}>{hrs.toFixed(1)}</span>
            </div>
          </div>
        ))}
        {Object.keys(byCategory).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "#888", fontSize: 13 }}>No data yet</div>}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>Hours by employer</div>
        {Object.entries(byEmployer).sort((a, b) => b[1] - a[1]).map(([emp, hrs]) => (
          <div key={emp} style={{ padding: "9px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#111" }}>{emp}</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{hrs.toFixed(1)} hrs</span>
          </div>
        ))}
        {Object.keys(byEmployer).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "#888", fontSize: 13 }}>No data yet</div>}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target, color }) {
  const pct = Math.min(100, (current / target) * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "#111" }}>{label}</span>
        <span style={{ color: "#888" }}>{current.toFixed(0)} / {target.toLocaleString()} hrs ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#f0f0f0", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function SignModal({ entry, supervisors, onSign, onClose }) {
  const [form, setForm] = useState({ signerName: "", role: "Journeyman", pin: "" });
  const [step, setStep] = useState("info");
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function proceed() {
    if (!form.signerName) { alert("Please enter your name."); return; }
    const sup = supervisors.find(s => (typeof s === "string" ? s : s.name) === form.signerName);
    if (sup && sup.pin) { setStep("pin"); } else { onSign({ signerName: form.signerName, role: form.role, pin: false }); }
  }
  function verifyPin() {
    const sup = supervisors.find(s => (typeof s === "string" ? s : s.name) === form.signerName);
    if (sup && sup.pin === form.pin) { onSign({ signerName: form.signerName, role: form.role, pin: true }); }
    else { alert("Incorrect PIN."); }
  }
  const supNames = supervisors.map(s => typeof s === "string" ? s : s.name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "1.25rem", width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Sign off on entry</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#888" }} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        {entry && <div style={{ fontSize: 12, background: "#f5f5f5", borderRadius: 8, padding: "8px 10px", marginBottom: 14, color: "#888" }}>{formatDate(entry.date)} · {entry.task} · {Number(entry.hours).toFixed(1)} hrs</div>}
        {step === "info" && <>
          <Lbl text="Your name" />
          <input value={form.signerName} onChange={e => set("signerName", e.target.value)} list="signer-list" placeholder="Full name" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          <datalist id="signer-list">{supNames.map(n => <option key={n} value={n} />)}</datalist>
          <Lbl text="Your role" />
          <select value={form.role} onChange={e => set("role", e.target.value)} style={{ width: "100%", marginBottom: 16, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }}>
            {["Journeyman", "Foreman", "Master Electrician", "Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}
          </select>
          <button onClick={proceed} style={{ width: "100%", padding: 11, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>Continue</button>
        </>}
        {step === "pin" && <>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>A PIN is registered for <strong>{form.signerName}</strong>. Enter it to verify.</div>
          <Lbl text="4-digit PIN" />
          <input type="password" maxLength={4} inputMode="numeric" value={form.pin} onChange={e => set("pin", e.target.value)} placeholder="••••" style={{ width: "100%", marginBottom: 16, padding: "9px 10px", fontSize: 18, border: "0.5px solid #ccc", borderRadius: 8, letterSpacing: "0.3em", textAlign: "center" }} />
          <button onClick={verifyPin} style={{ width: "100%", padding: 11, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>Verify & sign</button>
        </>}
      </div>
    </div>
  );
}

function SettingsView({ data, setData, showToast, allTasks }) {
  const [newEmp, setNewEmp] = useState("");
  const [newSup, setNewSup] = useState({ name: "", role: "Journeyman", pin: "" });

  function addEmployer() {
    if (!newEmp.trim()) return;
    if (data.employers.includes(newEmp.trim())) { showToast("Already exists"); return; }
    setData(d => ({ ...d, employers: [...d.employers, newEmp.trim()] }));
    setNewEmp(""); showToast("Employer added");
  }
  function removeEmployer(emp) { setData(d => ({ ...d, employers: d.employers.filter(e => e !== emp) })); }
  function addSupervisor() {
    if (!newSup.name.trim()) return;
    setData(d => ({ ...d, supervisors: [...(d.supervisors || []), { ...newSup, name: newSup.name.trim() }] }));
    setNewSup({ name: "", role: "Journeyman", pin: "" }); showToast("Supervisor added");
  }
  function removeSupervisor(name) { setData(d => ({ ...d, supervisors: (d.supervisors || []).filter(s => (typeof s === "string" ? s : s.name) !== name) })); }
  function removeCustomTask(task) { setData(d => ({ ...d, customTasks: (d.customTasks || []).filter(t => t !== task) })); }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `apprenticeship_hours_${new Date().toISOString().split("T")[0]}.json`;
    a.click(); URL.revokeObjectURL(url); showToast("Exported");
  }
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { try { const imp = JSON.parse(ev.target.result); if (imp.entries) { setData(imp); showToast("Imported"); } else alert("Invalid file."); } catch { alert("Could not read file."); } };
    reader.readAsText(file);
  }
  function clearAll() {
    if (window.confirm("Delete ALL entries? This cannot be undone.")) { setData(d => ({ ...d, entries: [] })); showToast("Cleared"); }
  }

  const customTasks = data.customTasks || [];
  const supList = (data.supervisors || []).map(s => typeof s === "string" ? { name: s, role: "Journeyman", pin: "" } : s);

  return (
    <div>
      <Sec title="Custom tasks (auto-learned from entries)">
        {customTasks.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No custom tasks yet — they'll appear here automatically when you type a new task while logging hours</div>}
        {customTasks.map(t => (
          <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}>
            <span>{t}</span>
            <button onClick={() => removeCustomTask(t)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button>
          </div>
        ))}
      </Sec>

      <Sec title="Employers">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={newEmp} onChange={e => setNewEmp(e.target.value)} placeholder="Employer name" style={{ flex: 1, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} onKeyDown={e => e.key === "Enter" && addEmployer()} />
          <button onClick={addEmployer} style={{ padding: "8px 14px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Add</button>
        </div>
        {data.employers.map(emp => (
          <div key={emp} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}>
            <span>{emp}</span>
            <button onClick={() => removeEmployer(emp)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button>
          </div>
        ))}
        {data.employers.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No employers added</div>}
      </Sec>

      <Sec title="Supervisors / journeymen">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <input value={newSup.name} onChange={e => setNewSup(s => ({ ...s, name: e.target.value }))} placeholder="Full name" style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          <select value={newSup.role} onChange={e => setNewSup(s => ({ ...s, role: e.target.value }))} style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }}>
            {["Journeyman", "Foreman", "Master Electrician", "Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}
          </select>
          <input type="password" maxLength={4} inputMode="numeric" value={newSup.pin} onChange={e => setNewSup(s => ({ ...s, pin: e.target.value }))} placeholder="4-digit PIN (optional)" style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          <button onClick={addSupervisor} style={{ padding: "9px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Add supervisor</button>
        </div>
        {supList.map(sup => (
          <div key={sup.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}>
            <div><div style={{ fontWeight: 500 }}>{sup.name}</div><div style={{ fontSize: 11, color: "#888" }}>{sup.role}{sup.pin ? " · PIN set" : ""}</div></div>
            <button onClick={() => removeSupervisor(sup.name)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button>
          </div>
        ))}
        {supList.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No supervisors added</div>}
      </Sec>

      <Sec title="Data management">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={exportData} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
            <i className="ti ti-download" style={{ fontSize: 18 }} aria-hidden="true" /> Export all data (JSON backup)
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "11px 14px", border: "0.5px solid #ccc", borderRadius: 8, cursor: "pointer", background: "#fff" }}>
            <i className="ti ti-upload" style={{ fontSize: 18 }} aria-hidden="true" /> Import from backup
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
          <button onClick={clearAll} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#c0392b", border: "0.5px solid #f5c6c6", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
            <i className="ti ti-trash" style={{ fontSize: 18 }} aria-hidden="true" /> Clear all entries
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 12 }}>Tip: Export a backup regularly and save to iCloud or Google Drive.</div>
      </Sec>
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", marginBottom: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>{title}</div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}
