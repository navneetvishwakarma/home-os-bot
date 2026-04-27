const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { config } = require("../config");
const { CRITICALITY_ORDER, DEFAULT_AREA_SEED } = require("../constants");
const { warn } = require("../utils/logger");

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

// ─── Row mappers ──────────────────────────────────────────────────────────────

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

function toDbTask(householdId, task) {
  return {
    household_id: householdId,
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

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function createTask(householdId, task) {
  const { data, error } = await supabase
    .from("tasks")
    .insert(toDbTask(householdId, task))
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function updateTask(id, patch) {
  const mappedPatch = toDbPatch(patch);
  if (!Object.keys(mappedPatch).length) return;
  const { error } = await supabase.from("tasks").update(mappedPatch).eq("id", id);
  if (error) throw error;
}

async function getIncompleteTasksByPriority(householdId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("household_id", householdId)
    .eq("completed", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data
    .map(fromDbTask)
    .filter((t) => !t.isRecurring || !t.nextDueDate || t.nextDueDate <= today)
    .sort((a, b) => {
      const p = CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality];
      if (p !== 0) return p;
      return a.effortMins - b.effortMins;
    });
}

async function bulkComplete(ids) {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const { data: tasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id, is_recurring, recurrence_interval_days")
    .in("id", ids);
  if (fetchError) throw fetchError;

  const recurring = tasks.filter((t) => t.is_recurring);
  const nonRecurring = tasks.filter((t) => !t.is_recurring);
  let completed = 0;

  if (nonRecurring.length) {
    const { data, error } = await supabase
      .from("tasks")
      .update({ completed: true, completed_at: now, last_completed_at: today })
      .in("id", nonRecurring.map((t) => t.id))
      .select("id");
    if (error) throw error;
    completed += data.length;
  }

  for (const task of recurring) {
    const intervalDays = task.recurrence_interval_days || 7;
    const nextDue = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const { error } = await supabase
      .from("tasks")
      .update({ last_completed_at: today, next_due_date: nextDue })
      .eq("id", task.id);
    if (error) throw error;
    completed += 1;
  }

  return completed;
}

async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ─── Areas ────────────────────────────────────────────────────────────────────

async function getAreas(householdId) {
  const { data, error } = await supabase
    .from("areas")
    .select("name")
    .eq("household_id", householdId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map((row) => row.name);
}

async function addArea(householdId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return false;
  const { error } = await supabase
    .from("areas")
    .upsert({ household_id: householdId, name: cleanName }, { onConflict: "household_id,name", ignoreDuplicates: true });
  if (error) throw error;
  return true;
}

async function removeArea(householdId, name) {
  const { error } = await supabase
    .from("areas")
    .delete()
    .eq("household_id", householdId)
    .eq("name", name);
  if (error) throw error;
}

async function seedDefaultAreas(householdId) {
  const rows = DEFAULT_AREA_SEED.map((name) => ({ household_id: householdId, name }));
  const { error } = await supabase
    .from("areas")
    .upsert(rows, { onConflict: "household_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getSettings(householdId) {
  const { data, error } = await supabase
    .from("settings")
    .select("id, calendar_time, calendar_duration, timezone, permissions")
    .eq("household_id", householdId)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    calendarTime: data.calendar_time.slice(0, 5),
    calendarDuration: data.calendar_duration,
    timezone: data.timezone || "Asia/Kolkata",
    permissions: data.permissions || {}
  };
}

async function updateSettings(householdId, patch) {
  const mapped = {};
  if (patch.calendarTime !== undefined) mapped.calendar_time = `${patch.calendarTime}:00`;
  if (patch.calendarDuration !== undefined) mapped.calendar_duration = patch.calendarDuration;
  if (patch.timezone !== undefined) mapped.timezone = patch.timezone;
  if (patch.permissions !== undefined) mapped.permissions = patch.permissions;
  if (!Object.keys(mapped).length) return;
  const { error } = await supabase
    .from("settings")
    .update(mapped)
    .eq("household_id", householdId);
  if (error) throw error;
}

async function upsertSettings(householdId, defaults = {}) {
  const row = {
    household_id: householdId,
    calendar_time: defaults.calendarTime || "18:00:00",
    calendar_duration: defaults.calendarDuration || 60,
    timezone: defaults.timezone || "Asia/Kolkata",
    permissions: defaults.permissions || {}
  };
  const { error } = await supabase
    .from("settings")
    .upsert(row, { onConflict: "household_id", ignoreDuplicates: true });
  if (error) throw error;
}

// ─── Households ───────────────────────────────────────────────────────────────

async function createHousehold(name, adminUserId) {
  const { data: household, error: hError } = await supabase
    .from("households")
    .insert({ name })
    .select("id, name")
    .single();
  if (hError) throw hError;

  const { error: mError } = await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: adminUserId, role: "admin" });
  if (mError) throw mError;

  await upsertSettings(household.id);
  await seedDefaultAreas(household.id);

  return household;
}

async function getHousehold(householdId) {
  const { data, error } = await supabase
    .from("households")
    .select("id, name")
    .eq("id", householdId)
    .single();
  if (error) throw error;
  return data;
}

async function getAllHouseholdsWithSettings() {
  // settings is a child table (settings.household_id → households.id),
  // so PostgREST embeds it as an array; we take [0] since UNIQUE(household_id).
  const { data, error } = await supabase
    .from("households")
    .select("id, name, settings(calendar_time, calendar_duration, timezone)")
    .is("deleted_at", null);
  if (error) throw error;
  return data
    .filter((h) => {
      if (!Array.isArray(h.settings) || !h.settings.length) {
        warn("household_missing_settings", { householdId: h.id, name: h.name });
        return false;
      }
      return true;
    })
    .map((h) => {
      const s = h.settings[0];
      return {
        id: h.id,
        name: h.name,
        settings: {
          calendarTime: s.calendar_time.slice(0, 5),
          calendarDuration: s.calendar_duration,
          timezone: s.timezone || "Asia/Kolkata"
        }
      };
    });
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function upsertUser(telegramId, telegramUsername, displayName) {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      { telegram_id: telegramId, telegram_username: telegramUsername || null, display_name: displayName || null },
      { onConflict: "telegram_id" }
    )
    .select("id, telegram_id, display_name")
    .single();
  if (error) throw error;
  return data;
}

// ─── Membership ───────────────────────────────────────────────────────────────

async function getMembership(userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role, joined_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getHouseholdMembers(householdId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, joined_at, users(id, telegram_id, display_name, telegram_username)")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    userId: row.users.id,
    telegramId: row.users.telegram_id,
    displayName: row.users.display_name || row.users.telegram_username || row.users.telegram_id,
    role: row.role,
    joinedAt: row.joined_at
  }));
}

async function removeMember(householdId, targetUserId) {
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", targetUserId);
  if (error) throw error;
}

async function updateMemberRole(householdId, targetUserId, role) {
  const { error } = await supabase
    .from("household_members")
    .update({ role })
    .eq("household_id", householdId)
    .eq("user_id", targetUserId);
  if (error) throw error;
}

async function getAdminCount(householdId) {
  const { count, error } = await supabase
    .from("household_members")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("role", "admin");
  if (error) throw error;
  return count;
}

async function findUserByTelegramId(telegramId) {
  const { data, error } = await supabase
    .from("users")
    .select("id, telegram_id, display_name")
    .eq("telegram_id", String(telegramId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getMemberByTelegramId(householdId, telegramId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, role, users(id, telegram_id, display_name)")
    .eq("household_id", householdId)
    .eq("users.telegram_id", String(telegramId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function createInviteCode(householdId, createdByUserId, expiresInHours = 24) {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("invite_codes")
    .insert({ household_id: householdId, code, created_by: createdByUserId, expires_at: expiresAt })
    .select("code, expires_at")
    .single();
  if (error) throw error;
  return { code: data.code, expiresAt: data.expires_at };
}

async function consumeInviteCode(code, joiningUserId) {
  // Check if the user is already in a household
  const existingMembership = await getMembership(joiningUserId);
  if (existingMembership) return "already_member";

  // Atomically mark the code as used; if the row has already been consumed or
  // expired, the UPDATE returns 0 rows and we report invalid.
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("invite_codes")
    .update({ used_by: joiningUserId, used_at: now })
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("household_id, households(name)")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { error: mError } = await supabase
    .from("household_members")
    .insert({ household_id: data.household_id, user_id: joiningUserId, role: "member" });
  if (mError) {
    // UNIQUE violation means race condition — user somehow got a membership between our checks
    if (mError.code === "23505") return "already_member";
    throw mError;
  }

  return { householdId: data.household_id, householdName: data.households.name };
}

module.exports = {
  // Tasks
  createTask,
  updateTask,
  getIncompleteTasksByPriority,
  bulkComplete,
  deleteTask,
  // Areas
  getAreas,
  addArea,
  removeArea,
  seedDefaultAreas,
  // Settings
  getSettings,
  updateSettings,
  upsertSettings,
  // Households
  createHousehold,
  getHousehold,
  getAllHouseholdsWithSettings,
  // Users
  upsertUser,
  findUserByTelegramId,
  // Membership
  getMembership,
  getHouseholdMembers,
  removeMember,
  updateMemberRole,
  getAdminCount,
  getMemberByTelegramId,
  // Invite codes
  createInviteCode,
  consumeInviteCode
};
