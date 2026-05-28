export type ArtifactType =
  | "card_update"
  | "offer_update"
  | "benefit_update"
  | "source_snapshot";

export type ArtifactSourceType =
  | "issuer"
  | "cfpb"
  | "network"
  | "doctor_of_credit"
  | "us_credit_card_guide"
  | "manual"
  | "other_third_party";

export type ArtifactReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_manual_review";

export type ArtifactDiffRisk = "low" | "medium" | "high";

export type ExtractedField = {
  value: unknown;
  confidence: number;
  citation: string;
  currency?: string;
};

export type ArtifactDiffChange = {
  path: string;
  before: unknown;
  after: unknown;
  risk: ArtifactDiffRisk;
};

export type CardUpdateArtifact = {
  artifact_version: "1.0";
  artifact_type: ArtifactType;
  card_id: string;
  run_id: string;
  created_at: string;
  source: {
    url: string;
    source_type: ArtifactSourceType;
    source_name?: string;
    fetched_at: string;
    snapshot_path?: string;
    content_hash?: string;
  };
  extracted: {
    fields: Record<string, ExtractedField>;
  };
  diff: {
    summary: string;
    changes: ArtifactDiffChange[];
  };
  risk_flags: string[];
  review: {
    status: ArtifactReviewStatus;
    reviewer: string | null;
    reviewed_at: string | null;
    notes: string | null;
  };
};

export type ArtifactValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  requiresManualReview: boolean;
  autoApprovalCandidate: boolean;
};

const ARTIFACT_TYPES = new Set<ArtifactType>([
  "card_update",
  "offer_update",
  "benefit_update",
  "source_snapshot",
]);

const SOURCE_TYPES = new Set<ArtifactSourceType>([
  "issuer",
  "cfpb",
  "network",
  "doctor_of_credit",
  "us_credit_card_guide",
  "manual",
  "other_third_party",
]);

const REVIEW_STATUSES = new Set<ArtifactReviewStatus>([
  "pending",
  "approved",
  "rejected",
  "needs_manual_review",
]);

const RISK_LEVELS = new Set<ArtifactDiffRisk>(["low", "medium", "high"]);

const TRUSTED_SOURCE_TYPES = new Set<ArtifactSourceType>([
  "issuer",
  "cfpb",
  "network",
]);

const MANUAL_REVIEW_PATH_PATTERNS = [
  /annual_fee/i,
  /authorized_user_fee/i,
  /welcome_offer/i,
  /bonus/i,
  /spending_requirement/i,
  /time_period/i,
  /recurring_credits/i,
  /apr/i,
  /penalt/i,
  /fee/i,
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoLike(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function pushRequiredObject(
  errors: string[],
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = parent[key];
  if (!isObject(value)) {
    errors.push(`${key} must be an object`);
    return null;
  }
  return value;
}

export function validateCardUpdateArtifact(
  value: unknown,
): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(value)) {
    return {
      ok: false,
      errors: ["artifact must be a JSON object"],
      warnings,
      requiresManualReview: true,
      autoApprovalCandidate: false,
    };
  }

  if (value.artifact_version !== "1.0") {
    errors.push('artifact_version must be "1.0"');
  }

  if (!isString(value.artifact_type) || !ARTIFACT_TYPES.has(value.artifact_type as ArtifactType)) {
    errors.push(`artifact_type must be one of: ${Array.from(ARTIFACT_TYPES).join(", ")}`);
  }

  for (const key of ["card_id", "run_id", "created_at"] as const) {
    if (!isString(value[key])) errors.push(`${key} is required`);
  }

  if (isString(value.created_at) && !isIsoLike(value.created_at)) {
    errors.push("created_at must be ISO-date parseable");
  }

  const source = pushRequiredObject(errors, value, "source");
  if (source) {
    if (!isString(source.url)) errors.push("source.url is required");
    if (!isString(source.source_type) || !SOURCE_TYPES.has(source.source_type as ArtifactSourceType)) {
      errors.push(`source.source_type must be one of: ${Array.from(SOURCE_TYPES).join(", ")}`);
    }
    if (!isString(source.fetched_at)) errors.push("source.fetched_at is required");
    if (isString(source.fetched_at) && !isIsoLike(source.fetched_at)) {
      errors.push("source.fetched_at must be ISO-date parseable");
    }
    if (!isString(source.snapshot_path)) warnings.push("source.snapshot_path is missing");
    if (!isString(source.content_hash)) warnings.push("source.content_hash is missing");
  }

  const extracted = pushRequiredObject(errors, value, "extracted");
  if (extracted) {
    const fields = extracted.fields;
    if (!isObject(fields)) {
      errors.push("extracted.fields must be an object");
    } else if (Object.keys(fields).length === 0) {
      errors.push("extracted.fields must include at least one field");
    } else {
      for (const [path, field] of Object.entries(fields)) {
        if (!isObject(field)) {
          errors.push(`extracted.fields.${path} must be an object`);
          continue;
        }
        if (!("value" in field)) errors.push(`extracted.fields.${path}.value is required`);
        if (typeof field.confidence !== "number" || field.confidence < 0 || field.confidence > 1) {
          errors.push(`extracted.fields.${path}.confidence must be a number from 0 to 1`);
        }
        if (!isString(field.citation)) {
          errors.push(`extracted.fields.${path}.citation is required`);
        }
      }
    }
  }

  const diff = pushRequiredObject(errors, value, "diff");
  let hasHighRiskDiff = false;
  let hasManualReviewPath = false;
  let diffChangeCount = 0;
  if (diff) {
    if (!isString(diff.summary)) errors.push("diff.summary is required");
    if (!Array.isArray(diff.changes)) {
      errors.push("diff.changes must be an array");
    } else {
      diffChangeCount = diff.changes.length;
      for (const [index, change] of diff.changes.entries()) {
        if (!isObject(change)) {
          errors.push(`diff.changes[${index}] must be an object`);
          continue;
        }
        const changePath = change.path;
        const changeRisk = change.risk;
        if (!isString(changePath)) errors.push(`diff.changes[${index}].path is required`);
        if (!isString(changeRisk) || !RISK_LEVELS.has(changeRisk as ArtifactDiffRisk)) {
          errors.push(`diff.changes[${index}].risk must be low, medium, or high`);
        }
        if (changeRisk === "high") hasHighRiskDiff = true;
        if (isString(changePath) && MANUAL_REVIEW_PATH_PATTERNS.some((rx) => rx.test(changePath))) {
          hasManualReviewPath = true;
        }
      }
    }
  }

  if (!Array.isArray(value.risk_flags) || !value.risk_flags.every((flag) => typeof flag === "string")) {
    errors.push("risk_flags must be an array of strings");
  }

  const review = pushRequiredObject(errors, value, "review");
  if (review) {
    if (!isString(review.status) || !REVIEW_STATUSES.has(review.status as ArtifactReviewStatus)) {
      errors.push(`review.status must be one of: ${Array.from(REVIEW_STATUSES).join(", ")}`);
    }
    for (const key of ["reviewer", "reviewed_at", "notes"] as const) {
      if (review[key] !== null && typeof review[key] !== "string") {
        errors.push(`review.${key} must be string or null`);
      }
    }
  }

  const sourceType = source?.source_type as ArtifactSourceType | undefined;
  const untrustedSource = sourceType ? !TRUSTED_SOURCE_TYPES.has(sourceType) : true;
  const lowConfidence = isObject(extracted?.fields)
    ? Object.values(extracted.fields).some(
        (field) => isObject(field) && typeof field.confidence === "number" && field.confidence < 0.9,
      )
    : true;
  const riskFlags = Array.isArray(value.risk_flags) ? value.risk_flags : [];
  const hasRiskFlags = riskFlags.length > 0;
  const missingSnapshot = !isString(source?.snapshot_path) || !isString(source?.content_hash);

  const requiresManualReview =
    errors.length > 0 ||
    untrustedSource ||
    lowConfidence ||
    hasHighRiskDiff ||
    hasManualReviewPath ||
    hasRiskFlags ||
    missingSnapshot;

  const autoApprovalCandidate =
    !requiresManualReview &&
    diffChangeCount > 0 &&
    review?.status === "pending" &&
    sourceType !== undefined &&
    TRUSTED_SOURCE_TYPES.has(sourceType);

  if (untrustedSource) warnings.push("source type requires manual review");
  if (lowConfidence) warnings.push("one or more fields have confidence below 0.9");
  if (hasHighRiskDiff) warnings.push("high-risk diff requires manual review");
  if (hasManualReviewPath) warnings.push("money/fee/bonus/credit-related path requires manual review");
  if (hasRiskFlags) warnings.push("risk_flags present; manual review required");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    requiresManualReview,
    autoApprovalCandidate,
  };
}
