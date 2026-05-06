// ─────────────────────────────────────────
// Database row types (matches Supabase schema)
// ─────────────────────────────────────────

export interface Profile {
  id: string
  full_name: string | null
  institution: string | null
  department: string | null
  title: string | null
  ai_provider: 'claude' | 'gemini' | null
  gemini_api_key: string | null
  gemini_model: string | null
  created_at: string
}

export interface Course {
  id: string
  user_id: string
  title: string
  number: string | null
  term: string | null
  start_date: string | null
  end_date: string | null
  total_points: number
  description: string | null
  style_profile: StyleProfile | null
  blooms_data: BloomLevel[] | null
  critique: string | null
  diff_view: DiffView | null
  tool_preferences: ToolPreferences | null
  created_at: string
  updated_at: string
  // joined relations
  weeks?: Week[]
  assignments?: Assignment[]
  python_activities?: PythonActivity[]
  realworld_items?: RealworldItem[]
  course_files?: CourseFile[]
}

export interface ReinforcementMaterial {
  type: 'video' | 'article' | 'tool' | 'dataset' | 'exercise' | 'documentation'
  title: string
  url: string
  description: string
}

export interface Week {
  id: string
  course_id: string
  user_id: string
  week_number: number
  topic: string | null
  dates: string | null
  week_description: string | null
  concept_overview: string | null
  readings: string[]
  assignments: string[]
  tags: string[]
  reinforcement_materials: ReinforcementMaterial[]
  created_at: string
}

export interface Assignment {
  id: string
  course_id: string
  user_id: string
  title: string
  type: string | null
  points: number
  week: string | null
  due_date: string | null
  description: string | null
  sort_order: number
  created_at: string
}

export interface PythonActivity {
  id: string
  course_id: string
  user_id: string
  title: string | null
  week: string | null
  description: string | null
  code: string | null
  created_at: string
}

export interface RealworldItem {
  id: string
  course_id: string
  user_id: string
  title: string | null
  source: string | null
  url: string | null
  description: string | null
  week: string | null
  created_at: string
}

export interface CourseFile {
  id: string
  course_id: string
  user_id: string
  filename: string
  file_type: string | null
  storage_path: string | null
  extracted_text: string | null
  created_at: string
}

// ─────────────────────────────────────────
// AI / App types
// ─────────────────────────────────────────

export interface StyleProfile {
  chips: string[]
  description: string
  detectedTitle?: string
  detectedNumber?: string
  detectedTerm?: string
}

export interface BloomLevel {
  level: string
  score: number
  color: string
}

export interface DiffView {
  orig: string
  impr: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─────────────────────────────────────────
// API request/response types
// ─────────────────────────────────────────

export interface AnalyzeRequest {
  files: { name: string; type: string; text: string }[]
}

export interface AnalyzeResponse {
  profile: StyleProfile
}

export interface AskRequest {
  courseId: string
  prompt: string
  courseContext: CourseContext
}

export interface AskResponse {
  text: string
  parsedData?: ParsedAIData
}

export interface GenerateRequest {
  title: string
  number: string
  description: string
  level: string
  mode: string
  startDate: string
  endDate: string
  holidays: string
  pattern: string
  styleContext: string
  options: {
    news: boolean
    python: boolean
    bloom: boolean
    diff: boolean
  }
  activityMode: 'python' | 'scenario' | 'none'  // what kind of activities to generate
  professorName: string
  institution: string
  toolPreferences?: ToolPreferences | null
}

export interface GenerateResponse {
  text: string
  parsedData?: ParsedAIData
}

export interface CourseContext {
  title: string
  number: string
  term: string
  points: number
  professorName: string
  institution: string
  department: string
  styleProfile: StyleProfile | null
  fileNames: string[]
  weeks: { week_number: number; topic: string | null }[]
  assignments: { title: string; type: string | null; points: number }[]
}

export interface ParsedAIData {
  weeks?: { week: number; topic: string }[]
  blooms?: BloomLevel[]
  python?: { title: string; week: string; description: string; code: string }[]
  realworld?: { title: string; source: string; description: string; week: string }[]
  assignments?: { title: string; type: string; points: number; week: string; due_date?: string; description: string }[]
  critique?: string
  diff?: DiffView
}


export interface ToolPreferences {
  python_env: string        // e.g. "Google Colab" | "Jupyter" | "VS Code" | "Local Python" | "None"
  gis_software: string      // e.g. "QGIS" | "ArcGIS" | "ArcGIS Online" | "None"
  submission_format: string // e.g. "Google Colab Link" | "Jupyter Notebook (.ipynb)" | "PDF"
  lms: string               // e.g. "Canvas" | "Blackboard" | "Moodle"
  custom_tools: string[]    // any other required tools
  constraints: string       // free-text notes
}

export interface EnrichRequest {
  courseId: string
  toolPreferences?: ToolPreferences | null
  options: {
    assignments: boolean
    readings: boolean
    reinforcement: boolean
    realworld: boolean
  }
}

export interface EnrichWeekResult {
  weekId: string
  weekNumber: number
  topic: string
  assignments?: { title: string; type: string; points: number; week: string; due_date: string; description: string }[]
  readings?: string[]
  reinforcement_materials?: ReinforcementMaterial[]
  realworld?: { title: string; source: string; url: string; description: string; week: string }[]
  error?: string
}
