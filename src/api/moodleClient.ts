import {
  isExtensionBridgeAvailable,
  requestThroughExtension,
  type BridgeHttpResponse,
} from "../lib/extensionBridge";
import type { CourseSummary, SiteInfo } from "../types";

type ApiParams = Record<string, unknown>;

type ResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

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

function explainFetchFailure(baseUrl: string): MoodleApiError {
  return new MoodleApiError(
    [
      `Browser request blocked while connecting to ${baseUrl}.`,
      "This is usually a CORS or network configuration issue.",
      "If the Moodle server sends invalid Access-Control-Allow-Origin headers, a frontend-only app cannot connect.",
      "Fix the Moodle/server CORS headers, use the Chrome extension bridge, or place a backend proxy in front of Moodle.",
    ].join(" "),
  );
}

function bridgeResponseToResponseLike(response: BridgeHttpResponse): ResponseLike {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: async () => JSON.parse(response.bodyText) as unknown,
    text: async () => response.bodyText,
  };
}

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

    let response: ResponseLike;
    try {
      response = await MoodleClient.sendRequest(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: body.toString(),
      });
    } catch {
      throw explainFetchFailure(baseUrl);
    }

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

  private static async sendRequest(
    url: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<ResponseLike> {
    if (isExtensionBridgeAvailable()) {
      const response = await requestThroughExtension({
        url,
        method: init.method,
        headers: init.headers,
        body: init.body,
      });
      return bridgeResponseToResponseLike(response);
    }

    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: async () => (await response.json()) as unknown,
      text: async () => await response.text(),
    };
  }

  private async apiCall(functionName: string, params: ApiParams = {}): Promise<unknown> {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    const payload = new URLSearchParams({
      wstoken: this.token,
      wsfunction: functionName,
      moodlewsrestformat: "json",
      ...flattenParams(params),
    });

    let response: ResponseLike;
    try {
      response = await MoodleClient.sendRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: payload.toString(),
      });
    } catch {
      throw explainFetchFailure(this.baseUrl);
    }

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

  async getAssignmentGrades(assignId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe(
        "mod_assign_get_grades",
        { "assignmentids[0]": assignId },
        { assignments: [] },
      ),
    );
    const assignments = asList(result.assignments);
    return assignments.length > 0 ? asList(assignments[0].grades) : [];
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

  async getAttemptReview(attemptId: number): Promise<Record<string, unknown>> {
    return asRecord(
      await this.apiCall("mod_quiz_get_attempt_review", { attemptid: attemptId }),
    );
  }

  async getForums(courseId: number): Promise<Record<string, unknown>[]> {
    return asList(
      await this.apiCallSafe("mod_forum_get_forums_by_courses", { "courseids[0]": courseId }, []),
    );
  }

  async getPages(courseId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe("mod_page_get_pages_by_courses", { "courseids[0]": courseId }, { pages: [] }),
    );
    return asList(result.pages);
  }

  async getResources(courseId: number): Promise<Record<string, unknown>[]> {
    const result = asRecord(
      await this.apiCallSafe("mod_resource_get_resources_by_courses", { "courseids[0]": courseId }, { resources: [] }),
    );
    return asList(result.resources);
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
