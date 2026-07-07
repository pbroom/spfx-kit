let progressJson = false;
let jsonOutput = false;

export function configureExportOutput(options) {
  progressJson = options.progressJson === true;
  jsonOutput = options.jsonOutput === true;
}

export function isJsonOutput() {
  return jsonOutput;
}

export function reportTargetProgress(target, phase, progress, message) {
  reportExportProgress({ type: 'target', target, phase, progress, message });
}

export function reportExportProgress(event) {
  if (!progressJson) {
    return;
  }
  process.stderr.write(`SPFX_KIT_PROGRESS ${JSON.stringify({ ...event, time: new Date().toISOString() })}\n`);
}

// In --json mode stdout must carry only the final summary, so child build
// output is redirected to stderr instead of inheriting this process's stdout.
export function childStdio() {
  return jsonOutput ? ['inherit', 2, 'inherit'] : 'inherit';
}
