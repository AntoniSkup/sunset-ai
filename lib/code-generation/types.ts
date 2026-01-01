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
  sessionId: string;
}

export interface CodeValidationResult {
  isValid: boolean;
  fixedCode: string;
  fixesApplied: string[];
  errors: string[];
}
