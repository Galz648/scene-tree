import type { Issue } from "../engine-vendor/out/validator/tools/validate-core";

/** The only rule whose fix is "add a child". CollisionPolygon2D is the other legal child; the ghost uses the first type the message names. */
const CHILD_TYPE: Record<string, string> = {
  "body-needs-shape": "CollisionShape2D",
};

export type RequiredGhost = {
  parentPath: string;
  typeName: string;
  ownerType: string;
  message: string;
};

export type NodeWarning = {
  path: string;
  message: string;
  severity: "error" | "warning";
};

export function splitFindings(issues: Issue[]): { required: RequiredGhost[]; warnings: NodeWarning[] } {
  const required: RequiredGhost[] = [];
  const warnings: NodeWarning[] = [];
  for (const issue of issues) {
    const typeName = CHILD_TYPE[issue.rule];
    if (typeName) {
      const ownerType = typeof issue.node?.type === "string" ? issue.node.type : "";
      const ghost: RequiredGhost = {
        parentPath: issue.path,
        typeName,
        ownerType,
        message: issue.message,
      };
      const seen = required.some(
        (existing) =>
          existing.parentPath === ghost.parentPath &&
          existing.typeName === ghost.typeName &&
          existing.message === ghost.message,
      );
      if (!seen) {
        required.push(ghost);
      }
    } else {
      warnings.push({ path: issue.path, message: issue.message, severity: issue.severity });
    }
  }
  return { required, warnings };
}
