import { useState, useEffect, useRef } from "react";

const CLIENT_ID = "929352655035-nsr6ds3hpb8e2hpbblls6ocq2snit9ud.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = "apprenticeship_data.json";

const DEFAULT_TASKS = [
  "Rough-In Wiring","Panel Installation / Upgrade","Service & Repair",
  "Conduit Bending & Installation","Device & Fixture Installation","Load Calculations",
  "Code Inspection Prep","Troubleshooting & Diagnostics","Generator / Transfer Switch",
  "Low Voltage / Data","Trenching / Underground","Safety & Lockout/Tagout",
  "Blueprint Reading","Tool Maintenance","Other",
];

const STORAGE_KEY = "apprenticeship_tracker_v2";
const EMPTY = { entries: [], employers: [], supervisors: [], customTasks: [], foremans: [], jobSites: [] };

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem("apprenticeship_tracker_v1");
    if (old) { const p = JSON.parse(old); return { ...p, customTasks: [], foremans: [], jobSites: [] }; }
    return EMPTY;
  } catch { return EMPTY; }
}

function saveLocal(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weekOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(new Date(dateStr + "T00:00:00").setDate(diff)).toISOString().split("T")[0];
}

function totalHours(entries) {
  return entries.reduce((s, e) => s + Number(e.hours || 0), 0);
}

// ── Google Drive helpers ──────────────────────────────────────────────────────

function loadGapi() {
  return new Promise((resolve) => {
    if (window.gapi) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => window.gapi.load("client", resolve);
    document.head.appendChild(s);
  });
}

function loadGis() {
  return new Promise((resolve) => {
    if (window.google?.accounts) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

async function initGapi() {
  await window.gapi.client.init({
    apiKey: "",
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
}

async function findFile(token) {
  const res = await window.gapi.client.drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${FILE_NAME}'`,
    fields: "files(id, name)",
    oauth_token: token,
  });
  return res.result.files?.[0] || null;
}

async function readFile(fileId, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function writeFile(data, token, fileId = null) {
  const body = JSON.stringify(data, null, 2);
  const blob = new Blob([body], { type: "application/json" });
  const meta = JSON.stringify(fileId ? {} : { name: FILE_NAME, parents: ["appDataFolder"] });
  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", blob);
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const res = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState(loadLocal);
  const [view, setView] = useState("log");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [copyEntry, setCopyEntry] = useState(null);
  const [signModal, setSignModal] = useState(null);
  const [filterWeek, setFilterWeek] = useState("");
  const [toast, setToast] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error
  const [token, setToken] = useState(null);
  const [driveFileId, setDriveFileId] = useState(null);
  const [gapiReady, setGapiReady] = useState(false);
  const tokenClientRef = useRef(null);
  const pendingSave = useRef(null);

  // Boot Google APIs
  useEffect(() => {
    Promise.all([loadGapi(), loadGis()]).then(async () => {
      await initGapi();
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: async (resp) => {
          if (resp.error) { setSyncStatus("error"); return; }
          setToken(resp.access_token);
        },
      });
      setGapiReady(true);
      // auto sign-in if we have a cached token hint
      const cached = sessionStorage.getItem("gd_token");
      if (cached) setToken(cached);
    });
  }, []);

  // When token arrives, sync from Drive
  useEffect(() => {
    if (!token) return;
    sessionStorage.setItem("gd_token", token);
    syncFromDrive(token);
  }, [token]);

  // Save to local storage whenever data changes
  useEffect(() => { saveLocal(data); }, [data]);

  // Save to Drive whenever data changes (debounced 2s)
  useEffect(() => {
    if (!token) return;
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => syncToDrive(token, data), 2000);
    return () => clearTimeout(pendingSave.current);
  }, [data, token]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }
  }, [toast]);

  function showToast(msg) { setToast(msg); }

  async function syncFromDrive(tok) {
    setSyncStatus("syncing");
    try {
      const file = await findFile(tok);
      if (file) {
        setDriveFileId(file.id);
        const driveData = await readFile(file.id, tok);
        if (driveData?.entries) {
          setData(driveData);
          saveLocal(driveData);
          setSyncStatus("synced");
          showToast("Synced from Google Drive");
        }
      } else {
        // First time — upload local data to Drive
        const created = await writeFile(data, tok);
        setDriveFileId(created.id);
        setSyncStatus("synced");
        showToast("Data saved to Google Drive");
      }
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
      showToast("Sync error — working offline");
    }
  }

  async function syncToDrive(tok, d) {
    if (!tok) return;
    setSyncStatus("syncing");
    try {
      let fid = driveFileId;
      if (!fid) {
        const file = await findFile(tok);
        fid = file?.id;
        if (fid) setDriveFileId(fid);
      }
      await writeFile(d, tok, fid || undefined);
      if (!fid) {
        const file2 = await findFile(tok);
        if (file2) setDriveFileId(file2.id);
      }
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  function signIn() {
    if (!gapiReady) { showToast("Still loading — try again in a moment"); return; }
    tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
  }

  function signOut() {
    if (token) window.google?.accounts.oauth2.revoke(token);
    setToken(null);
    sessionStorage.removeItem("gd_token");
    setSyncStatus("idle");
    showToast("Signed out of Google");
  }

  function learnFromEntry(entry) {
    setData(d => {
      let u = { ...d };
      const allTasks = [...DEFAULT_TASKS, ...(d.customTasks || [])];
      if (entry.task && !allTasks.includes(entry.task)) u.customTasks = [...(d.customTasks || []), entry.task];
      if (entry.employer && !d.employers.includes(entry.employer)) u.employers = [...d.employers, entry.employer];
      if (entry.foreman?.trim()) { const f = d.foremans || []; if (!f.includes(entry.foreman.trim())) u.foremans = [...f, entry.foreman.trim()]; }
      if (entry.supervisor?.trim()) {
        const sn = (d.supervisors || []).map(s => typeof s === "string" ? s : s.name);
        if (!sn.includes(entry.supervisor.trim())) u.supervisors = [...(d.supervisors || []), { name: entry.supervisor.trim(), role: "Journeyman", pin: "" }];
      }
      return u;
    });
  }

  function addEntry(entry) {
    if (editId) {
      setData(d => ({ ...d, entries: d.entries.map(e => e.id === editId ? { ...entry, id: editId } : e) }));
      setEditId(null); showToast("Entry updated");
    } else {
      setData(d => ({ ...d, entries: [{ ...entry, id: Date.now(), signatures: [] }, ...d.entries] }));
      showToast("Hours logged");
    }
    learnFromEntry(entry); setShowForm(false); setCopyEntry(null);
  }

  function deleteEntry(id) {
    if (window.confirm("Delete this entry?")) { setData(d => ({ ...d, entries: d.entries.filter(e => e.id !== id) })); showToast("Entry deleted"); }
  }

  function duplicateEntry(entry) {
    setCopyEntry({ ...entry, date: new Date().toISOString().split("T")[0] });
    setEditId(null); setShowForm(true); showToast("Entry copied — update date & hours");
  }

  function addSignature(entryId, sig) {
    setData(d => ({ ...d, entries: d.entries.map(e => e.id === entryId ? { ...e, signatures: [...(e.signatures || []), { ...sig, date: new Date().toISOString() }] } : e) }));
    setSignModal(null); showToast("Signed off");
  }

  function startEdit(entry) { setEditId(entry.id); setCopyEntry(null); setShowForm(true); }

  const weeks = [...new Set(data.entries.map(e => weekOf(e.date)))].sort((a, b) => b.localeCompare(a));
  const filteredEntries = filterWeek ? data.entries.filter(e => weekOf(e.date) === filterWeek) : data.entries;
  const totalAll = totalHours(data.entries);
  const totalPrimary = totalHours(data.entries.filter(e => e.type === "primary"));
  const totalRelated = totalHours(data.entries.filter(e => e.type === "related"));
  const allTasks = [...DEFAULT_TASKS, ...(data.customTasks || [])];

  const syncColor = syncStatus === "synced" ? "#5dcaa5" : syncStatus === "syncing" ? "#f0c040" : syncStatus === "error" ? "#e74c3c" : "#7a9cc0";
  const syncIcon = syncStatus === "synced" ? "ti-cloud-check" : syncStatus === "syncing" ? "ti-loader-2" : syncStatus === "error" ? "ti-cloud-off" : "ti-cloud";
  const syncLabel = syncStatus === "synced" ? "Synced" : syncStatus === "syncing" ? "Syncing..." : syncStatus === "error" ? "Sync error" : "Not synced";

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <h2 className="sr-only">Electrical Apprenticeship Hour Tracker</h2>

      {/* Header */}
      <div style={{ background: "#1a2332", padding: "1rem 1.25rem 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: 11, color: "#7a9cc0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>IBEW Apprenticeship</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#e8f0f8" }}>Hour Tracker</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#7a9cc0" }}>Total hours</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: "#f0c040" }}>{totalAll.toFixed(1)}</div>
            </div>
            {/* Sync status pill */}
            <div onClick={token ? undefined : signIn} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px", cursor: token ? "default" : "pointer" }}>
              <i className={`ti ${syncIcon}`} style={{ fontSize: 13, color: syncColor, animation: syncStatus === "syncing" ? "spin 1s linear infinite" : "none" }} aria-hidden="true" />
              <span style={{ fontSize: 11, color: syncColor }}>{token ? syncLabel : "Sign in to sync"}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", borderTop: "0.5px solid rgba(255,255,255,0.1)" }}>
          {[["log","ti-list","Log"],["weekly","ti-calendar","Weekly"],["summary","ti-chart-bar","Summary"],["settings","ti-settings","Settings"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, background: "none", border: "none", borderBottom: view === v ? "2px solid #f0c040" : "2px solid transparent", color: view === v ? "#f0c040" : "#7a9cc0", padding: "8px 0", fontSize: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 18 }} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a2332", color: "#e8f0f8", padding: "10px 20px", borderRadius: 24, fontSize: 13, zIndex: 999, whiteSpace: "nowrap" }}>{toast}</div>}

      <div style={{ padding: "1rem 1rem 5rem" }}>
        {view === "log" && <LogView entries={filteredEntries} weeks={weeks} filterWeek={filterWeek} setFilterWeek={setFilterWeek} onEdit={startEdit} onDelete={deleteEntry} onSign={setSignModal} onDuplicate={duplicateEntry} />}
        {view === "weekly" && <WeeklyView entries={data.entries} weeks={weeks} />}
        {view === "summary" && <SummaryView entries={data.entries} totalAll={totalAll} totalPrimary={totalPrimary} totalRelated={totalRelated} />}
        {view === "settings" && <SettingsView data={data} setData={setData} showToast={showToast} allTasks={allTasks} token={token} signIn={signIn} signOut={signOut} syncStatus={syncStatus} onManualSync={() => token && syncFromDrive(token)} />}
      </div>

      {view === "log" && !showForm && (
        <button onClick={() => { setEditId(null); setCopyEntry(null); setShowForm(true); }} style={{ position: "fixed", bottom: 24, right: 20, width: 52, height: 52, borderRadius: "50%", background: "#f0c040", border: "none", color: "#1a2332", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} aria-label="Add entry">
          <i className="ti ti-plus" aria-hidden="true" />
        </button>
      )}

      {showForm && <EntryForm data={data} allTasks={allTasks} editEntry={editId ? data.entries.find(e => e.id === editId) : copyEntry} isCopy={!!copyEntry && !editId} onSave={addEntry} onCancel={() => { setShowForm(false); setEditId(null); setCopyEntry(null); }} />}
      {signModal && <SignModal entry={data.entries.find(e => e.id === signModal)} supervisors={data.supervisors || []} onSign={sig => addSignature(signModal, sig)} onClose={() => setSignModal(null)} />}
    </div>
  );
}

function LogView({ entries, weeks, filterWeek, setFilterWeek, onEdit, onDelete, onSign, onDuplicate }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const mostRecent = sorted[0] || null;
  return (
    <div>
      {mostRecent && (
        <div style={{ background: "#1a2332", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 11, color: "#7a9cc0", marginBottom: 2 }}>Quick copy last entry</div><div style={{ fontSize: 13, color: "#e8f0f8" }}>{mostRecent.task} · {Number(mostRecent.hours).toFixed(1)} hrs</div></div>
          <button onClick={() => onDuplicate(mostRecent)} style={{ background: "#f0c040", border: "none", color: "#1a2332", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
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
      {sorted.length === 0 && <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#888" }}><i className="ti ti-clipboard" style={{ fontSize: 40, display: "block", marginBottom: 12 }} aria-hidden="true" /><div style={{ fontSize: 15 }}>No entries yet</div><div style={{ fontSize: 13, marginTop: 4 }}>Tap + to log your first hours</div></div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(entry => <EntryCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} onSign={onSign} onDuplicate={onDuplicate} />)}
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
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: entry.type === "primary" ? "#e6f1fb" : "#eaf3de", color: entry.type === "primary" ? "#185fa5" : "#3b6d11" }}>{entry.type === "primary" ? "Primary" : "Related"}</span>
          {sigs.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#eaf3de", color: "#3b6d11" }}><i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" /> {sigs.length} sig{sigs.length > 1 ? "s" : ""}</span>}
          <i className={`ti ti-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 14, color: "#888", marginLeft: "auto" }} aria-hidden="true" />
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "0.5px solid #eee", padding: "12px 14px" }}>
          {entry.supervisor && <Row label="Supervisor" value={entry.supervisor} />}
          {entry.foreman && <Row label="Foreman" value={entry.foreman} />}
          {entry.notes && <Row label="Notes" value={entry.notes} />}
          {sigs.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Sign-offs</div>{sigs.map((s, i) => <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "#f5f5f5", borderRadius: 8, marginBottom: 4 }}><span style={{ fontWeight: 500 }}>{s.signerName}</span><span style={{ color: "#888" }}> · {s.role}</span>{s.pin && <span style={{ color: "#888" }}> · PIN verified</span>}<div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{new Date(s.date).toLocaleDateString()}</div></div>)}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => onSign(entry.id)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, background: "#1a2332", color: "#f0c040", border: "none", cursor: "pointer" }}><i className="ti ti-writing" aria-hidden="true" /> Sign</button>
            <button onClick={() => onDuplicate(entry)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, border: "0.5px solid #ccc", background: "#fff", cursor: "pointer" }}><i className="ti ti-copy" aria-hidden="true" /> Copy</button>
            <button onClick={() => onEdit(entry)} style={{ flex: 1, fontSize: 12, padding: "8px 4px", borderRadius: 8, border: "0.5px solid #ccc", background: "#fff", cursor: "pointer" }}><i className="ti ti-edit" aria-hidden="true" /> Edit</button>
            <button onClick={() => onDelete(entry.id)} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, color: "#c0392b", border: "0.5px solid #f5c6c6", background: "#fff", cursor: "pointer" }}><i className="ti ti-trash" aria-hidden="true" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 13 }}><span style={{ color: "#888", minWidth: 80 }}>{label}</span><span style={{ color: "#111", flex: 1 }}>{value}</span></div>;
}

function EntryForm({ data, allTasks, editEntry, isCopy, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState(editEntry ? { ...editEntry, date: isCopy ? today : editEntry.date } : { date: today, task: allTasks[0], type: "primary", hours: "", employer: data.employers[0] || "", supervisor: "", foreman: "", notes: "" });
  const [taskInput, setTaskInput] = useState(form.task || "");
  const [showSug, setShowSug] = useState(false);
  const filteredTasks = taskInput.length > 0 ? allTasks.filter(t => t.toLowerCase().includes(taskInput.toLowerCase())) : allTasks;
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function selectTask(t) { setTaskInput(t); set("task", t); setShowSug(false); }
  function submit() { if (!form.date || !form.task || !form.hours || Number(form.hours) <= 0) { alert("Please fill in date, task, and hours."); return; } onSave({ ...form, task: taskInput || form.task }); }
  const supNames = (data.supervisors || []).map(s => typeof s === "string" ? s : s.name);
  const foremans = data.foremans || [];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "1.25rem 1.25rem 2rem", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{isCopy ? "Copy entry" : editEntry ? "Edit entry" : "Log hours"}</div>
          <button onClick={onCancel} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        {isCopy && <div style={{ background: "#fff9e6", border: "0.5px solid #f0c040", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#b8860b" }}><i className="ti ti-copy" aria-hidden="true" /> Copied — update date and hours as needed</div>}
        <Lbl text="Date" /><input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
        <Lbl text="Task / work performed today" />
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input value={taskInput} onChange={e => { setTaskInput(e.target.value); set("task", e.target.value); setShowSug(true); }} onFocus={() => setShowSug(true)} onBlur={() => setTimeout(() => setShowSug(false), 150)} placeholder="Type or pick a task..." style={{ width: "100%", padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          {showSug && filteredTasks.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "0.5px solid #ccc", borderRadius: 8, zIndex: 50, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
              {filteredTasks.map(t => <div key={t} onMouseDown={() => selectTask(t)} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", borderBottom: "0.5px solid #f0f0f0", background: t === taskInput ? "#f0f7ff" : "#fff" }}>{t}</div>)}
              {taskInput && !allTasks.includes(taskInput) && <div onMouseDown={() => selectTask(taskInput)} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", color: "#185fa5", background: "#f0f7ff", borderTop: "0.5px solid #ddd", fontStyle: "italic" }}><i className="ti ti-plus" aria-hidden="true" /> Add "{taskInput}"</div>}
            </div>
          )}
        </div>
        <Lbl text="Hour type" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[["primary","Primary (on-the-job)"],["related","Related (classroom)"]].map(([val, label]) => (
            <button key={val} onClick={() => set("type", val)} style={{ padding: "10px 8px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: form.type === val ? "#1a2332" : "#f5f5f5", color: form.type === val ? "#f0c040" : "#666", border: form.type === val ? "1px solid #1a2332" : "0.5px solid #ddd" }}>{label}</button>
          ))}
        </div>
        <Lbl text="Hours worked" /><input type="number" min="0.5" max="24" step="0.5" value={form.hours} onChange={e => set("hours", e.target.value)} placeholder="e.g. 8" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
        <Lbl text="Employer" /><input value={form.employer} onChange={e => set("employer", e.target.value)} list="employer-list" placeholder="Employer name" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} /><datalist id="employer-list">{(data.employers || []).map(e => <option key={e} value={e} />)}</datalist>
        <Lbl text="Journeyman / supervisor" /><input value={form.supervisor} onChange={e => set("supervisor", e.target.value)} list="sup-list" placeholder="Name" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} /><datalist id="sup-list">{supNames.map(n => <option key={n} value={n} />)}</datalist>
        <Lbl text="Foreman" /><input value={form.foreman} onChange={e => set("foreman", e.target.value)} list="foreman-list" placeholder="Name (optional)" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} /><datalist id="foreman-list">{foremans.map(n => <option key={n} value={n} />)}</datalist>
        <Lbl text="Notes / work description" /><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Describe the work you did today..." rows={4} style={{ width: "100%", resize: "vertical", padding: "9px 10px", borderRadius: 8, border: "0.5px solid #ccc", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#111", marginBottom: 16 }} />
        <button onClick={submit} style={{ width: "100%", padding: 13, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: "pointer" }}>{isCopy ? "Log copied entry" : editEntry ? "Save changes" : "Log hours"}</button>
      </div>
    </div>
  );
}

function Lbl({ text }) { return <div style={{ fontSize: 12, color: "#888", marginBottom: 5, fontWeight: 500 }}>{text}</div>; }

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
              <span style={{ fontSize: 13 }}>{task}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: "#f0f0f0" }}><div style={{ width: `${Math.min(100, (hrs / weekTotal) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} /></div>
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
            return <div key={day} style={{ padding: "9px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: dayHrs > 0 ? "#111" : "#aaa", minWidth: 36 }}>{day}</span>
              {dayHrs > 0 ? <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}><div style={{ width: 80, height: 4, borderRadius: 2, background: "#f0f0f0" }}><div style={{ width: `${Math.min(100, (dayHrs / 10) * 100)}%`, height: "100%", background: "#5dcaa5", borderRadius: 2 }} /></div><span style={{ fontSize: 13, fontWeight: 500, minWidth: 48, textAlign: "right" }}>{dayHrs.toFixed(1)} hrs</span></div> : <span style={{ fontSize: 12, color: "#aaa" }}>—</span>}
            </div>;
          })}
        </div>
      </>}
    </div>
  );
}

function StatCard({ label, value, unit, color }) {
  return <div style={{ background: "#fff", border: "0.5px solid #ddd", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}><div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 500, color }}>{value}</div><div style={{ fontSize: 11, color: "#888" }}>{unit}</div></div>;
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
            <span style={{ fontSize: 12, flex: 1 }}>{task}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 50, height: 4, borderRadius: 2, background: "#f0f0f0" }}><div style={{ width: `${Math.min(100, (hrs / Math.max(totalAll, 1)) * 100)}%`, height: "100%", background: "#f0c040", borderRadius: 2 }} /></div><span style={{ fontSize: 12, fontWeight: 500, minWidth: 40, textAlign: "right" }}>{hrs.toFixed(1)}</span></div>
          </div>
        ))}
        {Object.keys(byCategory).length === 0 && <div style={{ padding: "1.5rem", textAlign: "center", color: "#888", fontSize: 13 }}>No data yet</div>}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>Hours by employer</div>
        {Object.entries(byEmployer).sort((a, b) => b[1] - a[1]).map(([emp, hrs]) => (
          <div key={emp} style={{ padding: "9px 14px", borderBottom: "0.5px solid #eee", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12 }}>{emp}</span><span style={{ fontSize: 12, fontWeight: 500 }}>{hrs.toFixed(1)} hrs</span>
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}><span>{label}</span><span style={{ color: "#888" }}>{current.toFixed(0)} / {target.toLocaleString()} hrs ({pct.toFixed(1)}%)</span></div>
      <div style={{ height: 8, borderRadius: 4, background: "#f0f0f0", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} /></div>
    </div>
  );
}

function SignModal({ entry, supervisors, onSign, onClose }) {
  const [form, setForm] = useState({ signerName: "", role: "Journeyman", pin: "" });
  const [step, setStep] = useState("info");
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function proceed() { if (!form.signerName) { alert("Please enter your name."); return; } const sup = supervisors.find(s => (typeof s === "string" ? s : s.name) === form.signerName); if (sup?.pin) { setStep("pin"); } else { onSign({ signerName: form.signerName, role: form.role, pin: false }); } }
  function verifyPin() { const sup = supervisors.find(s => (typeof s === "string" ? s : s.name) === form.signerName); if (sup?.pin === form.pin) { onSign({ signerName: form.signerName, role: form.role, pin: true }); } else { alert("Incorrect PIN."); } }
  const supNames = supervisors.map(s => typeof s === "string" ? s : s.name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "1.25rem", width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div style={{ fontSize: 15, fontWeight: 500 }}>Sign off on entry</div><button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#888" }} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button></div>
        {entry && <div style={{ fontSize: 12, background: "#f5f5f5", borderRadius: 8, padding: "8px 10px", marginBottom: 14, color: "#888" }}>{formatDate(entry.date)} · {entry.task} · {Number(entry.hours).toFixed(1)} hrs</div>}
        {step === "info" && <>
          <Lbl text="Your name" /><input value={form.signerName} onChange={e => set("signerName", e.target.value)} list="signer-list" placeholder="Full name" style={{ width: "100%", marginBottom: 12, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} /><datalist id="signer-list">{supNames.map(n => <option key={n} value={n} />)}</datalist>
          <Lbl text="Your role" /><select value={form.role} onChange={e => set("role", e.target.value)} style={{ width: "100%", marginBottom: 16, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }}>{["Journeyman","Foreman","Master Electrician","Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}</select>
          <button onClick={proceed} style={{ width: "100%", padding: 11, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>Continue</button>
        </>}
        {step === "pin" && <>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>PIN registered for <strong>{form.signerName}</strong>. Enter to verify.</div>
          <Lbl text="4-digit PIN" /><input type="password" maxLength={4} inputMode="numeric" value={form.pin} onChange={e => set("pin", e.target.value)} placeholder="••••" style={{ width: "100%", marginBottom: 16, padding: "9px 10px", fontSize: 18, border: "0.5px solid #ccc", borderRadius: 8, letterSpacing: "0.3em", textAlign: "center" }} />
          <button onClick={verifyPin} style={{ width: "100%", padding: 11, background: "#1a2332", color: "#f0c040", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>Verify & sign</button>
        </>}
      </div>
    </div>
  );
}

function SettingsView({ data, setData, showToast, allTasks, token, signIn, signOut, syncStatus, onManualSync }) {
  const [newEmp, setNewEmp] = useState("");
  const [newSup, setNewSup] = useState({ name: "", role: "Journeyman", pin: "" });
  function addEmployer() { if (!newEmp.trim()) return; if (data.employers.includes(newEmp.trim())) { showToast("Already exists"); return; } setData(d => ({ ...d, employers: [...d.employers, newEmp.trim()] })); setNewEmp(""); showToast("Employer added"); }
  function removeEmployer(emp) { setData(d => ({ ...d, employers: d.employers.filter(e => e !== emp) })); }
  function addSupervisor() { if (!newSup.name.trim()) return; setData(d => ({ ...d, supervisors: [...(d.supervisors || []), { ...newSup, name: newSup.name.trim() }] })); setNewSup({ name: "", role: "Journeyman", pin: "" }); showToast("Supervisor added"); }
  function removeSupervisor(name) { setData(d => ({ ...d, supervisors: (d.supervisors || []).filter(s => (typeof s === "string" ? s : s.name) !== name) })); }
  function removeCustomTask(task) { setData(d => ({ ...d, customTasks: (d.customTasks || []).filter(t => t !== task) })); }
  function exportData() { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `apprenticeship_hours_${new Date().toISOString().split("T")[0]}.json`; a.click(); URL.revokeObjectURL(url); showToast("Exported"); }
  function importData(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const imp = JSON.parse(ev.target.result); if (imp.entries) { setData(imp); showToast("Imported"); } else alert("Invalid file."); } catch { alert("Could not read file."); } }; reader.readAsText(file); }
  function clearAll() { if (window.confirm("Delete ALL entries? This cannot be undone.")) { setData(d => ({ ...d, entries: [] })); showToast("Cleared"); } }
  const customTasks = data.customTasks || [];
  const supList = (data.supervisors || []).map(s => typeof s === "string" ? { name: s, role: "Journeyman", pin: "" } : s);
  return (
    <div>
      {/* Google Drive Sync */}
      <Sec title="Google Drive sync">
        {!token ? (
          <div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Sign in with Google to sync your data across your laptop and iPhone automatically.</div>
            <button onClick={signIn} style={{ width: "100%", padding: "11px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Sign in with Google
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#3b6d11", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-cloud-check" style={{ fontSize: 16 }} aria-hidden="true" /> Connected to Google Drive
              </div>
              <span style={{ fontSize: 11, color: "#888" }}>{syncStatus}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onManualSync} style={{ flex: 1, padding: "9px", fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}><i className="ti ti-refresh" aria-hidden="true" /> Sync now</button>
              <button onClick={signOut} style={{ flex: 1, padding: "9px", fontSize: 13, color: "#c0392b", border: "0.5px solid #f5c6c6", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Sign out</button>
            </div>
          </div>
        )}
      </Sec>

      <Sec title="Custom tasks">
        {customTasks.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>Auto-learned when you type a new task</div>}
        {customTasks.map(t => <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}><span>{t}</span><button onClick={() => removeCustomTask(t)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button></div>)}
      </Sec>

      <Sec title="Employers">
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><input value={newEmp} onChange={e => setNewEmp(e.target.value)} placeholder="Employer name" style={{ flex: 1, padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} onKeyDown={e => e.key === "Enter" && addEmployer()} /><button onClick={addEmployer} style={{ padding: "8px 14px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Add</button></div>
        {data.employers.map(emp => <div key={emp} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}><span>{emp}</span><button onClick={() => removeEmployer(emp)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button></div>)}
        {data.employers.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No employers added</div>}
      </Sec>

      <Sec title="Supervisors / journeymen">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <input value={newSup.name} onChange={e => setNewSup(s => ({ ...s, name: e.target.value }))} placeholder="Full name" style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          <select value={newSup.role} onChange={e => setNewSup(s => ({ ...s, role: e.target.value }))} style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }}>{["Journeyman","Foreman","Master Electrician","Employer / EC License Holder"].map(r => <option key={r}>{r}</option>)}</select>
          <input type="password" maxLength={4} inputMode="numeric" value={newSup.pin} onChange={e => setNewSup(s => ({ ...s, pin: e.target.value }))} placeholder="4-digit PIN (optional)" style={{ padding: "9px 10px", fontSize: 14, border: "0.5px solid #ccc", borderRadius: 8 }} />
          <button onClick={addSupervisor} style={{ padding: "9px", border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>Add supervisor</button>
        </div>
        {supList.map(sup => <div key={sup.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #eee", fontSize: 13 }}><div><div style={{ fontWeight: 500 }}>{sup.name}</div><div style={{ fontSize: 11, color: "#888" }}>{sup.role}{sup.pin ? " · PIN set" : ""}</div></div><button onClick={() => removeSupervisor(sup.name)} style={{ border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontSize: 16 }} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button></div>)}
        {supList.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No supervisors added</div>}
      </Sec>

      <Sec title="Data management">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={exportData} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, border: "0.5px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}><i className="ti ti-download" style={{ fontSize: 18 }} aria-hidden="true" /> Export all data (JSON backup)</button>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "11px 14px", border: "0.5px solid #ccc", borderRadius: 8, cursor: "pointer", background: "#fff" }}><i className="ti ti-upload" style={{ fontSize: 18 }} aria-hidden="true" /> Import from backup<input type="file" accept=".json" onChange={importData} style={{ display: "none" }} /></label>
          <button onClick={clearAll} style={{ textAlign: "left", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#c0392b", border: "0.5px solid #f5c6c6", borderRadius: 8, background: "#fff", cursor: "pointer" }}><i className="ti ti-trash" style={{ fontSize: 18 }} aria-hidden="true" /> Clear all entries</button>
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 12 }}>Tip: Export a backup regularly even with Drive sync enabled.</div>
      </Sec>
    </div>
  );
}

function Sec({ title, children }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #ddd", marginBottom: 12, overflow: "hidden" }}><div style={{ padding: "10px 14px", borderBottom: "0.5px solid #eee", fontSize: 12, color: "#888", fontWeight: 500 }}>{title}</div><div style={{ padding: "12px 14px" }}>{children}</div></div>;
}
