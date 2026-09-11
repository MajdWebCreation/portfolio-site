import { describe, expect, it } from "vitest";
import {
  caseStudies,
  getCaseStudyBySlug,
  getCaseStudyPath,
  getCaseStudyPathForProject,
  getPublishedCaseStudyPaths,
} from "@/lib/content/cases";
import { getProjectById, type ProjectId } from "@/lib/content/projects";

/*
  What is tested here is selection, not copy: which slugs exist per locale,
  which locale gets nothing, and that a case cannot point at a project that is
  not there. The words on the page are not asserted -- a test that copies the
  text only breaks when the text is edited on purpose.
*/

describe("case selection", () => {
  it("publishes the Dutch case and nothing in English", () => {
    expect(getPublishedCaseStudyPaths("nl")).toEqual(["flexora-bouw"]);
    expect(getPublishedCaseStudyPaths("en")).toEqual([]);
  });

  it("finds a published case by slug in its own locale only", () => {
    expect(getCaseStudyBySlug("nl", "flexora-bouw")?.slug).toBe("flexora-bouw");
    expect(getCaseStudyBySlug("en", "flexora-bouw")).toBeNull();
  });

  it("returns nothing for an unknown slug", () => {
    expect(getCaseStudyBySlug("nl", "taxi-de-polder")).toBeNull();
    expect(getCaseStudyBySlug("nl", "")).toBeNull();
  });

  it("hides a case that is not published", () => {
    const unpublished = caseStudies.filter(
      (caseStudy) => caseStudy.locale.nl && !caseStudy.locale.nl.isPublished,
    );

    for (const caseStudy of unpublished) {
      expect(getPublishedCaseStudyPaths("nl")).not.toContain(caseStudy.locale.nl?.slug);
    }
  });

  it("builds the case path under the projects path of its locale", () => {
    expect(getCaseStudyPath("nl", "flexora-bouw")).toBe("/nl/projecten/flexora-bouw");
    expect(getCaseStudyPath("en", "flexora-bouw")).toBe("/en/projects/flexora-bouw");
  });
});

describe("case per project", () => {
  it("links the Flexora row to its Dutch case and no English one", () => {
    expect(getCaseStudyPathForProject("nl", "flexora-bouw")).toBe(
      "/nl/projecten/flexora-bouw",
    );
    expect(getCaseStudyPathForProject("en", "flexora-bouw")).toBeNull();
  });

  it("returns nothing for a project without a case", () => {
    expect(getCaseStudyPathForProject("nl", "taxi-de-polder")).toBeNull();
    expect(getCaseStudyPathForProject("nl", "onbekend-project")).toBeNull();
  });

  it("only references projects that exist", () => {
    for (const caseStudy of caseStudies) {
      expect(getProjectById(caseStudy.projectId as ProjectId)).not.toBeNull();
    }
  });
});
