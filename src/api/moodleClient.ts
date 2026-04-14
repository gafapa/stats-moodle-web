import type { CourseSummary, SiteInfo } from "../types";

type ApiParams = Record<string, unknown>;

function flattenParams(params: ApiParams, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  Object.entries(params).forEach(([key, value]) => {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          Object.assign(result, flattenParams(item as ApiParams, `${fullKey}[${index}]`));
        } else if (item !== undefined && item !== null) {
          result[`${fullKey}[${index}]`] = String(item);
        }
      });
      return;
    }

    if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenParams(value as ApiParams, fullKey));
      return;
    }

    if (value !== undefined && value !== null) {
      result[fullKey] = String(value);
    }
  });

  return result;
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class MoodleApiError extends Error {}

export class MoodleClient {
  baseUrl: string;
  token: string;
  siteName = "";
  userId: number | null = null;
  userFullName = "";

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token.trim();
  }

  static async fromToken(baseUrl: string, token: string): Promise<MoodleClient> {
    const client = new MoodleClient(baseUrl, token);
    await client.init();
    return client;
  }

  static async fromCredentials(
    baseUrl: string,
    username: string,
    password: string,
    service = "moodle_mobile_app",
  ): Promise<MoodleClient> {
    const tokenUrl = `${baseUrl.replace(/\/+$/, "")}/login/token.php`;
    const body = new URLSearchParams({
      username,
      password,
      service,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });

    if (!response.ok) {
      throw new MoodleApiError(`Connection error while requesting token: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (data.error) {
      throw new MoodleApiError(String(data.error));
    }

    const token = data.token;
    if (!token || typeof token !== "string") {
      throw new MoodleApiError("The Moodle site did not return a token.");
    }

    return MoodleClient.fromToken(baseUrl, token);
  }

  async init(): Promise<void> {
    const info = await this.getSiteInfo();
    this.siteName = String(info.sitename ?? "Moodle");
    this.userId = typeof info.userid === "number" ? info.userid : null;
    this.userFullName = String(info.fullname ?? "");
  }

  private async apiCall(functionName: string, params: ApiParams = {}): Promise<unknown> {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    const payload = new URLSearchParams({
      wstoken: this.token,
      wsfunction: functionName,
      moodlewsrestformat: "json",
      ...flattenParams(params),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload,
    });

    if (!response.ok) {
      throw new MoodleApiError(`HTTP ${response.status} on ${functionName}`);
    }

    const result = (await response.json()) as Record<string, unknown> | unknown[];
    if (!Array.isArray(result) && typeof result === "object" && result && "exception" in result) {
      throw new MoodleApiError(`API [${functionName}]: ${String(result.message ?? "Unknown Moodle error")}`);
    }

    return result;
  }

  private async apiCallSafe(functionName: string, params: ApiParams = {}, fallback: unknown): Promise<unknown> {
    try {
      return await this.apiCall(functionName, params);
    } catch {
      return fallback;
    }
  }

  async getSiteInfo(): Promise<SiteInfo> {
    return asRecord(await this.apiCall("core_webservice_get_site_info")) as SiteInfo;
  }

  async getMyCourses(): Promise<CourseSummary[]> {
    const mine = asList(
      await this.apiCallSafe("core_enrol_get_my_courses", { returnusercount: 1 }, []),
    )
      .filter((course) => Number(course.id ?? 0) > 1)
      .map((course) => course as unknown as CourseSummary);

    if (mine.length > 0) {
      return mine;
    }

    if (this.userId) {
      const owned = asList(
        await this.apiCallSafe("core_enrol_get_users_courses", { userid: this.userId }, []),
      )
        .filter((course) => Number(course.id ?? 0) > 1)
        .map((course) => course as unknown as CourseSummary);

      if (owned.length > 0) {
        return owned;
      }
    }

    return this.getAllCourses();
  }

  async getAllCourses(): Promise<CourseSummary[]> {
    return asList(await this.apiCallSafe("core_course_get_courses", {}, []))
      .filter((course) => Number(course.id ?? 0) > 1)
      .map((course) => course as unknown as CourseSummary);
  }

  async getEnrollmentCount(courseId: number): Promise<number> {
    const users = asList(
      await this.apiCallSafe("core_enrol_get_enrolled_users", { courseid: courseId }, []),
    );
    return users.length;
  }

  async getCourseContents(courseId: number): Promise<Record<string, unknown>[]> {
    return asList(await this.apiCallSafe("core_course_get_contents", { courseid: courseId }, []));
  }

  async getEnrolledUsers(courseId: number): Promise<Record<string, unknown>[]> {
    return asList(
      await this.apiCallSafe("core_enrol_get_enrolled_users", { courseid: courseId }, []),
    );
  }

  async getCourseUserProfiles(
    courseId: number,
    userIds: number[],
  ): Promise<Record<string, unknown>[]> {
    const params: ApiParams = { courseid: courseId };
    userIds.forEach((userId, index) => {
      params[`userids[${index}]`] = userId;
    });
    return asList(await this.apiCallSafe("core_user_get_course_user_profiles", params, []));
  }

  async getGradeItemsForUser(courseId: number, userId: number): Promise<Record<string, unknown>> {
    return asRecord(
      await this.apiCallSafe("gradereport_user_get_grade_items", { courseid: courseId, userid: userId }, {}),
    );
  }

  async getActivitiesCompletion(courseId: number, userId: number): Promise<Record<string, unknown>> {
    return asRecord(
      await this.apiCallSafe(
        "core_completion_get_activities_completion_status",
        { courseid: courseId, userid: userId },
        {},
      ),
    );
  }

  async getAssignments(courseId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe("mod_assign_get_assignments", { "courseids[0]": courseId }, { courses: [] }),
    );
    const courses = asList(result.courses);
    return courses.length > 0 ? asList(courses[0].assignments) : [];
  }

  async getSubmissions(assignId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe(
        "mod_assign_get_submissions",
        { "assignmentids[0]": assignId },
        { assignments: [] },
      ),
    );
    const assignments = asList(result.assignments);
    return assignments.length > 0 ? asList(assignments[0].submissions) : [];
  }

  async getQuizzes(courseId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe("mod_quiz_get_quizzes_by_courses", { "courseids[0]": courseId }, { quizzes: [] }),
    );
    return asList(result.quizzes);
  }

  async getUserAttempts(quizId: number, userId = 0): Promise<Record<string, unknown>[]> {
    const params: ApiParams = { quizid: quizId };
    if (userId) {
      params.userid = userId;
    }
    const result = asRecord(
      await this.apiCallSafe("mod_quiz_get_user_attempts", params, { attempts: [] }),
    );
    return asList(result.attempts);
  }

  async getForums(courseId: number): Promise<Record<string, unknown>[]> {
    return asList(
      await this.apiCallSafe("mod_forum_get_forums_by_courses", { "courseids[0]": courseId }, []),
    );
  }

  async getForumDiscussions(forumId: number, page = 0, perPage = 100): Promise<Record<string, unknown>[]> {
    const result = await this.apiCallSafe(
      "mod_forum_get_forum_discussions",
      { forumid: forumId, page, perpage: perPage },
      { discussions: [] },
    );
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : asList(asRecord(result).discussions);
  }

  async getDiscussionPosts(discussionId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe(
        "mod_forum_get_forum_discussion_posts",
        { discussionid: discussionId },
        { posts: [] },
      ),
    );
    return asList(result.posts);
  }

  async getUserLogs(courseId: number): Promise<Record<string, unknown>[]> {
    const result = await this.apiCallSafe(
      "report_log_get_log",
      { courseid: courseId, edulevel: -1 },
      { logs: [] },
    );
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : asList(asRecord(result).logs);
  }
}
