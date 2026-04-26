const { createClient } = require("@supabase/supabase-js");
const { config } = require("../config");
const { CRITICALITY_ORDER } = require("../constants");

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

function fromDbTask(row) {
  return {
    id: row.id,
    title: row.title,
    area: row.area,
    criticality: row.criticality,
    effortMins: row.effort_mins,
    tags: row.tags || [],
    assignedTo: row.assigned_to,
    deadline: row.deadline,
    reasoning: row.reasoning,
    rawInput: row.raw_input,
    addedBy: row.added_by,
    completed: row.completed,
    completedAt: row.completed_at,
    isRecurring: row.is_recurring,
    recurrenceIntervalDays: row.recurrence_interval_days,
    nextDueDate: row.next_due_date,
    lastCompletedAt: row.last_completed_at,
    createdAt: row.created_at
  };
}

function toDbTask(task) {
  return {
    title: task.title,
    area: task.area,
    criticality: task.criticality,
    effort_mins: task.effortMins,
    tags: task.tags || [],
    assigned_to: task.assignedTo,
    deadline: task.deadline || null,
    reasoning: task.reasoning || null,
    raw_input: task.rawInput || null,
    added_by: task.addedBy || null,
    is_recurring: Boolean(task.isRecurring),
    recurrence_interval_days: task.recurrenceIntervalDays || null,
    next_due_date: task.nextDueDate || null
  };
}

function toDbPatch(patch) {
  const mapped = {};
  if (patch.title !== undefined) mapped.title = patch.title;
  if (patch.area !== undefined) mapped.area = patch.area;
  if (patch.criticality !== undefined) mapped.criticality = patch.criticality;
  if (patch.effortMins !== undefined) mapped.effort_mins = patch.effortMins;
  if (patch.tags !== undefined) mapped.tags = patch.tags;
  if (patch.assignedTo !== undefined) mapped.assigned_to = patch.assignedTo;
  if (patch.deadline !== undefined) mapped.deadline = patch.deadline;
  if (patch.reasoning !== undefined) mapped.reasoning = patch.reasoning;
  if (patch.isRecurring !== undefined) mapped.is_recurring = patch.isRecurring;
  if (patch.recurrenceIntervalDays !== undefined) mapped.recurrence_interval_days = patch.recurrenceIntervalDays;
  if (patch.nextDueDate !== undefined) mapped.next_due_date = patch.nextDueDate;
  return mapped;
}

async function createTask(task) {
  const { data, error } = await supabase.from("tasks").insert(toDbTask(task)).select("id").single();
  if (error) throw error;
  return data.id;
}

async function updateTask(id, patch) {
  const mappedPatch = toDbPatch(patch);
  if (!Object.keys(mappedPatch).length) return;
  const { error } = await supabase.from("tasks").update(mappedPatch).eq("id", id);
  if (error) throw error;
}

async function getAreas() {
  const { data, error } = await supabase.from("areas").select("name").order("name", { ascending: true });
  if (error) throw error;
  return data.map((row) => row.name);
}

async function addArea(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return false;
  const { error } = await supabase.from("areas").upsert({ name: cleanName }, { onConflict: "name", ignoreDuplicates: true });
  if (error) throw error;
  return true;
}

async function removeArea(name) {
  const { error } = await supabase.from("areas").delete().eq("name", name);
  if (error) throw error;
}

async function getIncompleteTasksByPriority() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("completed", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data
    .map(fromDbTask)
    .sort((a, b) => {
      const p = CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality];
      if (p !== 0) return p;
      return a.effortMins - b.effortMins;
    });
}

async function bulkComplete(ids) {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed: true, completed_at: now, last_completed_at: now.slice(0, 10) })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return data.length;
}

async function getSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("id, calendar_time, calendar_duration")
    .limit(1)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    calendarTime: data.calendar_time.slice(0, 5),
    calendarDuration: data.calendar_duration
  };
}

async function updateSettings(patch) {
  const mapped = {};
  if (patch.calendarTime !== undefined) mapped.calendar_time = `${patch.calendarTime}:00`;
  if (patch.calendarDuration !== undefined) mapped.calendar_duration = patch.calendarDuration;
  if (!Object.keys(mapped).length) return;

  const settings = await getSettings();
  const { error } = await supabase.from("settings").update(mapped).eq("id", settings.id);
  if (error) throw error;
}

module.exports = {
  createTask,
  updateTask,
  getAreas,
  addArea,
  removeArea,
  getIncompleteTasksByPriority,
  bulkComplete,
  getSettings,
  updateSettings
};
