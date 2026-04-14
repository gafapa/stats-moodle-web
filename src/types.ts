export type LanguageCode = "es" | "gl" | "en" | "fr" | "de" | "ca" | "eu";

export type RiskLevel = "high" | "medium" | "low";
export type TrendState = "improving" | "stable" | "declining";

export interface ConnectionProfile {
  name: string;
  url: string;
  token: string;
  username?: string;
  lastUsed: string;
}

export interface AiSettings {
  provider: "ollama" | "lmstudio" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface SiteInfo {
  sitename?: string;
  userid?: number;
  fullname?: string;
  [key: string]: unknown;
}

export interface CourseSummary {
  id: number;
  fullname?: string;
  shortname?: string;
  categoryname?: string;
  category?: string;
  enrolledusercount?: number;
  [key: string]: unknown;
}

export interface GradeItem {
  id?: number;
  name: string;
  type?: string;
  modname?: string;
  grade: number | null;
  gradePct: number | null;
  maxGrade: number;
  minGrade: number;
  gradedAt?: number | null;
  feedback?: string;
}

export interface StudentGrades {
  items: GradeItem[];
  finalGrade: number | null;
  finalGradePct: number | null;
  courseTotalMax: number | null;
}

export interface CompletionStatus {
  statuses: Record<string, unknown>[];
  completed: number;
  total: number;
}

export interface StudentCourseData {
  id: number;
  fullname: string;
  email?: string;
  lastaccess?: number;
  firstaccess?: number;
  enrolled?: number;
  country?: string;
  profileimageurl?: string;
  grades: StudentGrades;
  completion: CompletionStatus;
  submissions: Record<string, unknown>[];
  quizAttempts: Record<string, unknown>[];
  forumPosts: Record<string, unknown>[];
  logs: Record<string, unknown>[];
}

export interface CollectedCourseData {
  course: CourseSummary;
  students: StudentCourseData[];
  assignments: Record<string, unknown>[];
  quizzes: Record<string, unknown>[];
  forums: Record<string, unknown>[];
  contents: Record<string, unknown>[];
  submissionsByAssign: Record<number, Record<string, unknown>[]>;
  attemptsByQuiz: Record<number, Record<string, unknown>[]>;
  postsByUser: Record<number, Record<string, unknown>[]>;
  logsAvailable: boolean;
  logs: Record<string, unknown>[];
  collectedAt: string;
}

export interface StudentMetrics {
  lastAccessTs?: number;
  daysSinceAccess: number;
  lastAccessLabel: string;
  finalGrade: number | null;
  finalGradePct: number | null;
  courseTotalMax: number;
  gradeItems: GradeItem[];
  gradedItems: GradeItem[];
  gradeAvgPct: number | null;
  gradeTrend: TrendState;
  completionRate: number | null;
  completedActivities: number;
  totalActivities: number;
  totalAssignments: number;
  submittedAssignments: number;
  submissionRate: number | null;
  lateSubmissions: number;
  onTimeRate: number | null;
  totalQuizzes: number;
  quizAttemptsCount: number;
  quizScores: number[];
  quizAvgPct: number | null;
  quizTrend: TrendState;
  quizUniqueAttempted: number;
  quizCoverageRate: number | null;
  totalForums: number;
  forumPostsCount: number;
  forumDiscussionsStarted: number;
  logCount: number;
  loginDays: number;
  activityTimestamps: number[];
  weeksActive: number;
  submissionAvgAdvanceDays: number | null;
  quizAvgTimeMin: number | null;
  sessionCount: number | null;
  avgSessionDurationMin: number | null;
  engagementScore: number;
  academicScore: number;
}

export interface GradePrediction {
  predictedGrade: number;
  predictedGradePct: number;
  riskProbability: number;
  method: "heuristic";
}

export interface StudentAnalysis extends StudentCourseData {
  metrics: StudentMetrics;
  prediction: GradePrediction;
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendations: string[];
}

export interface CourseMetrics {
  totalStudents: number;
  atRiskHigh: number;
  atRiskMedium: number;
  atRiskLow: number;
  hasCompletion: boolean;
  hasAssignments: boolean;
  hasQuizzes: boolean;
  hasForums: boolean;
  avgEngagement: number | null;
  avgCompletion: number | null;
  avgSubmissionRate: number | null;
  avgGradePct: number | null;
  gradeDistribution: Record<string, number>;
  neverAccessed: number;
  inactive7d: number;
  noSubmissions: number | null;
  noForum: number | null;
}

export interface CourseAnalysis extends CollectedCourseData {
  students: StudentAnalysis[];
  courseMetrics: CourseMetrics;
  teacherRecommendations: string[];
  passThresholdPct: number;
  logsAvailable: boolean;
  mlUsed: boolean;
  analyzedAt: string;
}

export interface ConnectFormValues {
  profileName: string;
  baseUrl: string;
  token: string;
  username: string;
  password: string;
  saveProfile: boolean;
}
