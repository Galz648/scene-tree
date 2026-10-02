"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitFindings = splitFindings;
/** The only rule whose fix is "add a child". CollisionPolygon2D is the other legal child; the ghost uses the first type the message names. */
const CHILD_TYPE = {
    "body-needs-shape": "CollisionShape2D",
};
function splitFindings(issues) {
    const required = [];
    const warnings = [];
    for (const issue of issues) {
        const typeName = CHILD_TYPE[issue.rule];
        if (typeName) {
            const ownerType = typeof issue.node?.type === "string" ? issue.node.type : "";
            const ghost = {
                parentPath: issue.path,
                typeName,
                ownerType,
                message: issue.message,
            };
            const seen = required.some((existing) => existing.parentPath === ghost.parentPath &&
                existing.typeName === ghost.typeName &&
                existing.message === ghost.message);
            if (!seen) {
                required.push(ghost);
            }
        }
        else {
            warnings.push({ path: issue.path, message: issue.message, severity: issue.severity });
        }
    }
    return { required, warnings };
}
//# sourceMappingURL=findings.js.map