'use strict';
const { getAllTasks, getAreas, getSettings, getHouseholdMembers, getHousehold } = require('./supabase');

async function buildExportPayload(householdId) {
  const [household, tasks, areas, settings, members] = await Promise.all([
    getHousehold(householdId),
    getAllTasks(householdId),
    getAreas(householdId),
    getSettings(householdId),
    getHouseholdMembers(householdId)
  ]);
  return {
    exportedAt: new Date().toISOString(),
    household,
    tasks,
    areas,
    settings,
    members
  };
}

module.exports = { buildExportPayload };
