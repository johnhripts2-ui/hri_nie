// Shared defaults, validation, permissions and change-detection for the HRI project site.

export const STATUSES = ["Completed", "On Process", "Not Completed"]; // used by "Other activities for publication"
export const SUB_STATUSES = ["Ongoing", "Completed"];
export const ROLES = { admin: "Admin", investigator: "Investigator", member: "Team member" };

const P = (id, name) => ({ id, name });
const comp = (id, title, investigators) => ({
  id, title, investigators, members: [], activities: [], upcoming: [],
});

export const DEFAULTS = {
  aim: "Edit this text in the admin page to describe the aim of the study.",
  objectives: {
    primary: "Edit this text in the admin page to describe the primary objective.",
    secondary: "Edit this text in the admin page to describe the secondary objectives.",
  },
  components: [
    comp("epi", "HRI Epidemiology", [P("inv-vijay", "Vijay sir"), P("inv-manickam", "Manickam sir")]),
    comp("climate", "Climatic & Air Quality Relationship with HRIs", [P("inv-bhavani", "Bhavani sir"), P("inv-manickam", "Manickam sir")]),
    comp("interventions", "Co-design & Implement Interventions", [P("inv-manickam", "Manickam sir"), P("inv-madhan", "Madhan raj sir")]),
    comp("ews", "Early warning system development", [P("inv-bhavani", "Bhavani sir"), P("inv-manickam", "Manickam sir")]),
  ],
  publications: [],
};

export const COMPONENT_IDS = DEFAULTS.components.map((c) => c.id);

const s = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const month = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? String(v) : "");
const status = (v) => (STATUSES.includes(v) ? v : "On Process");
const subStatus = (v) => (SUB_STATUSES.includes(v) ? v : "Ongoing");
const rid = () => Math.random().toString(36).slice(2, 10);
const rows = (arr, map) => (Array.isArray(arr) ? arr.slice(0, 200).map(map) : []);
const people = (arr) =>
  rows(arr, (r) => ({ id: s(r?.id, 40) || rid(), name: s(r?.name, 200) })).filter((r) => r.name);

// A project activity is "Completed" only when it has subprocesses and all of them are completed.
export const deriveStatus = (subs) =>
  subs.length > 0 && subs.every((x) => x.status === "Completed") ? "Completed" : "On Process";

// Accepts only known fields. Component headings always come from DEFAULTS (not editable).
export function sanitize(input = {}) {
  return {
    aim: s(input.aim),
    objectives: {
      primary: s(input.objectives?.primary),
      secondary: s(input.objectives?.secondary),
    },
    components: DEFAULTS.components.map((def) => {
      const c = (input.components || []).find((x) => x?.id === def.id) || {};
      return {
        id: def.id,
        title: def.title,
        investigators: people(Array.isArray(c.investigators) ? c.investigators : def.investigators),
        members: people(c.members),
        activities: rows(c.activities, (r) => {
          const subs = rows(r?.subs, (x) => ({
            id: s(x?.id, 40) || rid(),
            name: s(x?.name, 500),
            status: subStatus(x?.status),
          })).filter((x) => x.name);
          return { id: s(r?.id, 40) || rid(), activity: s(r?.activity, 500), subs, status: deriveStatus(subs) };
        }).filter((r) => r.activity),
        upcoming: rows(c.upcoming, (r) => ({
          id: s(r?.id, 40) || rid(),
          activity: s(r?.activity, 500),
          endDate: month(r?.endDate),
        })).filter((r) => r.activity),
      };
    }),
    publications: rows(input.publications, (r) => ({
      id: s(r?.id, 40) || rid(),
      activity: s(r?.activity, 500),
      status: status(r?.status),
      endDate: month(r?.endDate),
    })).filter((r) => r.activity),
  };
}

// Turns whatever is stored (or nothing) into the current data shape.
export const normalize = (raw) => sanitize(raw || DEFAULTS);

// Admin may change everything. Investigators / team members may only change the project
// activities, subprocesses and upcoming activities of their assigned components, plus the
// "Other activities for publication" list. Everything else is taken from the stored copy.
export function mergeByRole(latest, incoming, user) {
  const inc = sanitize(incoming);
  if (user.role === "admin") return inc;
  const allowed = new Set(user.components || []);
  return {
    ...latest,
    components: latest.components.map((c) => {
      if (!allowed.has(c.id)) return c;
      const n = inc.components.find((x) => x.id === c.id);
      return { ...c, activities: n.activities, upcoming: n.upcoming };
    }),
    publications: inc.publications,
  };
}

const emptyComp = (c) => ({ id: c.id, title: c.title, investigators: [], members: [], activities: [], upcoming: [] });
const show = (v) => (v === "" || v == null ? "(blank)" : `"${v}"`);

function diffText(label, a, b, out) {
  if ((a || "") !== (b || "")) out.push(`${label}: changed from ${show(a)} to ${show(b)}`);
}

function diffRows(label, oldRows, newRows, fields, out) {
  const oldMap = new Map(oldRows.map((r) => [r.id, r]));
  const newMap = new Map(newRows.map((r) => [r.id, r]));
  const [mainKey] = fields[0];
  for (const r of newRows) {
    const o = oldMap.get(r.id);
    if (!o) {
      const extra = fields.slice(1).map(([k, n]) => `${n}: ${show(r[k])}`).join(", ");
      out.push(`${label}: added "${r[mainKey]}"${extra ? " (" + extra + ")" : ""}`);
      continue;
    }
    for (const [k, n] of fields) {
      if (o[k] !== r[k]) {
        out.push(
          k === mainKey
            ? `${label}: renamed ${show(o[k])} to ${show(r[k])}`
            : `${label}: "${r[mainKey]}" ${n} changed from ${show(o[k])} to ${show(r[k])}`
        );
      }
    }
  }
  for (const o of oldRows) if (!newMap.has(o.id)) out.push(`${label}: removed "${o[mainKey]}"`);
}

export function diff(oldData, newData) {
  const out = [];
  diffText("Aim", oldData.aim, newData.aim, out);
  diffText("Objective (primary)", oldData.objectives.primary, newData.objectives.primary, out);
  diffText("Objective (secondary)", oldData.objectives.secondary, newData.objectives.secondary, out);
  newData.components.forEach((nc, i) => {
    const oc = oldData.components.find((c) => c.id === nc.id) || emptyComp(nc);
    const L = `${i + 1}. ${nc.title}`;
    diffRows(`${L} – Investigator`, oc.investigators, nc.investigators, [["name", "name"]], out);
    diffRows(`${L} – Team member`, oc.members, nc.members, [["name", "name"]], out);
    diffRows(`${L} – Project activity`, oc.activities, nc.activities, [["activity", "activity"], ["status", "status"]], out);
    for (const a of nc.activities) {
      const oa = oc.activities.find((x) => x.id === a.id) || { subs: [] };
      diffRows(`${L} – Subprocess of "${a.activity}"`, oa.subs, a.subs, [["name", "subprocess"], ["status", "status"]], out);
    }
    diffRows(`${L} – Upcoming activity`, oc.upcoming, nc.upcoming, [["activity", "activity"], ["endDate", "end date"]], out);
  });
  diffRows("Other activities for publication", oldData.publications, newData.publications,
    [["activity", "activity"], ["status", "status"], ["endDate", "end date"]], out);
  return out;
}
