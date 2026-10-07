// Shared defaults, validation and change-detection for the HRI project site.

export const STATUSES = ["Completed", "On Process", "Not Completed"];

const emptyComponent = (id, title) => ({
  id,
  title,
  investigator: { name: "", designation: "" },
  activities: [],
  upcoming: [],
});

export const DEFAULTS = {
  aim: "Edit this text in the admin page to describe the aim of the study.",
  objectives: {
    primary: "Edit this text in the admin page to describe the primary objective.",
    secondary: "Edit this text in the admin page to describe the secondary objectives.",
  },
  components: [
    emptyComponent("epi", "HRI Epidemiology"),
    emptyComponent("climate", "Climatic & Air Quality Relationship with HRIs"),
    emptyComponent("interventions", "Co-design & Implement Interventions"),
    emptyComponent("ews", "Early warning system development"),
  ],
  publications: [],
};

const s = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const month = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? String(v) : "");
const status = (v) => (STATUSES.includes(v) ? v : "On Process");
const rid = () => Math.random().toString(36).slice(2, 10);
const rows = (arr, map) => (Array.isArray(arr) ? arr.slice(0, 200).map(map) : []);

// Only accepts known fields. Component headings always come from DEFAULTS (not editable).
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
        investigator: {
          name: s(c.investigator?.name, 200),
          designation: s(c.investigator?.designation, 300),
        },
        activities: rows(c.activities, (r) => ({
          id: s(r?.id, 40) || rid(),
          activity: s(r?.activity, 500),
          status: status(r?.status),
        })).filter((r) => r.activity),
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
  for (const nc of newData.components) {
    const oc = oldData.components.find((c) => c.id === nc.id) || emptyComponent(nc.id, nc.title);
    const L = nc.title;
    diffText(`${L} – Investigator name`, oc.investigator.name, nc.investigator.name, out);
    diffText(`${L} – Investigator designation`, oc.investigator.designation, nc.investigator.designation, out);
    diffRows(`${L} – Project activity`, oc.activities, nc.activities, [["activity", "activity"], ["status", "status"]], out);
    diffRows(`${L} – Upcoming activity`, oc.upcoming, nc.upcoming, [["activity", "activity"], ["endDate", "end date"]], out);
  }
  diffRows("Other activities for publication", oldData.publications, newData.publications,
    [["activity", "activity"], ["status", "status"], ["endDate", "end date"]], out);
  return out;
}
