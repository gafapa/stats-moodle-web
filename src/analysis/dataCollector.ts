import { MoodleClient } from "../api/moodleClient";
import type {
  CollectedCourseData,
  CompletionStatus,
  CourseSummary,
  GradeItem,
  StudentCourseData,
  StudentGrades,
} from "../types";

type ProgressCallback = (message: string, percent: number) => void;

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;

  async function consume(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}

export class DataCollector {
  constructor(private readonly client: MoodleClient) {}

  async collectCourseData(
    courseId: number,
    courseInfo?: CourseSummary,
    onProgress?: ProgressCallback,
  ): Promise<CollectedCourseData> {
    const report = (message: string, percent: number): void => {
      onProgress?.(message, percent);
    };

    report("Loading course metadata", 5);
    let resolvedCourse = courseInfo;
    if (!resolvedCourse) {
      const courses = await this.client.getMyCourses();
      resolvedCourse = courses.find((course) => course.id === courseId);
    }

    report("Loading course structure", 10);
    const [contents, assignments, quizzes, forums] = await Promise.all([
      this.client.getCourseContents(courseId),
      this.client.getAssignments(courseId),
      this.client.getQuizzes(courseId),
      this.client.getForums(courseId),
    ]);

    report("Loading assignment submissions", 30);
    const submissionsByAssignEntries = await Promise.all(
      assignments.map(async (assignment) => {
        const assignmentId = asNumber(assignment.id);
        if (!assignmentId) {
          return [0, []] as const;
        }
        return [assignmentId, await this.client.getSubmissions(assignmentId)] as const;
      }),
    );
    const submissionsByAssign = Object.fromEntries(
      submissionsByAssignEntries.filter(([assignmentId]) => assignmentId > 0),
    );

    report("Loading quiz attempts", 40);
    const attemptsByQuizEntries = await Promise.all(
      quizzes.map(async (quiz) => {
        const quizId = asNumber(quiz.id);
        if (!quizId) {
          return [0, []] as const;
        }
        return [quizId, await this.client.getUserAttempts(quizId)] as const;
      }),
    );
    const attemptsByQuiz = Object.fromEntries(
      attemptsByQuizEntries.filter(([quizId]) => quizId > 0),
    );

    report("Loading forum activity", 48);
    const postsByUser = await this.collectForumPosts(forums);

    report("Loading enrolled users", 55);
    const enrolledUsers = await this.client.getEnrolledUsers(courseId);
    const enrichedUsers = await this.enrichUsersWithProfiles(courseId, enrolledUsers);
    const studentsRaw = enrichedUsers.filter((user) => this.isStudent(user));

    report("Loading activity logs", 60);
    const logs = await this.client.getUserLogs(courseId);

    report("Computing student snapshots", 68);
    const students = await mapWithConcurrency(studentsRaw, 6, async (student, index) => {
      report(
        `Analyzing student ${index + 1} / ${studentsRaw.length}`,
        68 + Math.round((index / Math.max(studentsRaw.length, 1)) * 28),
      );
      return this.collectStudentData(
        student,
        courseId,
        assignments,
        quizzes,
        submissionsByAssign,
        attemptsByQuiz,
        postsByUser,
        logs,
      );
    });

    report("Analysis payload ready", 100);

    return {
      course: resolvedCourse ?? { id: courseId },
      students,
      assignments,
      quizzes,
      forums,
      contents,
      submissionsByAssign,
      attemptsByQuiz,
      postsByUser,
      logsAvailable: logs.length > 0,
      logs,
      collectedAt: new Date().toISOString(),
    };
  }

  private async collectStudentData(
    user: Record<string, unknown>,
    courseId: number,
    assignments: Record<string, unknown>[],
    quizzes: Record<string, unknown>[],
    submissionsByAssign: Record<number, Record<string, unknown>[]>,
    attemptsByQuiz: Record<number, Record<string, unknown>[]>,
    postsByUser: Record<number, Record<string, unknown>[]>,
    logs: Record<string, unknown>[],
  ): Promise<StudentCourseData> {
    const userId = asNumber(user.id) ?? 0;
    const [gradeData, completionData] = await Promise.all([
      this.client.getGradeItemsForUser(courseId, userId),
      this.client.getActivitiesCompletion(courseId, userId),
    ]);

    return {
      id: userId,
      fullname: safeText(user.fullname, `User ${userId}`),
      email: safeText(user.email),
      lastaccess: asNumber(user.lastaccess) ?? 0,
      firstaccess: asNumber(user.firstaccess) ?? 0,
      enrolled: asNumber(user.lastcourseaccess) ?? 0,
      country: safeText(user.country),
      profileimageurl: safeText(user.profileimageurl),
      grades: this.parseGradeItems(gradeData),
      completion: this.parseCompletion(completionData),
      submissions: this.filterSubmissions(submissionsByAssign, userId),
      quizAttempts: this.filterAttempts(attemptsByQuiz, userId),
      forumPosts: postsByUser[userId] ?? [],
      logs: logs.filter((entry) => asNumber(entry.userid) === userId),
    };
  }

  private parseGradeItems(data: Record<string, unknown>): StudentGrades {
    const userGrades = asList(data.usergrades);
    if (userGrades.length === 0) {
      return { items: [], finalGrade: null, finalGradePct: null, courseTotalMax: null };
    }

    let finalGrade: number | null = null;
    let finalGradePct: number | null = null;
    let courseTotalMax: number | null = null;
    const items: GradeItem[] = [];

    const gradeItems = asList(userGrades[0].gradeitems);
    gradeItems.forEach((item) => {
      const itemType = safeText(item.itemtype);
      const rawGrade = asNumber(item.graderaw);
      const maxGrade = asNumber(item.grademax) ?? 10;
      const minGrade = asNumber(item.grademin) ?? 0;

      if (itemType === "course") {
        if (rawGrade !== null && maxGrade > 0) {
          finalGrade = rawGrade;
          finalGradePct = (rawGrade / maxGrade) * 100;
          courseTotalMax = maxGrade;
        }
        return;
      }

      items.push({
        id: asNumber(item.id) ?? undefined,
        name: safeText(item.itemname) || safeText(item.categoryname, "Untitled"),
        type: itemType || undefined,
        modname: safeText(item.itemmodule) || undefined,
        grade: rawGrade,
        gradePct: rawGrade !== null && maxGrade > 0 ? (rawGrade / maxGrade) * 100 : null,
        maxGrade,
        minGrade,
        gradedAt: asNumber(item.gradedategraded),
        feedback: safeText(item.feedback),
      });
    });

    return { items, finalGrade, finalGradePct, courseTotalMax };
  }

  private parseCompletion(data: Record<string, unknown>): CompletionStatus {
    const statuses = asList(data.statuses);
    const completed = statuses.filter((status) => {
      const state = asNumber(status.state);
      return state === 1 || state === 2;
    }).length;
    return {
      statuses,
      completed,
      total: statuses.length,
    };
  }

  private filterSubmissions(
    submissionsByAssign: Record<number, Record<string, unknown>[]>,
    userId: number,
  ): Record<string, unknown>[] {
    return Object.entries(submissionsByAssign).flatMap(([assignId, submissions]) => {
      return submissions
        .filter((submission) => asNumber(submission.userid) === userId)
        .map((submission) => ({ ...submission, assignid: Number(assignId) }));
    });
  }

  private filterAttempts(
    attemptsByQuiz: Record<number, Record<string, unknown>[]>,
    userId: number,
  ): Record<string, unknown>[] {
    return Object.entries(attemptsByQuiz).flatMap(([quizId, attempts]) => {
      return attempts
        .filter((attempt) => asNumber(attempt.userid) === userId)
        .map((attempt) => ({ ...attempt, quizid: Number(quizId) }));
    });
  }

  private async collectForumPosts(
    forums: Record<string, unknown>[],
  ): Promise<Record<number, Record<string, unknown>[]>> {
    const postsByUser: Record<number, Record<string, unknown>[]> = {};

    for (const forum of forums) {
      const forumId = asNumber(forum.id);
      if (!forumId) {
        continue;
      }

      const seenDiscussions = new Set<number>();
      let page = 0;

      while (true) {
        const discussions = await this.client.getForumDiscussions(forumId, page, 100);
        if (discussions.length === 0) {
          break;
        }

        let newCount = 0;
        for (const discussion of discussions) {
          const discussionId = asNumber(discussion.id) ?? asNumber(discussion.discussion);
          if (!discussionId || seenDiscussions.has(discussionId)) {
            continue;
          }

          seenDiscussions.add(discussionId);
          newCount += 1;
          const posts = await this.client.getDiscussionPosts(discussionId);
          posts.forEach((post) => {
            const userId = asNumber(post.userid);
            if (!userId) {
              return;
            }
            postsByUser[userId] ??= [];
            postsByUser[userId].push({ ...post, forumid: forumId, discussionid: discussionId });
          });
        }

        if (newCount === 0) {
          break;
        }
        page += 1;
      }
    }

    return postsByUser;
  }

  private async enrichUsersWithProfiles(
    courseId: number,
    users: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const missingIds = users
      .filter((user) => !Array.isArray(user.roles))
      .map((user) => asNumber(user.id))
      .filter((value): value is number => value !== null);

    if (missingIds.length === 0) {
      return users;
    }

    const profileMap = new Map<number, Record<string, unknown>>();
    for (let index = 0; index < missingIds.length; index += 50) {
      const batch = missingIds.slice(index, index + 50);
      const profiles = await this.client.getCourseUserProfiles(courseId, batch);
      profiles.forEach((profile) => {
        const userId = asNumber(profile.id);
        if (userId) {
          profileMap.set(userId, profile);
        }
      });
    }

    return users.map((user) => {
      const userId = asNumber(user.id);
      if (!userId || !profileMap.has(userId)) {
        return user;
      }

      const profile = profileMap.get(userId)!;
      return {
        ...user,
        roles: profile.roles ?? user.roles,
        fullname: profile.fullname ?? user.fullname,
        email: profile.email ?? user.email,
        country: profile.country ?? user.country,
        profileimageurl: profile.profileimageurl ?? user.profileimageurl,
      };
    });
  }

  private isStudent(user: Record<string, unknown>): boolean {
    const roles = asList(user.roles);
    if (roles.length === 0) {
      return true;
    }

    const teacherRoles = new Set(["editingteacher", "teacher", "manager", "coursecreator"]);
    return roles.every((role) => !teacherRoles.has(safeText(role.shortname).toLowerCase()));
  }
}
