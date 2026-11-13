#!/usr/bin/env node
/** Manual-only entrypoint for the live audit sandbox acceptance (see live-sandbox-acceptance.ts). */
import { runLiveAcceptance } from './live-sandbox-acceptance';

runLiveAcceptance().then((c) => { process.exitCode = c; }, () => { console.log(JSON.stringify({ ok: false, exit: 1, error: 'internal' })); process.exitCode = 1; });
