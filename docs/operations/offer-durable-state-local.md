# Local-only durable state candidate — DO NOT PROMOTE

Status: uncommitted/unpushed work on top of PR59; no fourth PR. PR59 is **draft**.
Its default-off daily preflight/new flags and old Mac patch incompatibility remain
an explicit coordinated-cutover blocker. No collect-only downgrade, Mac edit,
owner change, schedule switch or production data migration has been performed.

## Evidence / supported APIs

- `package.json`: `@upstash/redis ^1.37.0`; lockfile and installed SDK: 1.37.0.
  Existing website routes / `lib/fact-store.ts` construct Redis from explicit
  URL/token variables. We inspected source references/types only, not values.
- Official Upstash TS EVAL signature is `redis.eval(script, keys, args)`:
  https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval
- Official command docs explicitly say EVAL is one atomic server step, including
  read/decide/write CAS, default global lock, all accessed keys in KEYS:
  https://upstash.com/docs/redis/commands/scripting/eval
- SET + PX makes creation/expiry one command:
  https://upstash.com/docs/redis/commands/string/set
- Installed SDK type declarations verify retry=false, deserialization=false,
  auto-pipeline=false and per-request AbortSignal callback. The adapter uses a
  10-second SDK request timeout. No fromEnv or existing website Redis reused.

No unsupported conditional-SET extension, client GET-then-SET CAS, dynamic Lua
keys, SCAN/KEYS/FLUSH, installation or real Redis connection was used. Lua tests
use a deterministic **atomic transport model, not a Lua interpreter or service**.
The official API is established, but actual Lua execution/account command grants,
request/size/latency limits and provider plan durability still require an approved
isolated service acceptance test. No free-tier/cost/capacity assumption is made.

## Local implementation

`redis-state.ts` exposes an injected EVAL transport and optional official SDK
factory. Construction is disabled unless enabled=true; namespaces must match
`opencard:offer-state:{sandbox-<8..64 lowercase safe chars>}:`.
Production/website prefixes are rejected. All keys share the declared tag.
Credentials are explicit arguments, not implicit env lookups; absent endpoint /
credential / namespace refuses. No workflow/CLI currently selects this adapter.

Each session has a unique runner ID, bounded 1–300 second lease TTL, persistent
monotonic fencing counter, compare-token/fence renew/assert/release. No fence or
state TTL is applied. A renewal/transport uncertainty permanently poisons that
session. It cannot reacquire or issue later writes; a new session must wait for
expiry or verified release. Old fences cannot CAS, claim, renew or delete a newer
lease. No background watcher or stealing stale jobs is introduced.

Document envelope: `{schema:1, version, fence, value}`. CAS checks live lease,
current fence and expected version **inside the same EVAL as SET**. Journals
are validated before load/save. Unknown envelope/journal schemas refuse, not
"repair" by overwriting. Fingerprint claim multi-key check/write is one EVAL.
Claims move after local validation/commits/origin checks, immediately before push;
checks failure/prepared journals reserve nothing. Definite pre-push failures can
release only the same run's claims under its valid lease. An attempted/ambiguous
push is never guessed safe, released, or replayed. Journal `pushAttempted` records
irreversible issuance intent; legacy absence is treated conservatively.

`pr-transport.ts` accepts async journal and a lease guard. `operational-state.ts`
is a real **opt-in library bridge** invoking the existing publisher/helper,
renewing lease alongside the latest remote owner/epoch check at every external
write boundary. It CAS-persists ledger/history/daily in one operational document,
using merge-SHA/card/event identity to dedup publication history. Its defaults
refuse before acquiring a lease. Existing `publish.ts` / `daily.ts` selection
remains unchanged from PR59; live daily writes/collection are not migrated by
this bridge. Daily-state import/preservation exists, but review/apply/daily CLI
read/write replacement is still a promotion prerequisite.

There is no atomicity between Redis and GitHub. A lease can expire or owner can
change after validation while a request is already in flight. This design **does
not promise exactly-once external writes**. Persistent intents, deterministic
slot/branch/fingerprints and GitHub PR truth are needed for reconciliation. Lost
merge receipt/state-CAS failure resumes the same PR/head/merge SHA, not a second
push. No local cache or Actions artifact is proposed as the only authority.

`rollbackAttempted` survives phase=uncertain even before rollbackHead exists.
Re-entry queries rollback PR truth but never issues another revert automatically;
ambiguous outcomes require operator review. Latest exact-SHA production Vercel
deployment is selected by createdAt/created; old ERROR cannot override a newer
READY. Missing/tied time evidence is unknown. Missing nested old-value objects
are explicit unverifiable rollback expectations, not silent object creation.
`run-identity.ts` separates PT date+morning/evening/daily slot from attempt IDs.
No main SHA or random retry ID should become a new business slot.

## Offline encrypted backup candidate (fixtures only)

Existing formats are preserved inside schema1: ledger version1 entries; JSONL
history event types; daily `{updated,fetch_failures}`; journal metadata and explicit
fingerprint claims. No Mac records were read/copied. There is no implemented
shared project snapshot-encryption codec in inspected sources; the candidate uses
Node AES-256-GCM with fresh 12-byte nonce, 16-byte authentication tag and an
explicit caller-provided 32-byte key. SHA256 and schema/fixture metadata are
bound as authenticated data. This codec/key custody policy still needs review.

`state-snapshot.ts` only accepts marked sandbox fixtures, strict known schema,
bounded JSON/depth/count/size, fixed filenames and no input symlinks. Snapshots
are encrypted; output must be private and exclusive-create (never overwrite).
No raw values, key, ledger/history records are printed. CLI modes export/inspect/
prepare-import are **offline only**, require explicit paths and a key through a
caller-provided FD >=3 (not args/env/key file); key buffer is cleared. A fixture
needs `offer-state.sandbox.json` with schema1/sandbox=true/fixtureId, plus
ledger.json, history.jsonl, daily-state.json; journals.json/claims.json are optional
only if schema validation permits. This is not permission to export live records.

Restore API validates/decrypts/hash-checks the whole snapshot before adapter calls,
requires explicit new-sandbox confirmation, reserves a fresh namespace for its
digest, then stages all bounded operational/journal/claim documents before marking
complete. The pending manifest blocks normal reads/CAS/claims. Matching partial
writes can resume under a new fence using per-document digests; mismatched data or
normal/other-snapshot namespaces refuse. Lua runtime errors do not roll back
prior writes: therefore pending data stays invisible and digest-bound resume is
required, not an assumption of transaction rollback. Same complete snapshot is
idempotent and never overwrites later data. No actual import/restore occurred.

This is NOT a deployed backup service. External encrypted storage, retention,
key custody/rotation, a coherent live snapshot/export job, handling data beyond
bounds, monitoring and a real isolated restore drill are all outstanding. No
backup artifacts or state records are committed to cards PRs.

## Read-only readiness checklist

| Item | Current evidence | Deployment gate still required |
| --- | --- | --- |
| EVAL/CAS/lease/fencing API | official docs + SDK1.37 types + mock tests | isolated real service execution/grants/limits/durability |
| Publisher/journal integration | real opt-in bridge and helper mock integration | reviewed CLI/runner selection, long-step renewal/liveness |
| Ledger/history/daily | validated schema; combined CAS receipt repair; offline fixture import | replace actual review/apply/daily private state I/O coherently |
| Cross-system idempotency | same-slot PR truth tests, irreversible intents | in-flight Mac drain and manual uncertain-state runbook |
| Backup/restore | authenticated encrypted fixtures and resumable mock import | key custody + external storage/retention + coherent live capture + restore drill |
| Production handoff | none; prefixes sandbox-only; PR59 draft | explicit user cutover approval and coordinated old patch replacement |

A synchronous validation/build longer than the TTL must stop before publishing;
there is no hidden renew watcher. The bridge renews at boundaries, not during a
blocked child process. A future runner must bound/async-monitor long steps or
provide reviewed renewal before production acceptance. State/history growth is
bounded and fails closed, not silently pruned. Fencing counter/namespace must not
be reset while old requests could be in flight. Restoring a backup is always to
a new isolated namespace; production owner/epoch handoff remains a separate act.

## Local daily integration added (still frozen, no promotion)

The missing sandbox operational I/O is now connected in the actual stage modules:
`daily.ts::runSandboxDaily -> collect.ts::collectState -> review.ts::reviewState
-> apply.ts::applyState -> publish-core/pr-transport -> digest.ts::digestState`.
They use `sandbox-state.ts::OfferStateIO` for authoritative ledger/history/daily
read/CAS and private cards/artifacts. Collect's candidate/two-fetch core is shared
with its real CLI, including closed-card and auto-expiring behavior. Review uses
the actual assess/dedup/update ledger gates; apply uses real planApply /
applyPlanToCard / schema guards. It persists held/expiry outcomes as well.
No stage spawns another CLI to sneak state through temporary local ledger files.

Explicit `redisSandboxState(enabled=true, injected state, seed, private scratch)`
uses the Redis operational CAS document, async journal and fenced lease. Missing
configuration refuses before making a scratch directory; no local fallback.
`fileFixtureState` reads the same legacy ledger.json/history.jsonl/daily-state.json
formats from an explicitly marked private fixture directory, then uses one
versioned atomic operational document under an exclusive local lock, with legacy
mirrors for compatibility. It is a fixture/local adapter, not a distributed cloud
lease. It never defaults to a Mac path. No real Mac records were used.

A stable PT slot stores its applied plan and exact before/after card snapshots
inside private authoritative daily state, atomically with applied ledger/history.
Artifacts are disposable. Same-slot retry in a fresh scratch directory rebuilds
from the checkpoint only when the complete baseline matches before/after; unknown
baseline changes refuse. It then reconciles the existing GitHub PR/head/merge
receipt, rather than collecting again or opening another PR. A CAS failure after
a mocked remote merge was tested through this complete daily path and repaired
with one original PR. Slot records/bounds are included in the snapshot validator.
The candidate format requires this matching reader version; no production state
or deployed old reader has been upgraded.

### Long checks and lease validity

The sandbox daily path starts a bounded, non-overlapping `leaseHeartbeat`, with
interval <= TTL/3. A failed renewal poisons the session and aborts its signal;
subsequent state/external writes refuse. The timer is always stopped/awaited in
finally, with no leftover watcher. `async-check.ts::asyncOfferCheck` is a concrete
spawn-based runner for fixed `npm run validate/build/offer-watch:test/test` only,
not shell strings. It yields during long builds, accepts the abort signal, kills
the isolated process group on abort/timeout, suppresses child output and uses a
private HOME/minimal env instead of inheriting credentials. Env files in the check
worktree are refused (only the literal .env.example template is permitted).
Tests mock spawn, never execute operational children.

Daily runs validation/build **asynchronously before** publish, binds the result to
exact base SHA and scratch-card digest, checks both again, then passes an empty
synchronous check list to the existing publisher. This is not a skipped build:
no empty validation list is accepted at the daily boundary, and a changed input
refuses publication. Therefore no synchronous build blocks heartbeat while we
pretend to renew. Synchronous short git/gh hooks/requests can still stall; the next
fenced boundary fails closed if the lease expired, and no lock can recall a
GitHub request already in flight. No exactly-once claim is made.

Tests now cover complete Redis/file daily flow, original-TTL-exceeding async build,
renewal failure (including timer cleanup), two runners, same-slot fresh scratch
resume, post-merge CAS conflict repair, owner/lease rejection before rollback,
changed validation input, misconfigured heartbeat and realpath-safe CLI imports.

### What remains intentionally unselected

The legacy standalone CLI defaults remain the draft PR59 defaults; they do NOT
automatically select Redis or the new sandbox entry. The new daily entry is an
explicit injected programmatic runner, reviewable/testable through
`daily-state.test.ts`, not a newly enabled cloud workflow or production command.
A deployed runner must wire its approved isolated checkout/async-check callback,
source/browser dependencies and credential scopes after review. The former
"missing stage I/O" gap is implemented for this sandbox path, but this does not
claim live source parity, real Lua/Redis/Vercel acceptance or a completed migration.
Production namespace support remains prohibited. PR59 stays draft; old Mac patch
and default-off preflight cutover coordination remain mandatory blockers.

AES backup keys remain caller-only 32-byte buffers/explicit FD, never files,
arguments, env or logs; encryption/fixture restore tests are not a verified live
recoverability drill. Atomic transport models are not real Redis/Lua acceptance.

## v2: verified Codex findings and local fixes (original bundle preserved)

All three findings were reproduced first with failing mock regressions; the
reproduction log is outside the repo. No original frozen bundle was changed.

- P1: sandbox I/O now exposes its canonical publication root and exact card bytes.
  Validation captures base SHA, Git blob IDs and a plan digest. The check runner
  receives the exact cwd and must return its actual cwd receipt. `publish()`
  requires that bound receipt when synchronous checks are empty; it verifies
  exact file set/plan, worktree, base and raw bytes **before reconcile**. It repeats
  byte checks before staging, checks index blobs before each commit and committed
  blobs afterward. The helper repeats committed-byte/root checks at the publish
  boundary and pushes the verified **immutable SHA**, never a moving HEAD ref.
  Fresh checks/merge receipts still bind that head. Initial/resumed remote PR
  trees are checked against the expected card blob IDs using the official GitHub
  Git tree metadata API; missing/truncated/mismatched evidence refuses.
- P2: cancellation escalation is independent of npm/leader close/error. The
  promise does not finish cancel cleanup until group SIGKILL was attempted after
  the bounded grace period, so a leader exiting on TERM cannot cancel escalation
  against TERM-ignoring descendants. Tests mock the surviving-group case; this
  is not a live OS process-tree acceptance claim.
- P3: the file fixture adapter now **explicitly refuses** any nonempty imported
  journals/claims before scratch/operational initialization. It does not silently
  discard dedupe metadata or pretend to restore it. Empty legacy fixtures remain
  compatible. Publication-bearing fixtures must use the explicit validated new
  namespace import path (mock-tested only); full file-backend restore support is
  intentionally not claimed.

These fixes do not change legacy standalone CLI backend selection, enable any
cloud runner, accept a production namespace, or remove the draft/Mac patch cutover
blocker. All Git/GitHub/Redis/Vercel/spawn evidence in regressions remains mocked.


## V3 local review candidate — not promotion authorization

The sandbox entry now requires **two distinct explicit paths**: `scratch` is the private publication worktree; `artifacts` is a private directory outside that worktree and this checkout (no fallback/allowlist expansion). `collectState`, `reviewState`, `applyState` and `digestState` all use that external artifact sink. File-fixture and injected Redis-sandbox adapters share this contract. Existing CLI/production selection is NOT automatically enabled.

Publication binding checks working tree, index and committed changes relative to the validated base, rejects unrelated tracked edits and non-ignored untracked inputs **before reconciliation**, and repeats at PR-only transport authorization/write boundaries. Complete remote blob trees must equal the validated base plus planned card blobs; rollback uses a separately bound revert tree based on authoritative main. Ignored build outputs remain uncommitted, not an operational-state/artifact destination. The remote main SHA is reread before bound external writes; GitHub does not atomically fence a lease/owner/base check and an already-issued write. This is still journal/reconciliation, not exactly-once.

`publication-worktree.test.ts` creates temporary local repositories and genuine linked worktrees, uses actual Git status/stage/commit/blob/tree commands, and mocks ALL remote Git/GitHub/Vercel operations. It checks successful real stage integration, same-slot resume, external artifacts, dirty/staged/untracked source rejection before existing-PR merge, mutation during staging and immediately before merge, complete remote-tree mismatch, and cleanup/lease recovery. Process-group cancellation remains mock-tested, and nonempty restored fixture journals/claims remain explicitly rejected (not silently dropped).

No change has been committed, pushed, merged, dispatched, or installed on Mac. PR59 remains draft; mandatory flags/owner/new helper vs old Mac patch are a coordinated-cutover blocker. Real Redis/Lua/permissions/durability, source/browser parity, actual cloud runner/source validation and encrypted backup restore have NOT been accepted. Sandbox programmatic daily tests are not live migration acceptance. V3 Codex review output is stored outside this checkout and must be read together with its findings before promotion.


### V3 bounded Codex follow-up

The first V3 inspection accepted the original tree/reconcile and artifact-location fixes, then identified two deterministic interactions. This candidate preserves existing JSON bytes for semantically unchanged cards even though apply/resume passes the entire map. A genuine linked-worktree test uses two pretty-printed baseline cards and verifies the untouched card remains byte-identical across publish and resume.

`asyncOfferCheck` now creates a fresh private sibling HOME/cache/TMPDIR outside the publication worktree, never inherits user HOME, and removes it after success/error or completed cancellation escalation. The integration test invokes the actual async npm runner against inert, locally created fixture validate/build scripts (no operational scripts or network); npm logs and cache cannot dirty the publication tree. Existing mocked process-group kill regressions remain. This is one bounded follow-up repair round; any remaining Codex blocker must be reported, not treated as promotion permission.
