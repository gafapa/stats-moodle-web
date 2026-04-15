type AttemptReviewRecord = {
  attemptId: number;
  quizId: number;
  review: Record<string, unknown>;
};

export const QUIZ_FINISHED_STATES = new Set([
  "finished",
  "gradedright",
  "gradedwrong",
  "gradedpartial",
]);

export type QuestionOutcome = "correct" | "partial" | "incorrect" | "unanswered";

export type QuestionOutcomePoint = {
  name: string;
  total: number;
  fill: string;
};

export type QuestionPerformancePoint = {
  name: string;
  averageScore: number;
  attempts: number;
  type: string;
};

export type QuestionTypePoint = {
  name: string;
  averageScore: number;
  correctRate: number;
  attempts: number;
};

export type StudentQuizQuestionAnalytics = {
  reviewedAttempts: number;
  reviewedQuestions: number;
  averageScore: number | null;
  correctRate: number | null;
  outcomeData: QuestionOutcomePoint[];
  weakestQuestions: QuestionPerformancePoint[];
  questionTypePerformance: QuestionTypePoint[];
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function shortenLabel(value: string, maxLength = 24): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function asQuestionOutcome(
  state: string,
  status: string,
  mark: number | null,
  maxMark: number | null,
): QuestionOutcome {
  const normalizedState = state.toLowerCase();
  const normalizedStatus = status.toLowerCase();

  if (normalizedState.includes("gaveup") || normalizedState.includes("todo") || normalizedStatus.includes("not answered")) {
    return "unanswered";
  }

  if (mark !== null && maxMark !== null && maxMark > 0) {
    const ratio = mark / maxMark;
    if (ratio >= 0.999) {
      return "correct";
    }
    if (ratio <= 0.001) {
      return "incorrect";
    }
    return "partial";
  }

  if (normalizedState.includes("right") || normalizedStatus.includes("correct")) {
    return "correct";
  }
  if (normalizedState.includes("partial") || normalizedStatus.includes("partial")) {
    return "partial";
  }
  if (normalizedState.includes("wrong") || normalizedStatus.includes("incorrect")) {
    return "incorrect";
  }

  return "unanswered";
}

export function buildStudentQuizQuestionAnalytics(
  quizzes: Record<string, unknown>[],
  reviews: AttemptReviewRecord[],
): StudentQuizQuestionAnalytics {
  const quizNames = new Map<number, string>();
  quizzes.forEach((quiz) => {
    const quizId = asNumber(quiz.id);
    if (quizId !== null) {
      quizNames.set(quizId, String(quiz.name ?? `Quiz ${quizId}`));
    }
  });

  const questionMap = new Map<
    string,
    { name: string; scores: number[]; attempts: number; type: string; correct: number }
  >();
  const typeMap = new Map<string, { scores: number[]; attempts: number; correct: number }>();
  const outcomes = {
    correct: 0,
    partial: 0,
    incorrect: 0,
    unanswered: 0,
  };

  reviews.forEach((entry) => {
    const questions = Array.isArray(entry.review.questions) ? (entry.review.questions as Record<string, unknown>[]) : [];
    const quizName = quizNames.get(entry.quizId) ?? `Quiz ${entry.quizId}`;

    questions.forEach((question) => {
      const number = String(question.number ?? question.questionnumber ?? question.slot ?? "?");
      const type = String(question.type ?? "other");
      const mark = asNumber(question.mark);
      const maxMark = asNumber(question.maxmark);
      const score = mark !== null && maxMark !== null && maxMark > 0 ? (mark / maxMark) * 100 : 0;
      const outcome = asQuestionOutcome(
        String(question.state ?? ""),
        String(question.status ?? ""),
        mark,
        maxMark,
      );

      outcomes[outcome] += 1;

      const questionKey = `${entry.quizId}-${number}`;
      const questionLabel = shortenLabel(`${quizName} · Q${number}`, 28);
      const questionStats = questionMap.get(questionKey) ?? {
        name: questionLabel,
        scores: [],
        attempts: 0,
        type,
        correct: 0,
      };
      questionStats.scores.push(score);
      questionStats.attempts += 1;
      if (outcome === "correct") {
        questionStats.correct += 1;
      }
      questionMap.set(questionKey, questionStats);

      const typeStats = typeMap.get(type) ?? { scores: [], attempts: 0, correct: 0 };
      typeStats.scores.push(score);
      typeStats.attempts += 1;
      if (outcome === "correct") {
        typeStats.correct += 1;
      }
      typeMap.set(type, typeStats);
    });
  });

  const questionPoints = [...questionMap.values()].map((item) => {
    const averageScore = item.scores.reduce((sum, value) => sum + value, 0) / Math.max(item.scores.length, 1);
    return {
      name: item.name,
      averageScore: Number(averageScore.toFixed(1)),
      attempts: item.attempts,
      type: item.type,
      correctRate: (item.correct / Math.max(item.attempts, 1)) * 100,
    };
  });

  const typePoints = [...typeMap.entries()]
    .map(([name, item]) => {
      const averageScore = item.scores.reduce((sum, value) => sum + value, 0) / Math.max(item.scores.length, 1);
      return {
        name: shortenLabel(name, 18),
        averageScore: Number(averageScore.toFixed(1)),
        correctRate: Number(((item.correct / Math.max(item.attempts, 1)) * 100).toFixed(1)),
        attempts: item.attempts,
      };
    })
    .sort((left, right) => left.averageScore - right.averageScore || right.attempts - left.attempts)
    .slice(0, 8);

  const reviewedQuestions = questionPoints.reduce((sum, item) => sum + item.attempts, 0);
  const allScores = questionPoints.flatMap((item) =>
    Array.from({ length: item.attempts }, () => item.averageScore),
  );
  const averageScore =
    allScores.length > 0 ? Number((allScores.reduce((sum, value) => sum + value, 0) / allScores.length).toFixed(1)) : null;
  const correctRate =
    reviewedQuestions > 0 ? Number(((outcomes.correct / reviewedQuestions) * 100).toFixed(1)) : null;

  return {
    reviewedAttempts: reviews.length,
    reviewedQuestions,
    averageScore,
    correctRate,
    outcomeData: [
      { name: "Correct", total: outcomes.correct, fill: "#21a179" },
      { name: "Partial", total: outcomes.partial, fill: "#f59e0b" },
      { name: "Incorrect", total: outcomes.incorrect, fill: "#d95b5b" },
      { name: "Unanswered", total: outcomes.unanswered, fill: "#94a3b8" },
    ],
    weakestQuestions: questionPoints
      .sort((left, right) => left.averageScore - right.averageScore || right.attempts - left.attempts)
      .slice(0, 8)
      .map((item) => ({
        name: item.name,
        averageScore: item.averageScore,
        attempts: item.attempts,
        type: item.type,
      })),
    questionTypePerformance: typePoints,
  };
}

export function emptyStudentQuizQuestionAnalytics(): StudentQuizQuestionAnalytics {
  return {
    reviewedAttempts: 0,
    reviewedQuestions: 0,
    averageScore: null,
    correctRate: null,
    outcomeData: [
      { name: "Correct", total: 0, fill: "#21a179" },
      { name: "Partial", total: 0, fill: "#f59e0b" },
      { name: "Incorrect", total: 0, fill: "#d95b5b" },
      { name: "Unanswered", total: 0, fill: "#94a3b8" },
    ],
    weakestQuestions: [],
    questionTypePerformance: [],
  };
}
