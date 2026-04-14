import { reportLanguageName } from "../lib/i18n";
import type { AiSettings, CourseAnalysis, LanguageCode, StudentAnalysis } from "../types";

function ensureV1BaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function buildCourseContext(analysis: CourseAnalysis): Record<string, unknown> {
  const students = analysis.students
    .map((student) => ({
      name: student.fullname,
      risk: student.riskLevel,
      riskProbability: student.prediction.riskProbability,
      currentGradePct: student.metrics.finalGradePct,
      predictedGradePct: student.prediction.predictedGradePct,
      engagement: student.metrics.engagementScore,
    }))
    .sort((left, right) => right.riskProbability - left.riskProbability)
    .slice(0, 8);

  return {
    course: {
      id: analysis.course.id,
      name: analysis.course.fullname ?? analysis.course.shortname ?? "Course",
      totalStudents: analysis.courseMetrics.totalStudents,
    },
    courseMetrics: analysis.courseMetrics,
    passThresholdPct: analysis.passThresholdPct,
    teacherRecommendations: analysis.teacherRecommendations,
    topStudentsAtRisk: students,
  };
}

function buildStudentContext(analysis: CourseAnalysis, student: StudentAnalysis): Record<string, unknown> {
  return {
    course: {
      id: analysis.course.id,
      name: analysis.course.fullname ?? analysis.course.shortname ?? "Course",
    },
    student: {
      id: student.id,
      name: student.fullname,
      email: student.email,
      riskLevel: student.riskLevel,
      riskFactors: student.riskFactors,
      recommendations: student.recommendations,
      metrics: {
        currentGradePct: student.metrics.finalGradePct,
        predictedGradePct: student.prediction.predictedGradePct,
        failRiskProbability: student.prediction.riskProbability,
        engagement: student.metrics.engagementScore,
        completion: student.metrics.completionRate,
        submissions: student.metrics.submissionRate,
        lastAccess: student.metrics.lastAccessLabel,
      },
    },
    passThresholdPct: analysis.passThresholdPct,
  };
}

async function requestReport(
  settings: AiSettings,
  language: LanguageCode,
  scope: "course" | "student",
  context: Record<string, unknown>,
): Promise<string> {
  if (!settings.baseUrl || !settings.model) {
    throw new Error("AI settings are incomplete. Provide a base URL and model.");
  }

  const response = await fetch(`${ensureV1BaseUrl(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Moodle education analyst. Write concise, decision-oriented markdown. Do not invent data. If data is missing, say so explicitly.",
        },
        {
          role: "user",
          content: [
            `Generate a ${scope} report in ${reportLanguageName(language)}.`,
            "Use markdown headings and short bullets.",
            "Prioritize risks, evidence, and recommended actions.",
            "",
            JSON.stringify(context, null, 2),
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }

  throw new Error("The AI provider returned no usable text.");
}

export async function generateCourseReport(
  analysis: CourseAnalysis,
  settings: AiSettings,
  language: LanguageCode,
): Promise<string> {
  return requestReport(settings, language, "course", buildCourseContext(analysis));
}

export async function generateStudentReport(
  analysis: CourseAnalysis,
  student: StudentAnalysis,
  settings: AiSettings,
  language: LanguageCode,
): Promise<string> {
  return requestReport(settings, language, "student", buildStudentContext(analysis, student));
}
