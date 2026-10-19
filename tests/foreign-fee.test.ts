import assert from "node:assert/strict";
import { knownNoForeignFee } from "../lib/foreign-fee";
import { knownNoForeignFee as fromAnalysis } from "../lib/card-analysis";

assert.equal(fromAnalysis, knownNoForeignFee, "card-analysis re-exports the shared guard");
assert.equal(knownNoForeignFee({ foreign_transaction_fee: 0, tags: ["no-foreign-transaction-fee"] }), true);
assert.equal(knownNoForeignFee({ foreign_transaction_fee: 0, tags: [] }), false, "raw 0 default is not evidence");
assert.equal(knownNoForeignFee({ foreign_transaction_fee: 3, tags: ["no-foreign-transaction-fee"] }), false);
assert.equal(knownNoForeignFee({ foreign_transaction_fee: 0, tags: undefined as unknown as string[] }), false);
console.log("PASS foreign-fee guard");
