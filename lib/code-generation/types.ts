export interface CodeGenerationResult {
  success: boolean;
  versionId?: number;
  versionNumber?: number;
  codeContent?: string;
  error?: string;
  fixesApplied?: string[];
}

export interface CodeGenerationRequest {
  userRequest: string;
  isModification?: boolean;
  previousCodeVersion?: string;
  chatId: string;
}

export interface CodeValidationResult {
  isValid: boolean;
  fixedCode: string;
  fixesApplied: string[];
  errors: string[];
}

export interface ValidationFinding {
  severity: "critical" | "warning";
  issueCode: string;
  message: string;
  path?: string;
  suggestedFix?: string;
}

export interface ValidationToolResult {
  success: boolean;
  status: "pass" | "fail";
  reportType: "completeness" | "ui_consistency";
  summary: string;
  criticalFindings: ValidationFinding[];
  warningFindings: ValidationFinding[];
  nextAction: "continue_fixing" | "proceed_to_next_validator" | "finish";
  score?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}
