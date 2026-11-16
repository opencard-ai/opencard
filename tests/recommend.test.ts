import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getAllCards, type CreditCard } from "../lib/cards";
import * as welcomeOffer from "../lib/welcome-offer";
import * as foreignFee from "../lib/foreign-fee";
import * as otherBenefits from "../lib/other-benefits";
import type { scoreCards, UserPreferences } from "../lib/recommend";

test("travel recommendations ignore empty benefit entries but count meaningful legacy shapes", () => {
  const base = { ...getAllCards()[0], annual_fee: 0, insurance: {}, welcome_offer: undefined };
  const fixtures: CreditCard[] = [
    { ...base, card_id: "empty", travel_benefits: { other_benefits: [null, " ", {}] } },
    { ...base, card_id: "clean", travel_benefits: { other_benefits: ["Free bag"] } },
    { ...base, card_id: "padded", travel_benefits: { other_benefits: [null, " ", {}, { benefit: " Free bag " }] } },
  ];
  const modules: Record<string, unknown> = {
    "@/lib/cards": { getOpenCards: () => fixtures },
    "@/lib/welcome-offer": welcomeOffer,
    "@/lib/foreign-fee": foreignFee,
    "@/lib/other-benefits": otherBenefits,
  };
  const compiled = ts.transpileModule(readFileSync("lib/recommend.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const recommend: { scoreCards: typeof scoreCards } = vm.runInNewContext(`(function() { ${compiled}; return exports; })()`, {
    exports: {}, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  const prefs: UserPreferences = { rewardTypes: [], topCategories: [], annualFeeTolerance: 0, travelFrequency: 3, creditScore: "excellent" };
  const scores = new Map(recommend.scoreCards(prefs).map(item => [item.card.card_id, item.score]));
  assert.equal(scores.size, 3);
  assert.equal(scores.get("padded"), scores.get("clean"));
  assert.equal(scores.get("clean")! - scores.get("empty")!, 0.5);
  const infrequent = recommend.scoreCards({ ...prefs, travelFrequency: 2 });
  assert.equal(new Set(infrequent.map(item => item.score)).size, 1);
});
