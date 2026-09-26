import { site, type ProjectId } from "@/content/site";

export type ParsedReply = { body: string; project: ProjectId | null; followUps: string[]; failed: boolean };

/** Splits the agent's raw text into visible prose, an optional project card, and follow-up suggestions. */
export function parseReply(raw: string, complete: boolean): ParsedReply {
  let text = raw;
  const failed = text.includes("[[error]]");
  text = text.replace("[[error]]", "");

  let followUps: string[] = [];
  const marker = text.search(/(^|\n)\s*>>/);
  if (marker !== -1) {
    const line = text.slice(marker).replace(/^\s*>>\s*/, "");
    text = text.slice(0, marker);
    if (complete) followUps = line.split("|").map((q) => q.trim()).filter((q) => q.length > 1 && q.length < 80).slice(0, 3);
  } else if (!complete) {
    text = text.replace(/\n\s*>?\s*$/, "");
  }

  let project: ProjectId | null = null;
  text = text.replace(/\[\[project:([a-z0-9-]+)\]\]/gi, (_, id: string) => {
    const key = id.toLowerCase();
    if (!project && key in site.projects) project = key as ProjectId;
    return "";
  });
  if (!complete) text = text.replace(/\[\[[^\]]*$/, "");

  return { body: text.replace(/\n{3,}/g, "\n\n").trim(), project, followUps, failed };
}
