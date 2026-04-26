const CRITICALITY_VALUES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const CRITICALITY_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

const DEFAULT_TAGS = [
  "needs-professional",
  "needs-purchase",
  "needs-budget",
  "kids-related",
  "quick-win",
  "safety",
  "recurring",
  "delegated",
  "water-damage-risk",
  "electrical"
];

const ASSIGNEE_VALUES = ["Me", "Spouse", "Professional", "Both"];

const DEFAULT_AREA_SEED = [
  "Kitchen",
  "Bathroom",
  "Common Bathroom",
  "Living Room",
  "Master Bedroom",
  "Guest Bedroom",
  "Office",
  "Garden",
  "Balcony",
  "Utility Room",
  "Entrance",
  "General"
];

module.exports = {
  CRITICALITY_VALUES,
  CRITICALITY_ORDER,
  DEFAULT_TAGS,
  ASSIGNEE_VALUES,
  DEFAULT_AREA_SEED
};
