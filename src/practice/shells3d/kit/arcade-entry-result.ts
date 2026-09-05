export interface ArcadeDemoResult {
  correctCount: number;
  totalQuestions?: number;
  totalGaps?: number;
}

export function citySessionResult(shellKey: string, result: ArcadeDemoResult) {
  return { ...result, shellKey, totalQuestions: result.totalQuestions ?? result.totalGaps ?? 0 };
}
